const BOARD_OPTIONS = [
  "BFMIDI-1 7S_A1",
  "BFMIDI-1 7S_B1",
  "BFMIDI-1 7S_C1",
  "BFMIDI-1 4S",
  "BFMIDI-2 4S",
  "BFMIDI-2 6S",
  "BFMIDI-2 7S",
  "BFMIDI-2 NANO",
  "BFMIDI-2 MICRO",
];

const LEVELS = [0, 1, 2, 3, 4];
const BUTTONS = [0, 1, 2, 3, 4, 5];
const LAYERS = [1, 2];

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function renderSystemPage(container, ctx) {
  const { protocol, toast, navigate, confirmDialog, showLoading, hideLoading } = ctx;

  if (!protocol) {
    container.innerHTML = "<p>Conecte o dispositivo para acessar System.</p>";
    return;
  }

  let info = null;
  let board = null;

  async function refreshInfo() {
    const [infoResp, boardResp] = await Promise.all([
      protocol.enviarComando("get_info"),
      protocol.enviarComando("get_board"),
    ]);

    if (!infoResp?.ok) {
      throw new Error(infoResp?.error || "Falha em get_info");
    }
    if (!boardResp?.ok) {
      throw new Error(boardResp?.error || "Falha em get_board");
    }

    info = infoResp.data || {};
    board = boardResp.data || {};
    render();
  }

  async function backupAll() {
    showLoading("Gerando backup...");
    try {
      const globalResp = await protocol.enviarComando("get_global");
      if (!globalResp?.ok) {
        throw new Error(globalResp?.error || "Falha em get_global");
      }

      const presets = [];
      for (const layer of LAYERS) {
        for (const lvl of LEVELS) {
          for (const btn of BUTTONS) {
            const response = await protocol.enviarComando("get_preset", {
              btn,
              lvl,
              layer,
            });
            if (response?.ok) {
              presets.push({ btn, lvl, layer, preset: response.data?.preset });
            }
          }
        }
      }

      const payload = {
        format: "bfmidi-editor-external-v1",
        exportedAt: new Date().toISOString(),
        info,
        board,
        global: globalResp.data,
        presets,
      };

      const safeDate = new Date().toISOString().replace(/[:.]/g, "-");
      downloadJson(`bfmidi_backup_external_${safeDate}.json`, payload);
      toast("Backup gerado", "success");
    } catch (error) {
      toast(`Erro no backup: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }

  async function restoreFromFile(file) {
    if (!file) {
      return;
    }

    showLoading("Restaurando backup...");

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed?.global || !Array.isArray(parsed?.presets)) {
        throw new Error("Arquivo invalido para restore");
      }

      const confirmed = await confirmDialog({
        title: "Restaurar backup",
        message: "Isso vai sobrescrever globals/presets atuais. Continuar?",
      });
      if (!confirmed) {
        hideLoading();
        return;
      }

      const globalResponse = await protocol.enviarComando("set_global", {
        data: parsed.global,
      });
      if (!globalResponse?.ok) {
        throw new Error(globalResponse?.error || "Falha ao restaurar globals");
      }

      if (parsed.board?.boardName) {
        await protocol.enviarComando("set_board", {
          data: {
            boardName: parsed.board.boardName,
            invertTela: Boolean(parsed.board.invertTela),
          },
        });
      }

      for (const item of parsed.presets) {
        if (!item?.preset) {
          continue;
        }
        const response = await protocol.enviarComando("set_preset", {
          btn: item.btn,
          lvl: item.lvl,
          layer: item.layer || 1,
          data: item.preset,
        });
        if (!response?.ok) {
          throw new Error(response?.error || `Falha ao restaurar P${item.btn}${item.lvl} L${item.layer}`);
        }
      }

      toast("Restore concluido", "success");
      await refreshInfo();
    } catch (error) {
      toast(`Erro no restore: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }

  async function saveBoard() {
    const boardName = container.querySelector("#s-board").value;
    const invertTela = container.querySelector("#s-invert").checked;

    try {
      const response = await protocol.enviarComando("set_board", {
        data: { boardName, invertTela },
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Falha ao salvar placa");
      }
      toast("Placa salva (reinicio recomendado)", "success");
      await refreshInfo();
    } catch (error) {
      toast(`Erro ao salvar placa: ${error.message}`, "error");
    }
  }

  async function factoryReset() {
    const confirmed = await confirmDialog({
      title: "Reset de fabrica",
      message: "Apagar toda a NVS e reiniciar?",
    });

    if (!confirmed) {
      return;
    }

    showLoading("Executando nvs_erase...");
    try {
      const response = await protocol.enviarComando("nvs_erase");
      if (!response?.ok) {
        throw new Error(response?.error || "Falha em nvs_erase");
      }
      toast("NVS apagada. Dispositivo vai reiniciar.", "success", 4500);
    } catch (error) {
      toast(`Erro no reset: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }

  function render() {
    container.innerHTML = `
      <section class="page-layout system-layout">
        <article class="card card-block stack">
          <p class="section-title">Config da Placa</p>
          <div class="field-grid">
            <div>
              <label for="s-board">Modelo da placa</label>
              <select id="s-board">
                ${BOARD_OPTIONS.map((value) => `<option value="${value}" ${value === board?.boardName ? "selected" : ""}>${value}</option>`).join("")}
              </select>
            </div>
            <div>
              <label><input id="s-invert" type="checkbox" ${board?.invertTela ? "checked" : ""} /> Inverter tela</label>
            </div>
          </div>
          <div class="system-actions">
            <button id="s-save-board" class="btn btn-primary">Salvar placa</button>
          </div>
        </article>

        <article class="card card-block stack">
          <p class="section-title">Backup e Restore</p>
          <div class="system-actions">
            <button id="s-backup" class="btn btn-ghost">Download backup JSON</button>
          </div>
          <label for="s-restore-file">Upload backup</label>
          <input id="s-restore-file" class="file-input" type="file" accept="application/json" />
          <div class="muted">Restore aplica globals, placa e todos os presets/layers.</div>
        </article>

        <article class="card card-block stack">
          <p class="section-title">Reset Fabrica</p>
          <button id="s-reset" class="btn btn-danger">Apagar NVS (Factory Reset)</button>
        </article>

        <article class="card card-block stack">
          <p class="section-title">Info do Sistema</p>
          <pre id="s-info" style="margin:0; white-space:pre-wrap;">${JSON.stringify(info || {}, null, 2)}</pre>
          <div class="system-actions">
            <button id="s-refresh" class="btn btn-ghost">Atualizar info</button>
            <button id="s-test-led" class="btn btn-ghost">Teste LEDs</button>
            <button id="s-test-display" class="btn btn-ghost">Teste Display</button>
            <button id="s-test-midi" class="btn btn-ghost">Teste MIDI</button>
          </div>
          <small>Testes de hardware via protocolo serial ainda sao placeholders nesta versao.</small>
        </article>

        <div class="button-row">
          <button id="s-back" class="btn btn-ghost">Voltar</button>
        </div>
      </section>
    `;

    container.querySelector("#s-back")?.addEventListener("click", () => navigate("home"));
    container.querySelector("#s-save-board")?.addEventListener("click", saveBoard);
    container.querySelector("#s-backup")?.addEventListener("click", backupAll);
    container.querySelector("#s-restore-file")?.addEventListener("change", (event) => {
      const [file] = event.target.files || [];
      restoreFromFile(file);
    });
    container.querySelector("#s-reset")?.addEventListener("click", factoryReset);
    container.querySelector("#s-refresh")?.addEventListener("click", async () => {
      try {
        await refreshInfo();
        toast("Info atualizada", "success");
      } catch (error) {
        toast(`Erro ao atualizar info: ${error.message}`, "error");
      }
    });

    container.querySelector("#s-test-led")?.addEventListener("click", () => {
      toast("Teste de LED: comando nao implementado via serial ainda", "info");
    });
    container.querySelector("#s-test-display")?.addEventListener("click", () => {
      toast("Teste de display: comando nao implementado via serial ainda", "info");
    });
    container.querySelector("#s-test-midi")?.addEventListener("click", () => {
      toast("Teste de MIDI: comando nao implementado via serial ainda", "info");
    });
  }

  try {
    await refreshInfo();
  } catch (error) {
    container.innerHTML = `<p>Erro ao carregar pagina System: ${error.message}</p>`;
  }
}
