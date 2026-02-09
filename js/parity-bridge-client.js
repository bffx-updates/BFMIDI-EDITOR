(function () {
  const ALLOWED_EXTERNAL_ORIGINS = new Set(["http://192.168.4.1"]);

  function normalizeUrl(input) {
    if (typeof input === "string") {
      return new URL(input, window.location.origin);
    }
    if (input && typeof input.url === "string") {
      return new URL(input.url, window.location.origin);
    }
    return null;
  }

  function shouldIntercept(url) {
    if (!url) {
      return false;
    }

    const sameOrigin = url.origin === window.location.origin;
    const allowedExternalOrigin = ALLOWED_EXTERNAL_ORIGINS.has(url.origin);
    if (!sameOrigin && !allowedExternalOrigin) {
      return false;
    }

    const path = url.pathname;
    if (path === "/savesystem") {
      return true;
    }
    if (path === "/get-single-preset-data") {
      return true;
    }
    if (path === "/save-single-preset-data") {
      return true;
    }
    if (path === "/refresh-display-only") {
      return true;
    }
    if (path === "/set-active-config-preset") {
      return true;
    }
    if (path.startsWith("/api/")) {
      return true;
    }

    return false;
  }

  async function requestToInitObject(input, init) {
    if (init) {
      return {
        method: init.method,
        headers: init.headers,
        body: init.body,
      };
    }

    if (input instanceof Request) {
      const headers = {};
      input.headers.forEach((value, key) => {
        headers[key] = value;
      });

      let body;
      const method = String(input.method || "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        body = await input.clone().text();
      }

      return {
        method,
        headers,
        body,
      };
    }

    return {};
  }

  function getParentBridge() {
    if (!window.parent || window.parent === window) {
      return null;
    }
    const bridge = window.parent.BFMIDIExternalBridge;
    if (!bridge || typeof bridge.request !== "function") {
      return null;
    }
    return bridge;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function bfmidiBridgeFetch(input, init) {
    const url = normalizeUrl(input);
    if (!shouldIntercept(url)) {
      return originalFetch(input, init);
    }

    const bridge = getParentBridge();
    if (!bridge) {
      return Promise.reject(
        new Error("Bridge USB indisponivel. Volte para a pagina principal e clique em Conectar.")
      );
    }

    const requestInit = await requestToInitObject(input, init);
    const result = await bridge.request(url.toString(), requestInit);

    return new Response(result?.body ?? "", {
      status: result?.status ?? 200,
      headers: result?.headers ?? {},
    });
  };

  async function syncSystemBoardState() {
    const path = window.location.pathname;
    if (!(path === "/system" || path === "/system/" || path.endsWith("/system/index.html"))) {
      return;
    }

    try {
      const response = await window.fetch("/api/system/info");
      if (!response.ok) {
        return;
      }
      const info = await response.json();

      const boardSelect = document.getElementById("board-select");
      if (boardSelect && info.boardName) {
        boardSelect.value = String(info.boardName);
        boardSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }

      const invertTelaInput = document.getElementById("invertTela");
      if (invertTelaInput) {
        invertTelaInput.value = info.invertTela ? "1" : "0";
      }

      if (typeof window.updateTelaOrientacaoButton === "function") {
        window.updateTelaOrientacaoButton();
      }
    } catch {
      // noop
    }
  }

  window.addEventListener("load", () => {
    window.setTimeout(syncSystemBoardState, 120);
  });
})();
