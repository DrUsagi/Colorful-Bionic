import { wait } from "zotero-plugin-toolkit";
import { getPref } from "../utils/prefs";
import { getCurrentItemStatus, toggleCurrentItemStatus } from "../utils/status";

export { initReader, unInitReader, refreshReaders };

const scriptContent = {
  pdf: "",
  epub: "",
  snapshot: "",
};

function initReader() {
  ztoolkit.log("初始化阅读器...");

  Zotero.Reader.registerEventListener(
    "renderToolbar",
    (event) => {
      ztoolkit.log("正在处理renderToolbar事件...", event);
      injectScript(event);
      injectToolbarButton(event);
    },
    addon.data.config.addonID,
  );

  // 确保对已打开的读者应用脚本和工具栏按钮
  ztoolkit.log("处理现有阅读器...", Zotero.Reader._readers.length);
  Zotero.Reader._readers.forEach((reader) => {
    ztoolkit.log("注入脚本到现有阅读器...", reader.type);
    injectScript({ reader });

    // 也尝试为现有阅读器添加工具栏按钮
    if (reader._iframeWindow && reader._iframeWindow.document) {
      const doc = reader._iframeWindow.document;
      const toolbar = doc.querySelector(".toolbar");
      if (toolbar) {
        ztoolkit.log("为现有阅读器添加工具栏按钮...");
        injectToolbarButton({
          reader,
          doc,
          append: (...elems) => {
            for (const elem of elems) {
              toolbar.appendChild(elem);
            }
          }
        });
      }
    }
  });
}

function unInitReader() {
  Zotero.Reader._readers.forEach((reader) => {
    if (reader.type !== "pdf") {
      return;
    }
    // @ts-ignore  Not typed yet
    const win = reader._primaryView._iframeWindow as Window;
    deleteWindowPrefs(win);
    const script = win.document.getElementById("bionic-reader");
    if (script) {
      script.remove();
    }
  });
}

async function injectScript(event: { reader: _ZoteroTypes.ReaderInstance }) {
  const { reader } = event;
  const win = await waitForReaderPDFViewer(reader);
  if (!win) {
    return;
  }
  setWindowPrefs(reader, win);
  const doc = win.document;
  const type = reader.type;
  if (type !== "pdf") {
    return;
  }

  // 添加Bio按钮菜单样式
  const bioMenuStyle = `
  .${addon.data.config.addonRef}-reader-button {
    display: flex !important;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    color: #5c5c5c;
    height: 24px;
    width: 28px;
    margin: 0 2px;
    padding: 0;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    position: relative;
  }
  .${addon.data.config.addonRef}-reader-button:hover {
    background-color: rgba(0, 0, 0, 0.06);
  }
  .${addon.data.config.addonRef}-bio-menu {
    z-index: 1000;
    min-width: 200px;
  }
  `;

  // 插入样式
  const styleElem = doc.createElement("style");
  styleElem.textContent = bioMenuStyle;
  doc.head.appendChild(styleElem);

  ztoolkit.log("Injecting reader script", type);
  const script = doc.createElement("script");
  script.id = "bionic-reader";
  if (!(type in scriptContent)) {
    ztoolkit.log("Unknown reader type", type);
    return;
  }
  if (!scriptContent[type]) {
    scriptContent[type] = await Zotero.File.getContentsFromURLAsync(
      `chrome://${addon.data.config.addonRef}/content/scripts/reader/${type}.js`,
    );
  }
  script.textContent = scriptContent[type];
  doc.head.appendChild(script);
}

function injectToolbarButton(event: {
  reader: _ZoteroTypes.ReaderInstance;
  doc: Document;
  append: (...elems: Node[]) => void;
}) {
  const { reader, doc, append } = event;

  ztoolkit.log("注入工具栏按钮...", reader.type, getPref("enableReaderToolbarButton"));

  if (reader.type !== "pdf") {
    ztoolkit.log("不是PDF阅读器，跳过工具栏按钮注入");
    return;
  }

  // 检查是否已经存在按钮，避免重复添加
  const existingButton = doc.querySelector(`.${addon.data.config.addonRef}-reader-button`);
  if (existingButton) {
    ztoolkit.log("工具栏按钮已存在，更新状态");
    updateReaderToolbarButton(existingButton as HTMLButtonElement, reader);
    return;
  }

  // Bio按钮 - 控制Bionic阅读模式
  if (getPref("enableReaderToolbarButton")) {
    ztoolkit.log("创建Bio按钮元素");
    const bioButton = ztoolkit.UI.createElement(doc, "button", {
      namespace: "html",
      classList: [
        "toolbar-button",
        `${addon.data.config.addonRef}-reader-button`,
      ],
      properties: {
        tabIndex: -1,
      },
      listeners: [
        {
          type: "click",
          listener: async (ev: Event) => {
            ev.preventDefault();
            ev.stopPropagation();

            // 关闭已有菜单
            const existingMenu = doc.querySelector(`.${addon.data.config.addonRef}-bio-menu`);
            if (existingMenu) {
              existingMenu.remove();
              return;
            }

            // 显示弹出菜单
            const button = ev.target as HTMLButtonElement;
            const rect = button.getBoundingClientRect();

            // 创建并显示设置菜单
            const menu = createBioOptionsMenu(doc, reader);
            menu.style.position = "absolute";

            // 修改弹出位置：菜单显示在按钮左侧
            const menuWidth = 220; // 估计的菜单宽度，略大于minWidth以确保足够空间
            menu.style.top = `${rect.top}px`;

            // 检查按钮左侧的空间是否足够，如果不够则显示在按钮右侧
            if (rect.left >= menuWidth + 10) { // 10px的安全距离
              // 有足够空间在左侧显示
              menu.style.left = `${rect.left - menuWidth}px`;
            } else {
              // 左侧空间不足，尝试在右侧显示
              menu.style.left = `${rect.right}px`;
            }

            // 添加到DOM
            doc.body.appendChild(menu);

            // 检查实际菜单位置是否超出窗口边界，并进行调整
            setTimeout(() => {
              const menuRect = menu.getBoundingClientRect();

              // 检查左侧边界
              if (menuRect.left < 0) {
                menu.style.left = "5px"; // 保持5px的边距
              }

              // 检查右侧边界
              const windowWidth = window.innerWidth;
              if (menuRect.right > windowWidth) {
                menu.style.left = `${windowWidth - menuRect.width - 5}px`; // 保持5px的边距
              }

              // 检查顶部边界
              if (menuRect.top < 0) {
                menu.style.top = "5px";
              }

              // 检查底部边界
              const windowHeight = window.innerHeight;
              if (menuRect.bottom > windowHeight) {
                menu.style.top = `${windowHeight - menuRect.height - 5}px`;
              }
            }, 0);

            // 定义关闭菜单的函数
            const closeMenu = (e: MouseEvent) => {
              // 确保点击不是在菜单内部
              if (!menu.contains(e.target as Node) || e.target === button) {
                menu.remove();
                doc.removeEventListener("click", closeMenu, true);
                doc.removeEventListener("mousedown", closeMenu, true);
              }
            };

            // 延迟添加点击监听，避免立即触发
            setTimeout(() => {
              // 使用捕获阶段监听点击事件以确保优先处理
              doc.addEventListener("click", closeMenu, true);
              doc.addEventListener("mousedown", closeMenu, true);
            }, 100);
          },
        },
      ],
      enableElementRecord: false,
    });
    ztoolkit.log("更新Bio按钮状态");
    updateReaderToolbarButton(bioButton, reader);
    ztoolkit.log("添加Bio按钮到工具栏");
    append(bioButton);
  } else {
    ztoolkit.log("Bio按钮已禁用，跳过添加");
  }
}

/**
 * 创建Bio选项菜单
 */
function createBioOptionsMenu(doc: Document, reader: _ZoteroTypes.ReaderInstance): HTMLElement {
  const menu = doc.createElement("div");
  menu.className = `${addon.data.config.addonRef}-bio-menu`;
  menu.style.background = "#fff";
  menu.style.border = "1px solid #ccc";
  menu.style.borderRadius = "3px";
  menu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
  menu.style.padding = "8px";
  menu.style.zIndex = "1000";
  menu.style.minWidth = "200px";

  // 添加防止菜单位置超出视图范围的处理
  menu.style.maxHeight = "80vh";
  menu.style.overflowY = "auto";

  // 阻止菜单上的点击事件冒泡
  menu.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  menu.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  // 创建Bionic阅读模式开关（黑白模式）
  const bionicOption = createOptionCheckbox(
    doc,
    "enableBionicReader",
    "启用Bionic阅读",
    async (checked: boolean) => {
      // 更新设置
      toggleCurrentItemStatus(reader.itemID || -1);
    }
  );

  const bionicDesc = doc.createElement("div");
  bionicDesc.textContent = "（黑白加粗模式）";
  bionicDesc.style.fontSize = "11px";
  bionicDesc.style.color = "#666";
  bionicDesc.style.marginLeft = "20px";
  bionicDesc.style.marginBottom = "5px";

  // 阻止描述文本上的点击事件冒泡
  bionicDesc.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  menu.appendChild(bionicOption);
  menu.appendChild(bionicDesc);

  // 创建分隔线
  menu.appendChild(createDivider(doc));

  // 添加词性高亮标题
  const highlightTitle = doc.createElement("div");
  highlightTitle.textContent = "词性标注功能:";
  highlightTitle.style.fontWeight = "bold";
  highlightTitle.style.marginBottom = "5px";

  // 阻止标题上的点击事件冒泡
  highlightTitle.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  menu.appendChild(highlightTitle);

  // 创建动词高亮选项
  const verbOption = createOptionCheckbox(
    doc,
    "highlightVerbs",
    "高亮动词",
    async (checked: boolean) => {
      // 更新设置
      Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.highlightVerbs`, checked);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_HIGHLIGHT_VERBS = checked;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
    }
  );
  menu.appendChild(verbOption);

  // 添加动词颜色选择器
  const verbColorOption = createColorOption(
    doc,
    "verbHighlightColor",
    "动词颜色: ",
    [
      { color: "#FF5252", id: "verb-color-1" },
      { color: "#FF9800", id: "verb-color-2" },
      { color: "#FF4081", id: "verb-color-3" },
      { color: "#9C27B0", id: "verb-color-4" },
      { color: "#673AB7", id: "verb-color-5" }
    ],
    async (color: string) => {
      // 更新设置
      Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.verbHighlightColor`, color);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_VERB_HIGHLIGHT_COLOR = color;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
    }
  );
  menu.appendChild(verbColorOption);

  // 创建名词高亮选项
  const nounOption = createOptionCheckbox(
    doc,
    "highlightNouns",
    "高亮名词",
    async (checked: boolean) => {
      // 更新设置
      Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.highlightNouns`, checked);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_HIGHLIGHT_NOUNS = checked;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
    }
  );
  menu.appendChild(nounOption);

  // 添加名词颜色选择器
  const nounColorOption = createColorOption(
    doc,
    "nounHighlightColor",
    "名词颜色: ",
    [
      { color: "#5252FF", id: "noun-color-1" },
      { color: "#2196F3", id: "noun-color-2" },
      { color: "#00BCD4", id: "noun-color-3" },
      { color: "#4CAF50", id: "noun-color-4" },
      { color: "#8BC34A", id: "noun-color-5" }
    ],
    async (color: string) => {
      // 更新设置
      Zotero.Prefs.set(`${addon.data.config.prefsPrefix}.nounHighlightColor`, color);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_NOUN_HIGHLIGHT_COLOR = color;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
    }
  );
  menu.appendChild(nounColorOption);

  return menu;
}

/**
 * 创建选项复选框
 */
function createOptionCheckbox(
  doc: Document,
  prefName: string,
  label: string,
  onChange: (checked: boolean) => void
): HTMLElement {
  const container = doc.createElement("div");
  container.style.margin = "8px 0";
  container.style.display = "flex";
  container.style.alignItems = "center";

  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = Boolean(getPref(prefName));
  checkbox.style.marginRight = "8px";

  // 修改事件处理，阻止冒泡
  checkbox.addEventListener("change", (e) => {
    e.stopPropagation();
    onChange(checkbox.checked);
  });

  checkbox.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  const labelElem = doc.createElement("label");
  labelElem.textContent = label;
  labelElem.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  container.appendChild(checkbox);
  container.appendChild(labelElem);

  // 阻止容器上的点击事件冒泡
  container.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  return container;
}

/**
 * 创建颜色选项
 */
function createColorOption(
  doc: Document,
  prefName: string,
  label: string,
  colors: { color: string, id: string }[],
  onChange: (color: string) => void
): HTMLElement {
  const container = doc.createElement("div");
  container.style.margin = "8px 0";
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.flexWrap = "wrap";

  // 阻止容器点击事件冒泡
  container.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  const labelElem = doc.createElement("span");
  labelElem.textContent = label;
  labelElem.style.marginRight = "8px";
  labelElem.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  container.appendChild(labelElem);

  // 颜色预设容器
  const presetsContainer = doc.createElement("div");
  presetsContainer.style.display = "flex";
  presetsContainer.style.flexWrap = "wrap";
  presetsContainer.style.gap = "4px";

  // 阻止颜色容器点击事件冒泡
  presetsContainer.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  // 获取当前颜色值
  const currentColor = String(getPref(prefName) || colors[0].color);

  // 创建颜色预设
  colors.forEach(({ color, id }) => {
    const preset = doc.createElement("div");
    preset.id = id;
    preset.style.width = "20px";
    preset.style.height = "20px";
    preset.style.backgroundColor = color;
    preset.style.borderRadius = "3px";
    preset.style.cursor = "pointer";
    preset.style.border = color === currentColor ? "2px solid #000" : "1px solid #ccc";

    preset.addEventListener("click", (e) => {
      // 阻止事件冒泡
      e.stopPropagation();

      // 更新所有预设的边框
      colors.forEach(c => {
        const el = doc.getElementById(c.id);
        if (el) {
          el.style.border = c.color === color ? "2px solid #000" : "1px solid #ccc";
        }
      });

      // 调用回调函数
      onChange(color);
    });

    presetsContainer.appendChild(preset);
  });

  container.appendChild(presetsContainer);
  return container;
}

/**
 * 创建分隔线
 */
function createDivider(doc: Document): HTMLElement {
  const divider = doc.createElement("hr");
  divider.style.margin = "10px 0";
  divider.style.border = "none";
  divider.style.height = "1px";
  divider.style.backgroundColor = "#e5e5e5";

  // 阻止分隔线上的点击事件冒泡
  divider.addEventListener("click", (e) => {
    e.stopPropagation();
  });

  divider.addEventListener("mousedown", (e) => {
    e.stopPropagation();
  });

  return divider;
}

function updateReaderToolbarButton(
  button: HTMLButtonElement,
  reader: _ZoteroTypes.ReaderInstance,
  enableBionicReader?: boolean,
) {
  if (!button) {
    return;
  }
  if (enableBionicReader === undefined) {
    enableBionicReader = getCurrentItemStatus(reader.itemID || -1);
  }

  // 获取高亮状态
  const highlightVerbs = Boolean(getPref("highlightVerbs"));
  const highlightNouns = Boolean(getPref("highlightNouns"));
  const hasHighlights = highlightVerbs || highlightNouns;

  // 创建状态指示器
  let statusText = "";
  if (highlightVerbs) statusText += "V";
  if (highlightNouns) statusText += "N";

  // 设置提示文本
  if (enableBionicReader && hasHighlights) {
    button.title = "Bionic阅读 + 词性标注已启用";
  } else if (enableBionicReader) {
    button.title = "Bionic阅读已启用";
  } else if (hasHighlights) {
    button.title = "词性标注已启用";
  } else {
    button.title = "点击启用功能";
  }

  // 设置按钮样式，根据当前状态
  if (enableBionicReader) {
    button.innerHTML = `<b>Bi</b><span style="font-weight: lighter">o</span>`;
    button.style.color = "#4285f4";
  } else {
    button.innerHTML = "Bio";
    button.style.color = "";
  }

  // 如果有词性高亮，添加指示器
  if (statusText) {
    button.innerHTML += `<sup style="font-size: 10px; font-weight: bold; color: ${enableBionicReader ? "#FFFFFF" : "#4285f4"}">${statusText}</sup>`;
  }

  button.disabled = false;
}

async function waitForReaderPDFViewer(
  reader: _ZoteroTypes.ReaderInstance,
): Promise<Window | null> {
  if (reader.type !== "pdf") {
    return null;
  }
  await wait.waitForReader(reader);
  await wait.waitUtilAsync(
    // @ts-ignore  Not typed yet
    () => reader._primaryView?._iframeWindow,
    100,
    10000,
  );
  // @ts-ignore  Not typed yet
  const win = reader._primaryView._iframeWindow;
  await wait.waitUtilAsync(
    () => win.PDFViewerApplication?.pdfViewer,
    100,
    10000,
  );
  return win;
}

async function refreshReader(reader: _ZoteroTypes.ReaderInstance) {
  ztoolkit.log("刷新阅读器...", reader.type);
  const win = await waitForReaderPDFViewer(reader);
  if (!win) {
    ztoolkit.log("找不到PDF查看器窗口");
    return;
  }
  setWindowPrefs(reader, win);

  // 更新Bio按钮
  const bioButton = reader._iframeWindow?.document.querySelector(
    `.${addon.data.config.addonRef}-reader-button`,
  ) as HTMLButtonElement;

  if (bioButton) {
    ztoolkit.log("更新已存在的Bio按钮");
    updateReaderToolbarButton(bioButton, reader, win.__BIONIC_READER_ENABLED);
  } else {
    ztoolkit.log("Bio按钮不存在，尝试重新创建");
    // 如果按钮不存在，尝试重新添加
    if (reader._iframeWindow && getPref("enableReaderToolbarButton")) {
      const doc = reader._iframeWindow.document;
      const toolbar = doc.querySelector(".toolbar");
      if (toolbar) {
        injectToolbarButton({
          reader,
          doc,
          append: (...elems) => {
            for (const elem of elems) {
              toolbar.appendChild(elem);
            }
          }
        });
      }
    }
  }

  await win.PDFViewerApplication?.pdfViewer?.refresh();
}

async function refreshReaders(readers?: _ZoteroTypes.ReaderInstance[]) {
  if (!readers) {
    readers = Zotero.Reader._readers;
  }
  await Promise.all(
    readers.map(async (reader) => {
      return await refreshReader(reader);
    }),
  );
}

function setWindowPrefs(reader: _ZoteroTypes.ReaderInstance, win: Window) {
  win.__BIONIC_READER_ENABLED = getCurrentItemStatus(reader.itemID || -1);
  win.__BIONIC_PARSING_OFFSET = Number(getPref("parsingOffset")) || 0;
  win.__BIONIC_OPACITY_CONTRAST = Number(getPref("opacityContrast")) || 0;
  win.__BIONIC_WEIGHT_CONTRAST = Number(getPref("weightContrast")) || 0;
  win.__BIONIC_WEIGHT_OFFSET = Number(getPref("weightOffset")) || 0;
  win.__BIONIC_HIGHLIGHT_VERBS = Boolean(getPref("highlightVerbs"));
  win.__BIONIC_VERB_HIGHLIGHT_COLOR = String(getPref("verbHighlightColor") || "#FF5252");
  win.__BIONIC_HIGHLIGHT_NOUNS = Boolean(getPref("highlightNouns"));
  win.__BIONIC_NOUN_HIGHLIGHT_COLOR = String(getPref("nounHighlightColor") || "#5252FF");
}

function deleteWindowPrefs(win: Window) {
  delete win.__BIONIC_READER_ENABLED;
  delete win.__BIONIC_PARSING_OFFSET;
  delete win.__BIONIC_OPACITY_CONTRAST;
  delete win.__BIONIC_WEIGHT_CONTRAST;
  delete win.__BIONIC_WEIGHT_OFFSET;
  delete win.__BIONIC_HIGHLIGHT_VERBS;
  delete win.__BIONIC_VERB_HIGHLIGHT_COLOR;
  delete win.__BIONIC_HIGHLIGHT_NOUNS;
  delete win.__BIONIC_NOUN_HIGHLIGHT_COLOR;
}
