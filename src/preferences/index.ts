/* eslint-disable no-restricted-globals */
import { config } from "../../package.json";
import { computeFont } from "../utils/font";

function main() {
  document.querySelector("#prefs-navigation")?.addEventListener("select", init);

  setTimeout(() => {
    init();
  }, 1000);
}

function init() {
  // If this is not the bionic pane, don't do anything
  if (document.querySelector(`#${config.addonRef}-pane`) === null) {
    return;
  }

  // Attach event listeners
  document
    .querySelector(`#${config.addonRef}-opacityContrast`)
    ?.addEventListener("change", updatePreview);
  document
    .querySelector(`#${config.addonRef}-weightContrast`)
    ?.addEventListener("change", updatePreview);
  document
    .querySelector(`#${config.addonRef}-weightOffset`)
    ?.addEventListener("change", updatePreview);
  document
    .querySelector(`#${config.addonRef}-parsingOffset`)
    ?.addEventListener("change", updatePreview);

  // 初始化颜色预设选择器
  initColorPresets();

  updatePreview();
}

function initColorPresets() {
  // 查找所有颜色预设
  const presets = document.querySelectorAll('.color-preset');

  presets.forEach(preset => {
    preset.addEventListener('click', function (this: HTMLElement) {
      const target = this.getAttribute('data-target');
      const color = this.getAttribute('data-color');

      if (!target || !color) return;

      // 获取目标ID，替换addonRef占位符
      const realTarget = target.replace('__addonRef__', config.addonRef);

      // 设置对应的颜色选择器的值
      const colorPicker = document.querySelector(`#${realTarget}`) as HTMLInputElement;
      if (colorPicker) {
        colorPicker.value = color;

        // 触发change事件，使其保存到偏好设置
        const event = new Event('change', { bubbles: true });
        colorPicker.dispatchEvent(event);

        // 直接设置对应的首选项值
        const prefName = colorPicker.getAttribute('preference');
        if (prefName) {
          try {
            // 使用Zotero API设置首选项
            (window as any).Zotero.Prefs.set(prefName, color);
          } catch (e) {
            console.error('无法设置首选项:', e);
          }
        }
      }
    });
  });
}

function updatePreview() {
  const previewContainer = document.querySelector(
    `#${config.addonRef}-parsingPreview`,
  );

  if (!previewContainer) {
    return;
  }

  const fontData = computeFont({
    alpha: 1,
    font: 'normal normal 14px "Roboto", sans-serif',
    opacityContrast:
      parseInt(
        (
          document.querySelector(
            `#${config.addonRef}-opacityContrast`,
          ) as HTMLInputElement
        )?.value,
      ) || 1,
    weightContrast:
      parseInt(
        (
          document.querySelector(
            `#${config.addonRef}-weightContrast`,
          ) as HTMLInputElement
        )?.value,
      ) || 3,
    weightOffset:
      parseInt(
        (
          document.querySelector(
            `#${config.addonRef}-weightOffset`,
          ) as HTMLInputElement
        )?.value,
      ) || 0,
  });

  const parsingOffset =
    parseInt(
      (
        document.querySelector(
          `#${config.addonRef}-parsingOffset`,
        ) as HTMLInputElement
      )?.value,
    ) || 0;

  previewContainer.innerHTML = "";

  // Generate a preview of the bionic reading
  const textContent =
    "Zotero is a free, easy-to-use tool to help you collect, organize, annotate, cite, and share research.";
  const words = textContent.split(" ");
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const span = document.createElement("span");
    span.style.fontFamily = '"Roboto", sans-serif';
    span.style.fontSize = "14px";

    // We only bolden the beginning of the word, so we need to split the word
    let boldPart = 1;
    if (word.length >= 4) {
      boldPart = Math.ceil(word.length / 2);
    }
    boldPart += parsingOffset;
    boldPart = Math.max(Math.min(boldPart, word.length), 1);

    // Create the bolded part
    const boldSpan = document.createElement("span");
    boldSpan.style.fontWeight = fontData.bold.weight;
    boldSpan.textContent = word.slice(0, boldPart);

    // Create the rest of the word
    const normalSpan = document.createElement("span");
    normalSpan.style.fontWeight = fontData.light.weight;
    normalSpan.style.opacity = fontData.light.alpha.toString();
    normalSpan.textContent = word.slice(boldPart);

    span.appendChild(boldSpan);
    span.appendChild(normalSpan);
    previewContainer.appendChild(span);
    previewContainer.appendChild(document.createTextNode(" "));
  }
}

main();
