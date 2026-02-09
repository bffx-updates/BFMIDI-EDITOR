import { mountColorPicker } from "../components/color-picker.js";

const MODE_OPTIONS = [
  "STOMP",
  "SPIN1",
  "SPIN2",
  "SPIN3",
  "RAMPA1",
  "RAMPA2",
  "RAMPA3",
  "CONTROL1",
  "CONTROL2",
  "CONTROL3",
  "CUSTOM1",
  "CUSTOM2",
  "CUSTOM3",
  "CUSTOM4",
  "CUSTOM5",
  "CUSTOM6",
  "SINGLE",
  "FAVORITE",
  "TAP TEMPO",
  "SPIN1 (PC)",
  "SPIN2 (PC)",
  "SPIN3 (PC)",
  "CUSTOM1 S",
  "CUSTOM2 S",
  "CUSTOM3 S",
  "CUSTOM4 S",
  "CUSTOM5 S",
  "CUSTOM6 S",
  "DUAL STOMP",
  "STOMP RAMPA",
  "DUAL STOMP RAMPA",
  "SPIN1 HOLD",
  "SPIN2 HOLD",
  "SPIN3 HOLD",
  "SPIN4",
  "SPIN5",
  "SPIN6",
  "MOMENTARY",
  "MACROS",
];

const LVL_LABELS = ["A", "B", "C", "D", "E"];

function modeOptionsHtml(selected) {
  return MODE_OPTIONS.map((label, index) => {
    const selectedAttr = Number(selected) === index ? "selected" : "";
    return `<option value="${index}" ${selectedAttr}>${index} - ${label}</option>`;
  }).join("");
}

function ensurePresetShape(preset) {
  if (!preset || typeof preset !== "object") {
    return {
      nomePreset: "",
      nomePresetTextColor: 0xffffff,
      bank: 0,
      canal: 1,
      switches: Array.from({ length: 6 }, () => ({
        modo: 0,
        cc: 0,
        cc2: 0,
        canal: 1,
        led: 0,
        led2: 0,
        start_value: false,
        sigla_fx: "",
        icon_fx: 21,
        icon_color: 6,
        icon_color_off: 6,
      })),
      extras: {
        enviar_extras: false,
        pc: Array.from({ length: 4 }, () => ({ valor: 0, canal: 1 })),
        cc: Array.from({ length: 2 }, () => ({ cc: 0, valor: 0, canal: 1 })),
      },
    };
  }

  if (!Array.isArray(preset.switches)) {
    preset.switches = [];
  }
  while (preset.switches.length < 6) {
    preset.switches.push({ modo: 0, cc: 0, canal: 1, led: 0, led2: 0, start_value: false });
  }

  if (!preset.extras) {
    preset.extras = {};
  }
  if (!Array.isArray(preset.extras.pc)) {
    preset.extras.pc = Array.from({ length: 4 }, () => ({ valor: 0, canal: 1 }));
  }
  if (!Array.isArray(preset.extras.cc)) {
    preset.extras.cc = Array.from({ length: 2 }, () => ({ cc: 0, valor: 0, canal: 1 }));
  }

  return preset;
}

export async function renderPresetsPage(container, ctx) {
  const { protocol, toast, navigate, showLoading, hideLoading } = ctx;

  if (!protocol) {
    container.innerHTML = "<p>Conecte o dispositivo para editar Presets.</p>";
    return;
  }

  let presetRef = { btn: 0, lvl: 0, layer: 1 };
  let presetData = null;
  let selectedSwitch = 0;

  async function loadPreset() {
    showLoading("Carregando preset...");
    try {
      const response = await protocol.enviarComando("get_preset", presetRef);
      if (!response?.ok) {
        throw new Error(response?.error || "Falha ao ler preset");
      }

      presetData = ensurePresetShape(response.data?.preset);
      renderForm();
    } catch (error) {
      toast(`Erro ao carregar preset: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }

  async function savePreset() {
    if (!presetData) {
      return;
    }

    showLoading("Salvando preset...");
    try {
      const response = await protocol.enviarComando("set_preset", {
        ...presetRef,
        data: presetData,
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Falha ao salvar preset");
      }
      toast("Preset salvo", "success");
    } catch (error) {
      toast(`Erro ao salvar preset: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }

  function renderForm() {
    const sw = presetData.switches[selectedSwitch] || {};
    const extras = presetData.extras || {};

    container.innerHTML = `
      <section class="page-layout presets-layout">
        <article class="card card-block stack">
          <div class="field-grid">
            <div>
              <label for="p-btn">Coluna (1-6)</label>
              <select id="p-btn">${Array.from({ length: 6 }, (_, i) => `<option value="${i}" ${presetRef.btn === i ? "selected" : ""}>${i + 1}</option>`).join("")}</select>
            </div>
            <div>
              <label for="p-lvl">Banco (A-E)</label>
              <select id="p-lvl">${LVL_LABELS.map((label, i) => `<option value="${i}" ${presetRef.lvl === i ? "selected" : ""}>${label}</option>`).join("")}</select>
            </div>
            <div>
              <label for="p-layer">Layer</label>
              <select id="p-layer">
                <option value="1" ${presetRef.layer === 1 ? "selected" : ""}>Layer 1</option>
                <option value="2" ${presetRef.layer === 2 ? "selected" : ""}>Layer 2</option>
              </select>
            </div>
            <div>
              <label for="p-name">Nome do Preset</label>
              <input id="p-name" type="text" maxlength="10" value="${presetData.nomePreset || ""}" />
            </div>
            <div>
              <label for="p-name-color">Cor do Nome</label>
              <input id="p-name-color" type="color" value="#${Number(presetData.nomePresetTextColor || 0xffffff).toString(16).padStart(6, "0").slice(-6)}" />
            </div>
            <div>
              <label for="p-bank">Bank MIDI</label>
              <input id="p-bank" type="number" min="0" max="299" value="${presetData.bank ?? 0}" />
            </div>
            <div>
              <label for="p-channel">Canal MIDI</label>
              <input id="p-channel" type="number" min="0" max="16" value="${presetData.canal ?? 1}" />
            </div>
          </div>

          <div>
            <p class="section-title">Grid de Switches</p>
            <div class="switch-grid" id="p-switch-grid">
              ${Array.from({ length: 6 }, (_, i) => `<button type="button" class="sw-btn ${selectedSwitch === i ? "is-selected" : ""}" data-sw="${i}">SW${i + 1}</button>`).join("")}
            </div>
          </div>

          <div class="switch-editor">
            <p class="section-title">Switch Selecionado: SW${selectedSwitch + 1}</p>
            <div class="field-grid">
              <div>
                <label for="sw-modo">Modo</label>
                <select id="sw-modo">${modeOptionsHtml(sw.modo)}</select>
              </div>
              <div>
                <label for="sw-cc">CC</label>
                <input id="sw-cc" type="number" min="0" max="127" value="${sw.cc ?? 0}" />
              </div>
              <div>
                <label for="sw-cc2">CC2</label>
                <input id="sw-cc2" type="number" min="0" max="127" value="${sw.cc2 ?? 0}" />
              </div>
              <div>
                <label for="sw-channel">Canal</label>
                <input id="sw-channel" type="number" min="0" max="16" value="${sw.canal ?? 1}" />
              </div>
              <div>
                <label for="sw-led">LED ON (indice)</label>
                <input id="sw-led" type="number" min="0" max="14" value="${sw.led ?? 0}" />
              </div>
              <div>
                <label for="sw-led2">LED OFF/L2 (indice)</label>
                <input id="sw-led2" type="number" min="0" max="14" value="${sw.led2 ?? 0}" />
              </div>
              <div>
                <label for="sw-start">Start Toggle</label>
                <select id="sw-start">
                  <option value="0" ${sw.start_value ? "" : "selected"}>OFF</option>
                  <option value="1" ${sw.start_value ? "selected" : ""}>ON</option>
                </select>
              </div>
              <div>
                <label for="sw-sigla">Sigla FX (GIG)</label>
                <input id="sw-sigla" type="text" maxlength="3" value="${sw.sigla_fx || ""}" />
              </div>
              <div>
                <label for="sw-icon">Icon FX</label>
                <input id="sw-icon" type="number" min="0" max="64" value="${sw.icon_fx ?? 21}" />
              </div>
            </div>

            <div style="margin-top:0.6rem;">
              <label>Paleta rapida do LED ON</label>
              <div id="sw-led-palette"></div>
            </div>
          </div>

          <details class="collapsible" open>
            <summary>GIG VIEW</summary>
            <div class="field-grid">
              <div>
                <label for="sw-icon-color">Cor do Icon ON</label>
                <input id="sw-icon-color" type="number" min="0" max="14" value="${sw.icon_color ?? 6}" />
              </div>
              <div>
                <label for="sw-icon-color-off">Cor do Icon OFF</label>
                <input id="sw-icon-color-off" type="number" min="0" max="14" value="${sw.icon_color_off ?? 6}" />
              </div>
            </div>
          </details>

          <details class="collapsible" open>
            <summary>Extras (PCs e CCs)</summary>
            <div class="field-grid">
              <div>
                <label for="pc1">PC1 Valor</label>
                <input id="pc1" type="number" min="0" max="127" value="${extras.pc?.[0]?.valor ?? 0}" />
              </div>
              <div>
                <label for="pc1ch">PC1 Canal</label>
                <input id="pc1ch" type="number" min="1" max="16" value="${extras.pc?.[0]?.canal ?? 1}" />
              </div>
              <div>
                <label for="pc2">PC2 Valor</label>
                <input id="pc2" type="number" min="0" max="127" value="${extras.pc?.[1]?.valor ?? 0}" />
              </div>
              <div>
                <label for="pc2ch">PC2 Canal</label>
                <input id="pc2ch" type="number" min="1" max="16" value="${extras.pc?.[1]?.canal ?? 1}" />
              </div>
              <div>
                <label for="cc1">CC1 Numero</label>
                <input id="cc1" type="number" min="0" max="127" value="${extras.cc?.[0]?.cc ?? 0}" />
              </div>
              <div>
                <label for="cc1v">CC1 Valor</label>
                <input id="cc1v" type="number" min="0" max="127" value="${extras.cc?.[0]?.valor ?? 0}" />
              </div>
              <div>
                <label for="cc2">CC2 Numero</label>
                <input id="cc2" type="number" min="0" max="127" value="${extras.cc?.[1]?.cc ?? 0}" />
              </div>
              <div>
                <label for="cc2v">CC2 Valor</label>
                <input id="cc2v" type="number" min="0" max="127" value="${extras.cc?.[1]?.valor ?? 0}" />
              </div>
            </div>
          </details>

          <div class="button-row">
            <button id="p-back" class="btn btn-ghost">Voltar</button>
            <button id="p-load" class="btn btn-ghost">Recarregar</button>
            <button id="p-save" class="btn btn-primary">Salvar Preset</button>
          </div>
        </article>
      </section>
    `;

    const swLedPalette = container.querySelector("#sw-led-palette");
    mountColorPicker(swLedPalette, Number(sw.led ?? 0), (index) => {
      presetData.switches[selectedSwitch].led = index;
      const ledInput = container.querySelector("#sw-led");
      if (ledInput) {
        ledInput.value = String(index);
      }
      renderForm();
    });

    container.querySelector("#p-btn")?.addEventListener("change", (event) => {
      presetRef.btn = Number(event.target.value);
    });
    container.querySelector("#p-lvl")?.addEventListener("change", (event) => {
      presetRef.lvl = Number(event.target.value);
    });
    container.querySelector("#p-layer")?.addEventListener("change", (event) => {
      presetRef.layer = Number(event.target.value);
    });

    container.querySelectorAll("#p-switch-grid [data-sw]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedSwitch = Number(button.dataset.sw);
        renderForm();
      });
    });

    const bindNumber = (selector, apply) => {
      container.querySelector(selector)?.addEventListener("input", (event) => {
        apply(Number(event.target.value || 0));
      });
    };

    const bindText = (selector, apply) => {
      container.querySelector(selector)?.addEventListener("input", (event) => {
        apply(event.target.value);
      });
    };

    bindText("#p-name", (value) => {
      presetData.nomePreset = value.slice(0, 10);
    });
    container.querySelector("#p-name-color")?.addEventListener("change", (event) => {
      presetData.nomePresetTextColor = Number.parseInt(event.target.value.replace("#", ""), 16);
    });
    bindNumber("#p-bank", (value) => {
      presetData.bank = value;
    });
    bindNumber("#p-channel", (value) => {
      presetData.canal = value;
    });

    container.querySelector("#sw-modo")?.addEventListener("change", (event) => {
      presetData.switches[selectedSwitch].modo = Number(event.target.value || 0);
    });
    bindNumber("#sw-cc", (value) => {
      presetData.switches[selectedSwitch].cc = value;
    });
    bindNumber("#sw-cc2", (value) => {
      presetData.switches[selectedSwitch].cc2 = value;
    });
    bindNumber("#sw-channel", (value) => {
      presetData.switches[selectedSwitch].canal = value;
    });
    bindNumber("#sw-led", (value) => {
      presetData.switches[selectedSwitch].led = value;
    });
    bindNumber("#sw-led2", (value) => {
      presetData.switches[selectedSwitch].led2 = value;
    });
    bindText("#sw-sigla", (value) => {
      presetData.switches[selectedSwitch].sigla_fx = value.slice(0, 3).toUpperCase();
    });
    bindNumber("#sw-icon", (value) => {
      presetData.switches[selectedSwitch].icon_fx = value;
    });
    bindNumber("#sw-icon-color", (value) => {
      presetData.switches[selectedSwitch].icon_color = value;
    });
    bindNumber("#sw-icon-color-off", (value) => {
      presetData.switches[selectedSwitch].icon_color_off = value;
    });

    container.querySelector("#sw-start")?.addEventListener("change", (event) => {
      presetData.switches[selectedSwitch].start_value = Number(event.target.value) === 1;
    });

    bindNumber("#pc1", (value) => {
      presetData.extras.pc[0].valor = value;
    });
    bindNumber("#pc1ch", (value) => {
      presetData.extras.pc[0].canal = value;
    });
    bindNumber("#pc2", (value) => {
      presetData.extras.pc[1].valor = value;
    });
    bindNumber("#pc2ch", (value) => {
      presetData.extras.pc[1].canal = value;
    });
    bindNumber("#cc1", (value) => {
      presetData.extras.cc[0].cc = value;
    });
    bindNumber("#cc1v", (value) => {
      presetData.extras.cc[0].valor = value;
    });
    bindNumber("#cc2", (value) => {
      presetData.extras.cc[1].cc = value;
    });
    bindNumber("#cc2v", (value) => {
      presetData.extras.cc[1].valor = value;
    });

    container.querySelector("#p-load")?.addEventListener("click", loadPreset);
    container.querySelector("#p-save")?.addEventListener("click", savePreset);
    container.querySelector("#p-back")?.addEventListener("click", () => navigate("home"));
  }

  await loadPreset();
}
