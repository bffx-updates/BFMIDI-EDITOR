import { ConnectionManager } from "./connection.js";
import { ParityBridgeHost } from "./parity-bridge-host.js";

if (window.parent && window.parent !== window) {
  window.location.replace("/main/");
}


const connection = new ConnectionManager();
let protocol = null;

const bridgeHost = new ParityBridgeHost(() => protocol);

const editorFrameEl = document.getElementById("editorFrame");
const toolbarStatusEl = document.getElementById("toolbarStatus");
const btnToolbarConnectEl = document.getElementById("btnToolbarConnect");
const btnToolbarDisconnectEl = document.getElementById("btnToolbarDisconnect");
const serialLogsEl = document.getElementById("serialLogs");

const logLines = [];
const MAX_LOG_LINES = 80;

window.BFMIDIExternalBridge = {
  request: (rawUrl, init) => bridgeHost.request(rawUrl, init),
  isConnected: () => bridgeHost.isConnected(),
};

function appendLog(message, level = "info") {
  if (!serialLogsEl) {
    return;
  }

  const ts = new Date().toLocaleTimeString("pt-BR", { hour12: false });
  const prefix = level.toUpperCase();
  const line = `[${ts}] [${prefix}] ${message}`;

  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES) {
    logLines.shift();
  }

  bridgeHost.pushMonitorEntry(line, level);

  serialLogsEl.textContent = logLines.join("\n");
  serialLogsEl.scrollTop = serialLogsEl.scrollHeight;
}

function setStatus(state, message) {
  toolbarStatusEl.dataset.state = state;

  if (state === "connected") {
    toolbarStatusEl.textContent = "Conectado";
  } else if (state === "connecting") {
    toolbarStatusEl.textContent = "Conectando";
  } else if (state === "error") {
    toolbarStatusEl.textContent = "Erro";
  } else {
    toolbarStatusEl.textContent = "Desconectado";
  }

  const connected = state === "connected";
  const connecting = state === "connecting";
  btnToolbarConnectEl.disabled = connected || connecting;
  btnToolbarDisconnectEl.disabled = !connected;

  if (message) {
    appendLog(message, state === "error" ? "error" : "info");
  }
}

function reloadEditorFrameAfterConnect() {
  if (!editorFrameEl) {
    return;
  }

  const hasSource = Boolean(editorFrameEl.src) && editorFrameEl.src !== "about:blank";
  if (!hasSource) {
    editorFrameEl.src = "/main/";
    return;
  }

  try {
    editorFrameEl.contentWindow?.location.reload();
  } catch {
    editorFrameEl.src = "/main/";
  }
}

async function connect() {
  setStatus("connecting", "Conectando via WebMIDI -> WebSerial...");

  try {
    const result = await connection.connect();
    protocol = result.protocol;

    if (result.midiWarn) {
      appendLog(`Aviso MIDI: ${result.midiWarn.message}`, "warn");
    }

    if (result.portInfo) {
      const vid = Number.isInteger(result.portInfo.usbVendorId)
        ? `0x${result.portInfo.usbVendorId.toString(16).padStart(4, "0")}`
        : "n/a";
      const pid = Number.isInteger(result.portInfo.usbProductId)
        ? `0x${result.portInfo.usbProductId.toString(16).padStart(4, "0")}`
        : "n/a";
      appendLog(`Porta ativa ${vid}:${pid}`, "info");
    }

    setStatus("connected", "Conexao estabelecida. Editor ativo.");
    reloadEditorFrameAfterConnect();
  } catch (error) {
    protocol = null;
    setStatus("error", `Falha na conexao: ${error.message}`);
  }
}

async function disconnect() {
  try {
    await connection.desconectar();
  } catch {
    // noop
  } finally {
    protocol = null;
    setStatus("disconnected", "Conexao encerrada.");
  }
}

btnToolbarConnectEl.addEventListener("click", connect);
btnToolbarDisconnectEl.addEventListener("click", disconnect);

connection.addEventListener("log", (event) => {
  const detail = event.detail;

  if (typeof detail === "string") {
    appendLog(detail, "info");
    return;
  }

  if (!detail || typeof detail !== "object") {
    return;
  }

  const type = detail.type || "info";
  const msg = detail.message || JSON.stringify(detail);

  if (type === "error") {
    setStatus("error", msg);
    return;
  }

  if (type === "warn") {
    appendLog(msg, "warn");
    return;
  }

  if (type === "serial") {
    appendLog(msg, "serial");
    return;
  }

  appendLog(msg, "info");
});

appendLog("MainScreen carregada. Clique em Conectar para iniciar o link USB.", "info");
setStatus("disconnected", "Aguardando conexao.");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // noop
    });
  });
}
