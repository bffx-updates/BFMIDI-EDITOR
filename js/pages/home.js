export async function renderHomePage(container, ctx) {
  const { protocol, disconnect, toast } = ctx;

  container.innerHTML = `
    <section class="page-layout home-grid">
      <div class="home-cards">
        <article class="card">
          <div class="card-block">
            <p class="section-title">Firmware</p>
            <p class="home-value" data-home="firmware">-</p>
            <p class="muted" data-home="board">-</p>
          </div>
        </article>
        <article class="card">
          <div class="card-block">
            <p class="section-title">Memoria</p>
            <p class="home-value" data-home="heap">-</p>
            <p class="muted" data-home="psram">-</p>
            <p class="muted" data-home="nvs">-</p>
          </div>
        </article>
        <article class="card">
          <div class="card-block">
            <p class="section-title">USB Host</p>
            <p class="home-value" data-home="host">-</p>
            <p class="muted" data-home="host-desc">-</p>
          </div>
        </article>
      </div>
      <article class="card card-block">
        <p class="section-title">Acoes</p>
        <div class="button-row">
          <button id="home-refresh" class="btn btn-primary">Atualizar info</button>
          <button id="home-disconnect" class="btn btn-ghost">Desconectar</button>
        </div>
      </article>
    </section>
  `;

  const nodes = {
    firmware: container.querySelector('[data-home="firmware"]'),
    board: container.querySelector('[data-home="board"]'),
    heap: container.querySelector('[data-home="heap"]'),
    psram: container.querySelector('[data-home="psram"]'),
    nvs: container.querySelector('[data-home="nvs"]'),
    host: container.querySelector('[data-home="host"]'),
    hostDesc: container.querySelector('[data-home="host-desc"]'),
  };

  const fetchInfo = async () => {
    if (!protocol) {
      return;
    }

    try {
      const response = await protocol.enviarComando("get_info");
      if (!response?.ok) {
        throw new Error(response?.error || "Erro ao ler info");
      }

      const data = response.data || {};
      nodes.firmware.textContent = data.firmwareVersion || "desconhecido";
      nodes.board.textContent = `Placa: ${data.boardName || "-"}`;
      nodes.heap.textContent = `${Math.round((data.heapFree || 0) / 1024)} KB`;
      nodes.psram.textContent = `PSRAM livre: ${Math.round((data.psramFree || 0) / 1024)} KB`;
      if (data.nvs) {
        nodes.nvs.textContent = `NVS uso: ${data.nvs.usedPercent ?? 0}%`;
      } else {
        nodes.nvs.textContent = "NVS uso: -";
      }
      nodes.host.textContent = data.usbHostConnected ? "Conectado" : "Nao conectado";
      nodes.hostDesc.textContent = [data.usbHostStatus, data.usbHostProduct]
        .filter(Boolean)
        .join(" | ");
    } catch (error) {
      toast(`Falha ao carregar HOME: ${error.message}`, "error");
    }
  };

  container.querySelector("#home-refresh")?.addEventListener("click", fetchInfo);
  container.querySelector("#home-disconnect")?.addEventListener("click", disconnect);

  await fetchInfo();
}
