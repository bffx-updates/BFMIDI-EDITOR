export class BFMIDIProtocol extends EventTarget {
  constructor({ port, baudRate = 115200, timeoutMs = 6000 } = {}) {
    super();
    this.port = port;
    this.baudRate = baudRate;
    this.timeoutMs = timeoutMs;

    this.reader = null;
    this.writer = null;
    this.decoder = new TextDecoder();
    this.encoder = new TextEncoder();

    this.readBuffer = "";
    this.readLoopTask = null;
    this.pending = null;
    this.queue = Promise.resolve();
    this.isOpen = false;
  }

  async open() {
    if (!this.port) {
      throw new Error("Porta serial nao definida");
    }

    if (!this.port.readable || !this.port.writable) {
      await this.port.open({ baudRate: this.baudRate });
    }

    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.readLoopTask = this.#readLoop();
    this.isOpen = true;
  }

  async close() {
    this.isOpen = false;

    if (this.pending) {
      window.clearTimeout(this.pending.timeoutId);
      this.pending.reject(new Error("Conexao encerrada"));
      this.pending = null;
    }

    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // noop
      }
      this.reader.releaseLock();
      this.reader = null;
    }

    if (this.writer) {
      try {
        await this.writer.close();
      } catch {
        // noop
      }
      this.writer.releaseLock();
      this.writer = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch {
        // noop
      }
    }
  }

  async enviarComando(cmd, params = {}) {
    if (!cmd) {
      throw new Error("Comando vazio");
    }

    this.queue = this.queue
      .catch(() => undefined)
      .then(() => this.#enviarComandoInterno(cmd, params));
    return this.queue;
  }

  async #enviarComandoInterno(cmd, params) {
    if (!this.isOpen || !this.writer) {
      throw new Error("Protocolo serial nao esta aberto");
    }

    if (this.pending) {
      throw new Error("Ja existe um comando pendente");
    }

    const payload = JSON.stringify({ cmd, ...params }) + "\n";
    await this.writer.write(this.encoder.encode(payload));

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pending = null;
        reject(new Error(`Timeout aguardando resposta de '${cmd}'`));
      }, this.timeoutMs);

      this.pending = { cmd, resolve, reject, timeoutId };
    });
  }

  async #readLoop() {
    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) {
          break;
        }

        if (!value) {
          continue;
        }

        this.readBuffer += this.decoder.decode(value, { stream: true });
        this.#processReadBuffer();
      }
    } catch (error) {
      this.dispatchEvent(new CustomEvent("log", {
        detail: { type: "error", message: `Falha no read loop: ${error.message}` }
      }));
      if (this.pending) {
        window.clearTimeout(this.pending.timeoutId);
        this.pending.reject(error);
        this.pending = null;
      }
    }
  }

  #processReadBuffer() {
    let newlineIndex = this.readBuffer.indexOf("\n");

    while (newlineIndex !== -1) {
      const line = this.readBuffer.slice(0, newlineIndex).trim();
      this.readBuffer = this.readBuffer.slice(newlineIndex + 1);
      this.#handleLine(line);
      newlineIndex = this.readBuffer.indexOf("\n");
    }
  }

  #handleLine(line) {
    if (!line) {
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.dispatchEvent(new CustomEvent("log", {
        detail: { type: "serial", message: line }
      }));
      return;
    }

    this.dispatchEvent(new CustomEvent("message", { detail: parsed }));

    if (this.pending) {
      window.clearTimeout(this.pending.timeoutId);
      const { resolve } = this.pending;
      this.pending = null;
      resolve(parsed);
    }
  }

  /**
   * Drena dados pendentes no buffer serial por `ms` milissegundos.
   * Util para limpar lixo acumulado antes de enviar o primeiro comando.
   */
  async drainReadBuffer(ms = 300) {
    const before = this.readBuffer.length;
    await new Promise((resolve) => window.setTimeout(resolve, ms));
    const after = this.readBuffer.length;
    const drained = after - before;

    if (drained > 0 || before > 0) {
      this.readBuffer = "";
      this.dispatchEvent(
        new CustomEvent("log", {
          detail: {
            type: "info",
            message: `Buffer serial drenado (${before + drained} bytes descartados)`,
          },
        })
      );
    }
  }

  receberResposta() {
    return new Promise((resolve) => {
      const handler = (event) => {
        this.removeEventListener("message", handler);
        resolve(event.detail);
      };
      this.addEventListener("message", handler);
    });
  }
}
