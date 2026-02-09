const MODO_MIDI_OPTIONS = [
  "GLOBAL",
  "AMPERO AS2",
  "AMPERO MINI",
  "HX STOMP",
  "A. STAGE 2",
  "GP-200LT",
  "VALETON GP5",
  "POCKET MASTER",
  "TONEX",
  "KEMPER PLAYER",
  "AMPERO MP350",
  "MX5",
  "NANO CORTEX",
  "QUAD CORTEX",
];

const SELECT_MODE_OPTIONS = ["Modo 1", "Modo 2", "Modo 3"];

const SW_GLOBAL_MODE_OPTIONS = [
  { value: 16, label: "SINGLE" },
  { value: 17, label: "FAVORITE" },
  { value: 18, label: "TAP TEMPO" },
  { value: 0, label: "STOMP" },
  { value: 1, label: "SPIN1" },
  { value: 28, label: "DUAL STOMP" },
];

const toHexColor = (value) => {
  const numeric = Number(value) >>> 0;
  return `#${numeric.toString(16).padStart(6, "0").slice(-6)}`;
};

const fromHexColor = (hex) => Number.parseInt(hex.replace("#", ""), 16);

function optionHtml(items, selectedValue) {
  return items
    .map((item, index) => {
      const value = typeof item === "string" ? index : item.value;
      const label = typeof item === "string" ? item : item.label;
      const selected = Number(selectedValue) === Number(value) ? "selected" : "";
      return `<option value="${value}" ${selected}>${label}</option>`;
    })
    .join("");
}

function boolChecked(value) {
  return value ? "checked" : "";
}

export async function renderGlobalsPage(container, ctx) {
  const { protocol, toast, navigate } = ctx;

  if (!protocol) {
    container.innerHTML = "<p>Conecte o dispositivo para editar Globals.</p>";
    return;
  }

  let currentConfig = null;

  const loadConfig = async () => {
    const response = await protocol.enviarComando("get_global");
    if (!response?.ok) {
      throw new Error(response?.error || "Falha ao ler globals");
    }
    currentConfig = response.data || {};
    renderForm();
  };

  const renderForm = () => {
    const cfg = currentConfig || {};
    const swGlobal = cfg.swGlobal || {};
    const levels = cfg.presetLevels || [true, true, true, true, true];

    container.innerHTML = `
      <section class="page-layout globals-layout">
        <article class="card globals-section stack">
          <div>
            <p class="section-title">Display</p>
            <div class="field-grid">
              <div>
                <label for="g-modo-midi">Modo MIDI</label>
                <select id="g-modo-midi">${optionHtml(MODO_MIDI_OPTIONS, cfg.modoMidiIndex)}</select>
              </div>
              <div>
                <label for="g-fx-modo">FX Modo</label>
                <select id="g-fx-modo">
                  <option value="0" ${Number(cfg.mostrarFxModo) === 0 ? "selected" : ""}>OFF</option>
                  <option value="1" ${Number(cfg.mostrarFxModo) === 1 ? "selected" : ""}>SIGLAS</option>
                  <option value="2" ${Number(cfg.mostrarFxModo) === 2 ? "selected" : ""}>ICONES</option>
                </select>
              </div>
              <div>
                <label for="g-fx-quando">FX Quando</label>
                <select id="g-fx-quando">
                  <option value="0" ${Number(cfg.mostrarFxQuando) === 0 ? "selected" : ""}>Sempre</option>
                  <option value="1" ${Number(cfg.mostrarFxQuando) === 1 ? "selected" : ""}>Live Mode</option>
                  <option value="2" ${Number(cfg.mostrarFxQuando) === 2 ? "selected" : ""}>Nunca</option>
                </select>
              </div>
              <div>
                <label for="g-select-mode">Chamada Presets</label>
                <select id="g-select-mode">${optionHtml(SELECT_MODE_OPTIONS, cfg.selectModeIndex)}</select>
              </div>
              <div>
                <label for="g-bg-color">Background</label>
                <input id="g-bg-color" type="color" value="${toHexColor(cfg.backgroundColorConfig || 0)}" />
              </div>
              <div>
                <label for="g-brilho">Brilho LED (1-5)</label>
                <input id="g-brilho" type="number" min="1" max="5" value="${cfg.ledBrilho ?? 5}" />
              </div>
            </div>
            <div class="field-grid" style="margin-top:0.8rem;">
              <div><label><input id="g-display-enabled" type="checkbox" ${boolChecked(cfg.mostrarTelaFX)} /> Mostrar tela FX</label></div>
              <div><label><input id="g-led-preview" type="checkbox" ${boolChecked(cfg.ledPreview)} /> LED Preview</label></div>
              <div><label><input id="g-bg-enabled" type="checkbox" ${boolChecked(cfg.backgroundEnabled)} /> Background ativo</label></div>
              <div><label><input id="g-live-layer2" type="checkbox" ${boolChecked(cfg.liveLayer2Enabled)} /> Layer 2 no Live Mode</label></div>
              <div><label><input id="g-lock-setup" type="checkbox" ${boolChecked(cfg.lockSetup)} /> Lock Setup</label></div>
              <div><label><input id="g-lock-global" type="checkbox" ${boolChecked(cfg.lockGlobal)} /> Lock Global</label></div>
            </div>
          </div>

          <div>
            <p class="section-title">Cores</p>
            <div class="field-grid">
              <div>
                <label for="g-live-color">Cor Live Mode</label>
                <input id="g-live-color" type="color" value="${toHexColor(cfg.corLiveModeConfig || 0xffffff)}" />
              </div>
              <div>
                <label for="g-live2-color">Cor Live Layer 2</label>
                <input id="g-live2-color" type="color" value="${toHexColor(cfg.corLiveMode2Config || 0xffffff)}" />
              </div>
              <div>
                <label for="g-rampa">Rampa padrao (ms)</label>
                <input id="g-rampa" type="number" min="1" step="1" value="${cfg.rampaValor ?? 1000}" />
              </div>
            </div>
            <div style="margin-top:0.7rem;">
              <label>Paleta de Presets (A-F)</label>
              <div id="g-palette-mount"></div>
            </div>
          </div>

          <div>
            <p class="section-title">SW Global</p>
            <div class="field-grid">
              <div>
                <label for="g-sw-modo">Modo</label>
                <select id="g-sw-modo">${optionHtml(SW_GLOBAL_MODE_OPTIONS, swGlobal.modo)}</select>
              </div>
              <div>
                <label for="g-sw-cc">CC</label>
                <input id="g-sw-cc" type="number" min="0" max="127" value="${swGlobal.cc ?? 0}" />
              </div>
              <div>
                <label for="g-sw-canal">Canal</label>
                <input id="g-sw-canal" type="number" min="0" max="16" value="${swGlobal.canal ?? 1}" />
              </div>
              <div>
                <label for="g-sw-led">LED indice</label>
                <input id="g-sw-led" type="number" min="0" max="14" value="${swGlobal.led ?? 0}" />
              </div>
            </div>
            <div class="field-grid" style="margin-top:0.8rem;">
              <div><label><input id="g-sw-start" type="checkbox" ${boolChecked(swGlobal.start_value)} /> Start ON</label></div>
              <div><label><input id="g-sw-fav-live" type="checkbox" ${boolChecked(swGlobal.favoriteAutoLive)} /> Favorite auto live</label></div>
            </div>
          </div>

          <div>
            <p class="section-title">Preset Levels e Inicio Automatico</p>
            <div class="field-grid">
              <div><label><input id="g-lvl-a" type="checkbox" ${boolChecked(levels[0])} /> Nivel A</label></div>
              <div><label><input id="g-lvl-b" type="checkbox" ${boolChecked(levels[1])} /> Nivel B</label></div>
              <div><label><input id="g-lvl-c" type="checkbox" ${boolChecked(levels[2])} /> Nivel C</label></div>
              <div><label><input id="g-lvl-d" type="checkbox" ${boolChecked(levels[3])} /> Nivel D</label></div>
              <div><label><input id="g-lvl-e" type="checkbox" ${boolChecked(levels[4])} /> Nivel E</label></div>
            </div>
            <div class="field-grid" style="margin-top:0.7rem;">
              <div><label><input id="g-auto-start" type="checkbox" ${boolChecked(cfg.autoStartEnabled)} /> Inicio automatico</label></div>
              <div><label><input id="g-auto-live" type="checkbox" ${boolChecked(cfg.autoStartLiveMode)} /> Entrar em live</label></div>
              <div>
                <label for="g-auto-row">Linha (A-E = 0-4)</label>
                <input id="g-auto-row" type="number" min="0" max="4" value="${cfg.autoStartRow ?? 0}" />
              </div>
              <div>
                <label for="g-auto-col">Coluna (1-6 = 0-5)</label>
                <input id="g-auto-col" type="number" min="0" max="5" value="${cfg.autoStartCol ?? 0}" />
              </div>
            </div>
          </div>

          <div class="button-row">
            <button id="g-back" class="btn btn-ghost">Voltar</button>
            <button id="g-reload" class="btn btn-ghost">Recarregar</button>
            <button id="g-save" class="btn btn-primary">Salvar Globals</button>
          </div>
        </article>
      </section>
    `;

    const paletteMount = container.querySelector("#g-palette-mount");
    const paletteState = (cfg.coresPresetConfig || []).slice(0, 6);
    while (paletteState.length < 6) {
      paletteState.push(0xffffff);
    }

    const renderPalette = () => {
      paletteMount.innerHTML = "";
      paletteState.forEach((value, index) => {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "120px 1fr";
        row.style.gap = "0.6rem";
        row.style.marginBottom = "0.35rem";

        const label = document.createElement("label");
        label.textContent = `Cor ${index + 1}`;

        const input = document.createElement("input");
        input.type = "color";
        input.value = toHexColor(value);
        input.addEventListener("change", () => {
          paletteState[index] = fromHexColor(input.value);
        });

        row.append(label, input);
        paletteMount.appendChild(row);
      });
    };

    renderPalette();

    const collectPayload = () => ({
      ledBrilho: Number(container.querySelector("#g-brilho").value || 5),
      ledPreview: container.querySelector("#g-led-preview").checked,
      backgroundEnabled: container.querySelector("#g-bg-enabled").checked,
      backgroundColorConfig: fromHexColor(container.querySelector("#g-bg-color").value),
      modoMidiIndex: Number(container.querySelector("#g-modo-midi").value || 0),
      mostrarTelaFX: container.querySelector("#g-display-enabled").checked,
      mostrarFxModo: Number(container.querySelector("#g-fx-modo").value || 1),
      mostrarFxQuando: Number(container.querySelector("#g-fx-quando").value || 0),
      rampaValor: Number(container.querySelector("#g-rampa").value || 1000),
      coresPresetConfig: paletteState,
      corLiveModeConfig: fromHexColor(container.querySelector("#g-live-color").value),
      corLiveMode2Config: fromHexColor(container.querySelector("#g-live2-color").value),
      liveLayer2Enabled: container.querySelector("#g-live-layer2").checked,
      selectModeIndex: Number(container.querySelector("#g-select-mode").value || 0),
      presetLevels: [
        container.querySelector("#g-lvl-a").checked,
        container.querySelector("#g-lvl-b").checked,
        container.querySelector("#g-lvl-c").checked,
        container.querySelector("#g-lvl-d").checked,
        container.querySelector("#g-lvl-e").checked,
      ],
      lockSetup: container.querySelector("#g-lock-setup").checked,
      lockGlobal: container.querySelector("#g-lock-global").checked,
      autoStartEnabled: container.querySelector("#g-auto-start").checked,
      autoStartRow: Number(container.querySelector("#g-auto-row").value || 0),
      autoStartCol: Number(container.querySelector("#g-auto-col").value || 0),
      autoStartLiveMode: container.querySelector("#g-auto-live").checked,
      swGlobal: {
        modo: Number(container.querySelector("#g-sw-modo").value || 16),
        cc: Number(container.querySelector("#g-sw-cc").value || 0),
        canal: Number(container.querySelector("#g-sw-canal").value || 1),
        led: Number(container.querySelector("#g-sw-led").value || 0),
        start_value: container.querySelector("#g-sw-start").checked,
        favoriteAutoLive: container.querySelector("#g-sw-fav-live").checked,
      },
    });

    container.querySelector("#g-save")?.addEventListener("click", async () => {
      try {
        const payload = collectPayload();
        const response = await protocol.enviarComando("set_global", { data: payload });
        if (!response?.ok) {
          throw new Error(response?.error || "Falha no set_global");
        }
        toast("Globals salvos", "success");
        await loadConfig();
      } catch (error) {
        toast(`Erro ao salvar globals: ${error.message}`, "error");
      }
    });

    container.querySelector("#g-reload")?.addEventListener("click", async () => {
      try {
        await loadConfig();
        toast("Globals recarregados", "success");
      } catch (error) {
        toast(`Erro ao recarregar globals: ${error.message}`, "error");
      }
    });

    container.querySelector("#g-back")?.addEventListener("click", () => {
      navigate("home");
    });
  };

  try {
    await loadConfig();
  } catch (error) {
    container.innerHTML = `<p>Erro ao carregar globals: ${error.message}</p>`;
  }
}
