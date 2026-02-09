export function applyNativeSelect(selectEl, options, value) {
  if (!selectEl) {
    return;
  }

  selectEl.innerHTML = "";
  options.forEach((option) => {
    const el = document.createElement("option");
    el.value = String(option.value);
    el.textContent = option.label;
    selectEl.appendChild(el);
  });

  if (value !== undefined && value !== null) {
    selectEl.value = String(value);
  }
}
