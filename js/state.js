export const appState = {
  connectionStatus: "desconectado",
  connectionMessage: "Aguardando conexao USB",
  supports: {
    webMidi: false,
    webSerial: false,
  },
  firmwareInfo: null,
  globalConfig: null,
  boardConfig: null,
  currentPresetRef: {
    btn: 0,
    lvl: 0,
    layer: 1,
  },
  currentPreset: null,
};

const listeners = new Set();

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(patch) {
  Object.assign(appState, patch);
  listeners.forEach((listener) => listener(appState));
}

export function updateState(updater) {
  const next = updater({ ...appState });
  if (next && typeof next === "object") {
    setState(next);
  }
}
