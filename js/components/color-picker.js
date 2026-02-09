export const BFMIDI_COLOR_PALETTE = [
  "#d7263d",
  "#0ead69",
  "#1b6cfb",
  "#f8b400",
  "#7a4dd8",
  "#1dcad3",
  "#ffffff",
  "#ff7f11",
  "#f72585",
  "#ff6f61",
  "#59c3ff",
  "#b28dff",
  "#ff9ecf",
  "#82ffc4",
  "#111111",
];

export function mountColorPicker(container, currentValue, onChange) {
  if (!container) {
    return;
  }

  container.innerHTML = "";
  container.classList.add("palette");

  BFMIDI_COLOR_PALETTE.forEach((color, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.style.background = color;
    button.title = `Cor ${index}`;
    if (index === currentValue) {
      button.classList.add("is-selected");
    }
    button.addEventListener("click", () => onChange(index));
    container.appendChild(button);
  });
}
