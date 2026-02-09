const JSON_TYPE = "application/json; charset=utf-8";
const TEXT_TYPE = "text/plain; charset=utf-8";

function jsonResult(data, status = 200) {
  return {
    status,
    headers: { "content-type": JSON_TYPE },
    body: JSON.stringify(data),
  };
}

function textResult(text, status = 200, contentType = TEXT_TYPE) {
  return {
    status,
    headers: { "content-type": contentType },
    body: text,
  };
}

function intParam(searchParams, key, fallback = 0) {
  const raw = searchParams.get(key);
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function boolFromParam(value, fallback = false) {
  if (value === null || value === undefined) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "on", "yes"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "off", "no"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseJsonBody(body) {
  if (body === undefined || body === null) {
    return {};
  }
  if (typeof body === "object") {
    return body;
  }
  if (typeof body !== "string" || body.trim().length === 0) {
    return {};
  }
  return JSON.parse(body);
}

export class ParityBridgeHost {
  constructor(getProtocol) {
    this.getProtocol = getProtocol;
    this.infoCache = null;
    this.monitorSeq = 0;
    this.monitorBuffer = [];
    this.maxMonitorBuffer = 350;
  }

  isConnected() {
    return Boolean(this.getProtocol && this.getProtocol());
  }

  pushMonitorEntry(message, level = "info") {
    const text = String(message ?? "").trim();
    if (!text) {
      return;
    }

    this.monitorSeq += 1;
    this.monitorBuffer.push({
      id: this.monitorSeq,
      ts: new Date().toISOString(),
      level: String(level || "info"),
      message: text,
    });

    if (this.monitorBuffer.length > this.maxMonitorBuffer) {
      this.monitorBuffer.shift();
    }
  }

  clearMonitorEntries() {
    this.monitorBuffer = [];
  }

  async callCommand(cmd, params = {}) {
    const protocol = this.getProtocol ? this.getProtocol() : null;
    if (!protocol) {
      throw new Error("Editor USB desconectado. Clique em Conectar na barra superior.");
    }

    const response = await protocol.enviarComando(cmd, params);
    if (!response || response.ok !== true) {
      throw new Error(response?.error || `Falha no comando '${cmd}'.`);
    }
    return response.data || {};
  }

  async getInfoData(force = false) {
    const now = Date.now();
    if (!force && this.infoCache && now - this.infoCache.timeMs < 600) {
      return this.infoCache.data;
    }

    const [info, board] = await Promise.all([
      this.callCommand("get_info"),
      this.callCommand("get_board").catch(() => ({})),
    ]);

    const merged = {
      ...info,
      boardName: board.boardName || info.boardName,
      invertTela:
        typeof board.invertTela === "boolean"
          ? board.invertTela
          : Boolean(info.invertTela),
    };

    this.infoCache = { timeMs: now, data: merged };
    return merged;
  }

  mapSystemInfo(info) {
    const nvs = info.nvs || {};
    const totalEntries = Number(nvs.totalEntries || 0);
    const usedEntries = Number(nvs.usedEntries || 0);

    // NVS bytes nao estao no protocolo serial; aproximacao por entrada para manter os cards do SYSTEM funcionais.
    const approxTotalBytes = Math.max(0, totalEntries * 32);
    const approxUsedBytes = Math.max(0, usedEntries * 32);
    const approxFreeBytes = Math.max(0, approxTotalBytes - approxUsedBytes);

    return {
      firmwareVersion: info.firmwareVersion || "UNKNOWN",
      resetReasonCode: Number.isFinite(info.resetReasonCode)
        ? info.resetReasonCode
        : 0,
      resetReason: info.resetReason || "UNKNOWN",
      nvs: {
        totalBytes: approxTotalBytes,
        usedBytes: approxUsedBytes,
        freeBytes: approxFreeBytes,
        usedPercent: Number(nvs.usedPercent || 0),
      },
      uptimeSeconds: Math.floor(Number(info.uptimeMs || 0) / 1000),
      apIp: "192.168.4.1",
      apOnlyMode: true,
      captivePortal: false,
      ip: "192.168.4.1",
      boardName: info.boardName || "BFMIDI-2 6S",
      invertTela: Boolean(info.invertTela),
      usbHostStatus: info.usbHostStatus || "Desconectado",
      usbHostConnected: Boolean(info.usbHostConnected),
      usbHostManufacturer: info.usbHostManufacturer || "N/A",
      usbHostProduct: info.usbHostProduct || "N/A",
    };
  }

  async buildBackupPayload() {
    const [systemInfo, globalConfig, board] = await Promise.all([
      this.getInfoData(true),
      this.callCommand("get_global"),
      this.callCommand("get_board"),
    ]);

    const presets = [];
    const presetsLayer2 = [];
    for (let col = 0; col < 6; col += 1) {
      for (let row = 0; row < 5; row += 1) {
        const p1 = await this.callCommand("get_preset", {
          btn: col,
          lvl: row,
          layer: 1,
        });
        presets.push(p1.preset || {});

        const p2 = await this.callCommand("get_preset", {
          btn: col,
          lvl: row,
          layer: 2,
        });
        presetsLayer2.push(p2.preset || {});
      }
    }

    return {
      firmware_version: systemInfo.firmwareVersion || "UNKNOWN",
      backup_date: new Date().toISOString(),
      global_config: globalConfig,
      board_config: {
        board_name: board.boardName || systemInfo.boardName || "BFMIDI-2 6S",
        invert_tela: Boolean(board.invertTela ?? systemInfo.invertTela),
      },
      wifi_config: {
        sta_enabled: false,
        sta_ssid: "",
        sta_password: "",
      },
      presets,
      presets_layer2: presetsLayer2,
    };
  }

  async request(rawUrl, init = {}) {
    try {
      const url = new URL(rawUrl, "http://bfmidi-local");
      const method = String(init.method || "GET").toUpperCase();
      const pathname = url.pathname;

      if (pathname === "/api/system/info" && method === "GET") {
        const info = await this.getInfoData();
        return jsonResult(this.mapSystemInfo(info));
      }

      if (pathname === "/api/host-status" && method === "GET") {
        const info = await this.getInfoData();
        return jsonResult({
          manufacturer: info.usbHostManufacturer || "N/A",
          product: info.usbHostProduct || "N/A",
          status: info.usbHostStatus || "Desconectado",
          connected: Boolean(info.usbHostConnected),
        });
      }

      if (pathname === "/api/midi-monitor" && method === "GET") {
        const since = Math.max(0, intParam(url.searchParams, "since", 0));
        const items = this.monitorBuffer.filter((entry) => entry.id > since);
        return jsonResult({
          success: true,
          items,
          lastId: this.monitorSeq,
        });
      }

      if (pathname === "/api/midi-monitor/clear" && method === "POST") {
        this.clearMonitorEntries();
        return jsonResult({ success: true });
      }

      if (pathname === "/api/global-config/read" && method === "GET") {
        const data = await this.callCommand("get_global");
        return jsonResult(data);
      }

      if (pathname === "/api/global-config/save" && method === "POST") {
        const payload = parseJsonBody(init.body);
        await this.callCommand("set_global", { data: payload });
        try {
          await this.callCommand("refresh_current");
        } catch {
          // Firmwares antigos podem nao expor refresh_current.
        }
        this.infoCache = null;
        return jsonResult({
          success: true,
          message: "Configuracoes salvas.",
        });
      }

      if (pathname === "/get-single-preset-data" && method === "GET") {
        const btn = intParam(url.searchParams, "btn", -1);
        const lvl = intParam(url.searchParams, "lvl", -1);
        const layer = intParam(url.searchParams, "layer", 1);

        if (btn < 0 || lvl < 0) {
          return textResult("Par 'btn' e 'lvl' obrigatorios.", 400);
        }

        const data = await this.callCommand("get_preset", { btn, lvl, layer });
        return jsonResult(data.preset || {});
      }

      if (pathname === "/save-single-preset-data" && method === "POST") {
        const btn = intParam(url.searchParams, "btn", -1);
        const lvl = intParam(url.searchParams, "lvl", -1);
        const layer = intParam(url.searchParams, "layer", 1);

        if (btn < 0 || lvl < 0) {
          return textResult("Par 'btn' e 'lvl' obrigatorios.", 400);
        }

        const payload = parseJsonBody(init.body);
        await this.callCommand("set_preset", {
          btn,
          lvl,
          layer,
          data: payload,
        });
        return textResult("Accepted", 202);
      }

      if (pathname === "/refresh-display-only" && method === "GET") {
        const btn = intParam(url.searchParams, "btn", -1);
        const lvl = intParam(url.searchParams, "lvl", -1);
        const layer = intParam(url.searchParams, "layer", 1);

        if (btn < 0 || lvl < 0) {
          return textResult("Par 'btn' e 'lvl' obrigatorios.", 400);
        }

        try {
          await this.callCommand("refresh_display", { btn, lvl, layer });
        } catch {
          // Fallback: apenas tenta refletir no modo antigo.
          await this.callCommand("refresh_current");
        }

        return textResult("Display atualizado e LEDs conforme modo atual.");
      }

      if (pathname === "/set-active-config-preset" && method === "GET") {
        const btn = intParam(url.searchParams, "btn", -1);
        const lvl = intParam(url.searchParams, "lvl", -1);
        const layer = intParam(url.searchParams, "layer", 1);

        if (btn < 0 || lvl < 0) {
          return textResult("Par 'btn' e 'lvl' obrigatorios.", 400);
        }

        try {
          await this.callCommand("activate_preset", { btn, lvl, layer });
        } catch {
          // Fallback para firmwares sem comando dedicado.
          await this.callCommand("refresh_display", { btn, lvl, layer });
        }

        return textResult("Display/LEDs atualizados e MIDI enviado no ESP32.");
      }

      if (pathname === "/savesystem" && method === "GET") {
        const boardName = url.searchParams.get("board") || "";
        if (!boardName) {
          return textResult("Erro: Parametro board obrigatorio.", 400);
        }

        const invertTela = boolFromParam(url.searchParams.get("invert"), false);
        const noRestart = url.searchParams.has("norestart");
        await this.callCommand("set_board", {
          data: {
            boardName,
            invertTela,
            restart: false,
          },
        });

        if (!noRestart) {
          try {
            await this.callCommand("restart");
          } catch (error) {
            // Fallback para firmwares sem comando `restart`.
            await this.callCommand("set_board", {
              data: {
                boardName,
                invertTela,
                restart: true,
              },
            });
          }
        }

        this.infoCache = null;

        if (noRestart) {
          return jsonResult({ success: true });
        }

        return jsonResult({
          success: true,
          message: "Placa salva com sucesso.",
          restartRequired: true,
        });
      }

      if (pathname === "/api/system/nvs-erase" && method === "POST") {
        await this.callCommand("nvs_erase");
        this.infoCache = null;
        return jsonResult({
          success: true,
          message: "Configurações resetadas. Dispositivo reiniciando.",
        });
      }

      if (pathname === "/api/wifi/status" && method === "GET") {
        return jsonResult({
          mode: "USB",
          status: "Wi-Fi indisponivel no modo Editor USB",
          ssid: "-",
          ip: "-",
          sta_enabled: false,
          sta_ssid: "",
          sta_password: "",
        });
      }

      if (pathname === "/api/wifi/scan" && method === "GET") {
        return jsonResult([]);
      }

      if (pathname === "/api/wifi/connect" && method === "POST") {
        return jsonResult({
          success: true,
          message: "Configuracao Wi-Fi ignorada no modo USB externo.",
        });
      }

      if (pathname === "/api/wifi/forget" && method === "POST") {
        return jsonResult({
          success: true,
          message: "Sem rede Wi-Fi configurada no modo USB externo.",
        });
      }

      if (pathname === "/api/wifi/ap-only" && method === "GET") {
        return jsonResult({
          apOnlyMode: true,
          apIp: "192.168.4.1",
        });
      }

      if (pathname === "/api/restore/config" && method === "GET") {
        return jsonResult({ restoreWriteDelayMs: 50 });
      }

      if (pathname === "/api/presets/diagnostics" && method === "GET") {
        return jsonResult({ total: 30, present: 30, items: [] });
      }

      if (pathname === "/api/presets/migrate-colors" && method === "POST") {
        return jsonResult({
          success: true,
          migrated_layer1: 0,
          migrated_layer2: 0,
        });
      }

      if (pathname === "/api/presets/migrate-clean" && method === "POST") {
        return jsonResult({ success: true, cleaned: 0 });
      }

      if (pathname.startsWith("/api/hardware-test/") && method === "POST") {
        if (pathname === "/api/hardware-test/leds/start") {
          await this.callCommand("hw_led_start");
          return jsonResult({ success: true });
        }

        if (pathname === "/api/hardware-test/leds/stop") {
          await this.callCommand("hw_led_stop");
          return jsonResult({ success: true });
        }

        if (pathname === "/api/hardware-test/display/start") {
          await this.callCommand("hw_display_start");
          return jsonResult({ success: true });
        }

        if (pathname === "/api/hardware-test/display/stop") {
          await this.callCommand("hw_display_stop");
          return jsonResult({ success: true });
        }

        if (pathname === "/api/hardware-test/midi/pc") {
          const pc = intParam(url.searchParams, "pc", 0);
          const clamped = Math.max(0, Math.min(127, pc));
          await this.callCommand("hw_midi_pc", { pc: clamped, channel: 1 });
          return jsonResult({ success: true, pc: clamped });
        }
        return jsonResult({ success: true });
      }

      if (pathname === "/api/backup" && method === "GET") {
        const backup = await this.buildBackupPayload();
        return jsonResult(backup);
      }

      if (pathname === "/api/logs" && method === "GET") {
        return textResult(
          [
            "BFMIDI Editor Externo",
            `Timestamp: ${new Date().toISOString()}`,
            "Logs locais indisponiveis via protocolo serial atual.",
          ].join("\n")
        );
      }

      if (pathname.startsWith("/api/")) {
        return jsonResult(
          {
            success: false,
            message: `Endpoint nao suportado no editor externo: ${pathname}`,
          },
          404
        );
      }

      return textResult(`Rota nao encontrada: ${pathname}`, 404);
    } catch (error) {
      return jsonResult(
        {
          success: false,
          message: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  }
}
