import { ConnectionManager } from "./connection.js";
import { appState, setState } from "./state.js";
import { toast } from "./components/toast.js";
import { confirmDialog } from "./components/modal.js";
import { showLoading, hideLoading } from "./components/loading-spinner.js";
import { renderHomePage } from "./pages/home.js";
import { renderPresetsPage } from "./pages/presets.js";
import { renderGlobalsPage } from "./pages/globals.js";
import { renderSystemPage } from "./pages/system.js";

const connection = new ConnectionManager();
const pageRoot = document.getElementById("page-root");
const nav = document.getElementById("main-nav");
const statusChip = document.getElementById("connection-status-chip");
const supportBadges = document.getElementById("support-badges");
const connectBtn = document.getElementById("btn-connect");
const disconnectBtn = document.getElementById("btn-disconnect");
const hint = document.getElementById("connection-hint");

let protocol = null;
let currentRoute = "home";

const routes = {
  home: renderHomePage,
  presets: renderPresetsPage,
  globals: renderGlobalsPage,
  system: renderSystemPage,
};

function renderSupport() {
  const support = connection.getSupport();
  setState({ supports: support });

  supportBadges.innerHTML = "";
  [
    ["WebMIDI", support.webMidi],
    ["WebSerial", support.webSerial],
  ].forEach(([label, ok]) => {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.dataset.supported = String(ok);
    badge.textContent = `${label}: ${ok ? "OK" : "NAO"}`;
    supportBadges.appendChild(badge);
  });

  if (!support.webSerial) {
    hint.textContent = "Este navegador nao suporta Web Serial. Use Chrome/Edge desktop.";
  }
}

function setStatus(state, message) {
  setState({ connectionStatus: state, connectionMessage: message });
  statusChip.dataset.state = state;

  if (state === "conectado") {
    statusChip.textContent = "Conectado";
  } else if (state === "conectando") {
    statusChip.textContent = "Conectando";
  } else if (state === "erro") {
    statusChip.textContent = "Erro";
  } else {
    statusChip.textContent = "Desconectado";
  }

  if (message) {
    hint.textContent = message;
  }

  const isConnected = state === "conectado";
  connectBtn.disabled = isConnected || state === "conectando";
  disconnectBtn.disabled = !isConnected;
  nav.hidden = !isConnected;
}

function markActiveNav(route) {
  nav.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.route === route);
  });
}

async function navigate(route) {
  const target = routes[route] ? route : "home";
  currentRoute = target;
  markActiveNav(target);

  if (!protocol) {
    pageRoot.innerHTML = "<p>Conecte o dispositivo para continuar.</p>";
    return;
  }

  const ctx = {
    protocol,
    navigate,
    disconnect,
    toast,
    confirmDialog,
    showLoading,
    hideLoading,
    state: appState,
  };

  await routes[target](pageRoot, ctx);
}

async function connect() {
  setStatus("conectando", "Tentando conexao WebMIDI -> WebSerial...");
  showLoading("Conectando...");

  try {
    const result = await connection.connect();
    protocol = result.protocol;

    if (result.midiWarn) {
      toast(`Aviso MIDI: ${result.midiWarn.message}`, "info");
    }

    setStatus("conectado", "Conexao estabelecida com o firmware.");
    location.hash = "#home";
    await navigate("home");
  } catch (error) {
    setStatus("erro", `Falha de conexao: ${error.message}`);
    toast(`Erro ao conectar: ${error.message}`, "error");
  } finally {
    hideLoading();
  }
}

async function disconnect() {
  showLoading("Desconectando...");

  try {
    await connection.desconectar();
  } catch {
    // noop
  } finally {
    protocol = null;
    pageRoot.innerHTML = "<p>Desconectado.</p>";
    setStatus("desconectado", "Conexao encerrada.");
    hideLoading();
  }
}

connectBtn.addEventListener("click", connect);
disconnectBtn.addEventListener("click", disconnect);

nav.querySelectorAll(".nav-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const route = button.dataset.route;
    location.hash = `#${route}`;
  });
});

window.addEventListener("hashchange", () => {
  const route = (location.hash || "#home").replace("#", "");
  navigate(route).catch((error) => {
    toast(`Erro de navegacao: ${error.message}`, "error");
  });
});

connection.addEventListener("log", (event) => {
  const detail = event.detail;
  if (typeof detail === "string") {
    return;
  }

  if (detail?.type === "error") {
    toast(detail.message, "error");
  }
});

renderSupport();
setStatus("desconectado", "Aguardando conexao USB.");
pageRoot.innerHTML = "<p>Conecte o dispositivo para iniciar.</p>";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // noop
    });
  });
}

if (location.hash) {
  const route = location.hash.replace("#", "");
  markActiveNav(route);
}
