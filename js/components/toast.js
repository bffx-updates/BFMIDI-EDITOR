const container = document.getElementById("toast-container");

export function toast(message, type = "info", timeout = 2800) {
  if (!container) {
    return;
  }

  const el = document.createElement("div");
  el.className = "toast";
  el.dataset.type = type;
  el.textContent = message;
  container.appendChild(el);

  window.setTimeout(() => {
    el.remove();
  }, timeout);
}
