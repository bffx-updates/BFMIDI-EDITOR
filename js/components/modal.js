const modal = document.getElementById("confirm-modal");
const titleEl = document.getElementById("confirm-title");
const messageEl = document.getElementById("confirm-message");
const okBtn = document.getElementById("confirm-ok");
const cancelBtn = document.getElementById("confirm-cancel");

export function confirmDialog({ title = "Confirmar", message = "Tem certeza?" }) {
  if (!modal || !okBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(message));
  }

  titleEl.textContent = title;
  messageEl.textContent = message;

  return new Promise((resolve) => {
    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    function cleanup() {
      okBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      modal.close();
    }

    okBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    modal.showModal();
  });
}
