const overlay = document.getElementById("loading-overlay");
const text = document.getElementById("loading-text");

export function showLoading(message = "Processando...") {
  if (!overlay) {
    return;
  }
  text.textContent = message;
  overlay.hidden = false;
}

export function hideLoading() {
  if (!overlay) {
    return;
  }
  overlay.hidden = true;
}
