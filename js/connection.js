import { BFMIDIProtocol } from "./protocol.js";

const SYSEX_ENTER_EDITOR = [0xf0, 0x7d, 0x42, 0x46, 0x01, 0xf7];
const SYSEX_EXIT_EDITOR = [0xf0, 0x7d, 0x42, 0x46, 0x00, 0xf7];

const SERIAL_PORT_FILTERS = [
  { usbVendorId: 0x303a }, // Espressif
  { usbVendorId: 0x10c4 }, // Silicon Labs
  { usbVendorId: 0x1a86 }, // QinHeng/CH34x
  { usbVendorId: 0x0403 }, // FTDI
  { usbVendorId: 0x2341 }, // Arduino
];

const KNOWN_ESP_VENDORS = new Set([0x303a, 0x10c4, 0x1a86, 0x0403, 0x2341]);

const delay = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

function formatUsbInfo(info = {}) {
  const vid = Number.isInteger(info.usbVendorId)
    ? `0x${info.usbVendorId.toString(16).padStart(4, "0")}`
    : "n/a";
  const pid = Number.isInteger(info.usbProductId)
    ? `0x${info.usbProductId.toString(16).padStart(4, "0")}`
    : "n/a";
  return `VID=${vid} PID=${pid}`;
}

function looksLikeEspPort(info = {}) {
  if (!Number.isInteger(info.usbVendorId)) {
    return false;
  }
  return KNOWN_ESP_VENDORS.has(info.usbVendorId);
}

export class ConnectionManager extends EventTarget {
  constructor() {
    super();
    this.midiAccess = null;
    this.midiOutput = null;
    this.midiOutputs = [];
    this.serialPort = null;
    this.protocol = null;
    this.lastSelectedPortInfo = null;
  }

  #emitLog(detail) {
    this.dispatchEvent(new CustomEvent("log", { detail }));
  }

  getSupport() {
    return {
      webMidi: Boolean(navigator.requestMIDIAccess),
      webSerial: Boolean(navigator.serial),
    };
  }

  async conectarViaMIDI() {
    if (!navigator.requestMIDIAccess) {
      throw new Error("WebMIDI nao suportado neste navegador");
    }

    this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });

    const outputs = Array.from(this.midiAccess.outputs.values());
    this.midiOutputs = outputs;

    if (!outputs.length) {
      throw new Error("Nenhuma saida MIDI encontrada");
    }

    const preferred = outputs.find((item) =>
      (item.name || "").toLowerCase().includes("bfmidi")
    );

    this.midiOutput = preferred || outputs[0];

    const outputsLabel = outputs
      .map((item) => item.name || "(sem nome)")
      .join(" | ");

    this.#emitLog({
      type: "info",
      message: `MIDI outputs: ${outputsLabel}`,
    });

    this.#emitLog({
      type: "info",
      message: `Saida MIDI selecionada: ${this.midiOutput.name || "desconhecida"}`,
    });

    return this.midiOutput;
  }

  #enviarSysExParaSaida(output, enter = true) {
    if (!output || typeof output.send !== "function") {
      return;
    }

    const payload = enter ? SYSEX_ENTER_EDITOR : SYSEX_EXIT_EDITOR;
    output.send(payload);
  }

  enviarSysExTrocaModo(enter = true, { broadcast = false } = {}) {
    const targets = broadcast
      ? this.midiOutputs.filter(Boolean)
      : [this.midiOutput].filter(Boolean);

    if (!targets.length) {
      throw new Error("Saida MIDI nao inicializada");
    }

    targets.forEach((output) => this.#enviarSysExParaSaida(output, enter));

    this.#emitLog({
      type: "info",
      message: `${enter ? "SysEx ENTER" : "SysEx EXIT"} enviado para ${targets.length} porta(s) MIDI`,
    });
  }

  async #requestSerialPortWithHeuristics() {
    const grantedPorts = await navigator.serial.getPorts();

    if (grantedPorts.length > 0) {
      const preferredGranted = grantedPorts.find((port) =>
        looksLikeEspPort(port.getInfo?.() || {})
      );

      if (preferredGranted) {
        this.#emitLog({
          type: "info",
          message: "Usando porta serial previamente autorizada (ESP detectado)",
        });
        return preferredGranted;
      }

      if (grantedPorts.length === 1) {
        this.#emitLog({
          type: "warn",
          message:
            "Apenas uma porta autorizada encontrada; validando se eh o BFMIDI...",
        });
        return grantedPorts[0];
      }

      this.#emitLog({
        type: "warn",
        message:
          "Varias portas autorizadas sem assinatura ESP. Selecione manualmente no chooser.",
      });
    }

    try {
      return await navigator.serial.requestPort({ filters: SERIAL_PORT_FILTERS });
    } catch (error) {
      // Alguns ambientes antigos podem nao aceitar filtros; fallback sem filtro.
      if (error && error.name === "TypeError") {
        return navigator.serial.requestPort();
      }
      throw error;
    }
  }

  async conectarSerial() {
    if (!navigator.serial) {
      throw new Error("Web Serial nao suportado neste navegador");
    }

    this.serialPort = await this.#requestSerialPortWithHeuristics();
    this.lastSelectedPortInfo = this.serialPort?.getInfo?.() || null;

    this.#emitLog({
      type: "info",
      message: `Porta serial selecionada (${formatUsbInfo(this.lastSelectedPortInfo || {})})`,
    });

    this.protocol = new BFMIDIProtocol({
      port: this.serialPort,
      baudRate: 115200,
      timeoutMs: 7000,
    });

    this.protocol.addEventListener("log", (event) => {
      this.#emitLog(event.detail);
    });

    await this.protocol.open();
    return this.protocol;
  }

  async testarConexao({ timeoutMs = 1500, retries = 1, retryDelayMs = 250 } = {}) {
    if (!this.protocol) {
      throw new Error("Protocolo serial nao conectado");
    }

    const previousTimeout = this.protocol.timeoutMs;
    this.protocol.timeoutMs = timeoutMs;

    try {
      let lastError = null;

      for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
          const response = await this.protocol.enviarComando("ping");
          if (!response?.ok) {
            throw new Error(response?.error || "Ping respondeu com erro");
          }
          return response;
        } catch (error) {
          lastError = error;
          if (attempt < retries) {
            await delay(retryDelayMs);
          }
        }
      }

      throw lastError || new Error("Ping sem resposta");
    } finally {
      this.protocol.timeoutMs = previousTimeout;
    }
  }

  async #tentarAtivarModoEditorViaMidi() {
    try {
      if (!this.midiAccess || !this.midiOutputs.length) {
        await this.conectarViaMIDI();
      }

      this.enviarSysExTrocaModo(true, { broadcast: true });
      await delay(180);
      this.enviarSysExTrocaModo(true, { broadcast: true });
      return true;
    } catch (error) {
      this.#emitLog({
        type: "warn",
        message: `Nao foi possivel ativar modo editor via MIDI: ${error.message}`,
      });
      return false;
    }
  }

  async #aguardarEditorAtivo() {
    let lastError = null;

    for (let round = 0; round < 7; round += 1) {
      try {
        this.#emitLog({
          type: "info",
          message: `Tentando ping serial (${round + 1}/7)...`,
        });

        const ping = await this.testarConexao({
          timeoutMs: 1400,
          retries: 1,
        });

        return ping;
      } catch (error) {
        lastError = error;
      }

      if (round === 1 || round === 3 || round === 5) {
        await this.#tentarAtivarModoEditorViaMidi();
      }

      await delay(420);
    }

    throw new Error(
      `Sem resposta do firmware no modo editor (${lastError?.message || "ping falhou"})`
    );
  }

  async connect() {
    const support = this.getSupport();
    let midiWarn = null;

    if (support.webMidi) {
      try {
        await this.conectarViaMIDI();
        await this.#tentarAtivarModoEditorViaMidi();
        await delay(900);
      } catch (error) {
        midiWarn = error;
        this.#emitLog({
          type: "warn",
          message: `Falha na etapa MIDI: ${error.message}`,
        });
      }
    } else {
      this.#emitLog({
        type: "warn",
        message: "WebMIDI indisponivel; tentando apenas serial",
      });
    }

    await this.conectarSerial();

    // Com a serial aberta, tenta novamente acionar ENTER editor por MIDI.
    if (support.webMidi) {
      await this.#tentarAtivarModoEditorViaMidi();
    }

    const ping = await this.#aguardarEditorAtivo();

    return {
      protocol: this.protocol,
      ping,
      midiWarn,
      portInfo: this.lastSelectedPortInfo,
    };
  }

  async desconectar() {
    try {
      if (this.protocol) {
        try {
          await this.protocol.enviarComando("exit_editor");
        } catch {
          // noop
        }
      }

      if (this.protocol) {
        await this.protocol.close();
      }

      try {
        this.enviarSysExTrocaModo(false, { broadcast: true });
      } catch {
        // noop
      }
    } finally {
      this.protocol = null;
      this.serialPort = null;
      this.midiAccess = null;
      this.midiOutput = null;
      this.midiOutputs = [];
      this.lastSelectedPortInfo = null;
    }
  }
}
