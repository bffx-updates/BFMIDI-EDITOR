export function bindToggle(buttonEl, initialValue, onChange) {
  if (!buttonEl) {
    return;
  }

  let value = Boolean(initialValue);

  const repaint = () => {
    buttonEl.textContent = value ? "ON" : "OFF";
    buttonEl.classList.toggle("btn-primary", value);
    buttonEl.classList.toggle("btn-ghost", !value);
  };

  buttonEl.addEventListener("click", () => {
    value = !value;
    repaint();
    onChange(value);
  });

  repaint();
}
