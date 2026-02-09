import { BFMIDIProtocol } from "./protocol.js";

const SYSEX_ENTER_EDITOR = [0xf0, 0x7d, 0x42, 0x46, 0x01, 0xf7];
const SYSEX_EXIT_EDITOR = [0xf0, 0x7d, 0x42, 0x46, 0x00, 0xf7];

// Identificadores exatos do produto BFMIDI
const BFMIDI_VID = 0x303a;
const BFMIDI_PID = 0x80c2;

const SERIAL_PORT_FILTERS = [
  { usbVendorId: 0x303a }, // Espressif (ESP32-S2/S3 native USB) — inclui BFMIDI
  { usbVendorId: 0x10c4 }, // Silicon Labs (CP210x)
  { usbVendorId: 0x1a86 }, // QinHeng (CH340/CH341/CH343)
  { usbVendorId: 0x0403 }, // FTDI (FT232/FT2232)
  { usbVendorId: 0x2341 }, // Arduino
  { usbVendorId: 0x067b }, // Prolific (PL2303)
  { usbVendorId: 0x04d8 }, // Microchip (MCP2200/MCP2221)
  { usbVendorId: 0x2e8a }, // Raspberry Pi (RP2040 bridge boards)
  { usbVendorId: 0x239a }, // Adafruit
  { usbVendorId: 0x1915 }, // Nordic Semiconductor
];

const KNOWN_ESP_VENDORS = new Set(SERIAL_PORT_FILTERS.map((f) => f.usbVendorId));

const STORAGE_KEY_PORT = "bfmidi_last_port";

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

function isBfmidiPort(info = {}) {
  return info.usbVendorId === BFMIDI_VID && info.usbProductId === BFMIDI_PID;
}

function looksLikeEspPort(info = {}) {
  if (!Number.isInteger(info.usbVendorId)) {
    return false;
  }
  return KNOWN_ESP_VENDORS.has(info.usbVendorId);
}

function saveLastPortInfo(info) {
  try {
    if (info && Number.isInteger(info.usbVendorId)) {
      localStorage.setItem(
        STORAGE_KEY_PORT,
        JSON.stringify({
          vid: info.usbVendorId,
          pid: info.usbProductId || 0,
          ts: Date.now(),
        })
      );
    }
  } catch {
    // localStorage pode estar indisponivel
  }
}

function loadLastPortInfo() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PORT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Expira apos 90 dias
    if (Date.now() - (parsed.ts || 0) > 90 * 24 * 3600 * 1000) {
      localStorage.removeItem(STORAGE_KEY_PORT);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function portMatchesSaved(portInfo, saved) {
  if (!saved || !portInfo) return false;
  return (
    portInfo.usbVendorId === saved.vid && portInfo.usbProductId === saved.pid
  );
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
    const savedInfo = loadLastPortInfo();

    if (grantedPorts.length > 0) {
      // 1. Prioridade absoluta: VID/PID exato do BFMIDI (0x303a:0x80c2)
      const exactBfmidi = grantedPorts.find((port) =>
        isBfmidiPort(port.getInfo?.() || {})
      );
      if (exactBfmidi) {
        this.#emitLog({
          type: "info",
          message: "BFMIDI detectado por VID/PID exato (0x303a:0x80c2)",
        });
        return exactBfmidi;
      }

      // 2. Porta que corresponde ao ultimo VID/PID bem sucedido
      if (savedInfo) {
        const savedMatch = grantedPorts.find((port) =>
          portMatchesSaved(port.getInfo?.() || {}, savedInfo)
        );
        if (savedMatch) {
          this.#emitLog({
            type: "info",
            message: `Porta reconhecida do ultimo uso (VID=0x${savedInfo.vid.toString(16).padStart(4, "0")} PID=0x${savedInfo.pid.toString(16).padStart(4, "0")})`,
          });
          return savedMatch;
        }
      }

      // 3. Porta com VID de ESP/USB-UART conhecida
      const espPorts = grantedPorts.filter((port) =>
        looksLikeEspPort(port.getInfo?.() || {})
      );

      if (espPorts.length === 1) {
        this.#emitLog({
          type: "info",
          message: "Usando porta serial previamente autorizada (ESP detectado)",
        });
        return espPorts[0];
      }

      if (espPorts.length > 1) {
        // Mais de uma porta ESP; tenta Espressif nativo (0x303a) primeiro
        const espressifNative = espPorts.find(
          (port) => (port.getInfo?.() || {}).usbVendorId === 0x303a
        );
        if (espressifNative) {
          this.#emitLog({
            type: "info",
            message:
              "Varias portas ESP encontradas; priorizando Espressif nativo (0x303a)",
          });
          return espressifNative;
        }
      }

      // 4. Unica porta autorizada (mesmo sem VID ESP)
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
          "Varias portas autorizadas sem match claro. Selecione manualmente no chooser.",
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

  async #requestSerialPortManual() {
    this.#emitLog({
      type: "warn",
      message: "Abrindo seletor manual de porta serial...",
    });

    try {
      return await navigator.serial.requestPort({ filters: SERIAL_PORT_FILTERS });
    } catch (error) {
      if (error && error.name === "TypeError") {
        return navigator.serial.requestPort();
      }
      throw error;
    }
  }

  async #openProtocol(port) {
    this.serialPort = port;
    this.lastSelectedPortInfo = port?.getInfo?.() || null;

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

    // Sinaliza DTR para evitar modo bootloader em alguns ESP32 boards
    try {
      if (typeof this.serialPort.setSignals === "function") {
        await this.serialPort.setSignals({
          dataTerminalReady: true,
          requestToSend: false,
        });
      }
    } catch {
      // Nem todos os drivers suportam setSignals
    }

    // Drena qualquer lixo do buffer serial antes de comecar
    await this.protocol.drainReadBuffer(300);
  }

  async #closeProtocol() {
    if (this.protocol) {
      try {
        await this.protocol.close();
      } catch {
        // noop
      }
    }
    this.protocol = null;
    this.serialPort = null;
  }

  async conectarSerial() {
    if (!navigator.serial) {
      throw new Error("Web Serial nao suportado neste navegador");
    }

    const port = await this.#requestSerialPortWithHeuristics();
    await this.#openProtocol(port);
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
    const MAX_ROUNDS = 10;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      try {
        this.#emitLog({
          type: "info",
          message: `Tentando ping serial (${round + 1}/${MAX_ROUNDS})...`,
        });

        const ping = await this.testarConexao({
          timeoutMs: 1400,
          retries: 1,
        });

        return ping;
      } catch (error) {
        lastError = error;
      }

      // Reenvia SysEx ENTER via MIDI em rounds estrategicos
      if (round === 1 || round === 3 || round === 5 || round === 7) {
        await this.#tentarAtivarModoEditorViaMidi();
      }

      // Backoff progressivo: 300ms nos primeiros rounds, 500ms depois
      await delay(round < 4 ? 300 : 500);
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

    // Tenta detectar o BFMIDI na porta auto-selecionada.
    // Se falhar, fecha e pede selecao manual ao usuario.
    let ping;
    try {
      ping = await this.#aguardarEditorAtivo();
    } catch (firstError) {
      this.#emitLog({
        type: "warn",
        message:
          "Nao foi possivel conectar na porta auto-detectada. Tentando selecao manual...",
      });

      // Fecha a porta que nao respondeu
      await this.#closeProtocol();

      // Abre seletor manual do navegador
      try {
        const manualPort = await this.#requestSerialPortManual();
        await this.#openProtocol(manualPort);

        // Reenvia SysEx apos abrir nova porta
        if (support.webMidi) {
          await this.#tentarAtivarModoEditorViaMidi();
        }

        ping = await this.#aguardarEditorAtivo();
      } catch (secondError) {
        // Se a segunda tentativa tambem falhou, relata ambos erros
        throw new Error(
          `Falha na conexao. Auto: ${firstError.message} | Manual: ${secondError.message}`
        );
      }
    }

    // Conexao bem sucedida: salva VID/PID para proximo uso
    if (this.lastSelectedPortInfo) {
      saveLastPortInfo(this.lastSelectedPortInfo);
    }

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
