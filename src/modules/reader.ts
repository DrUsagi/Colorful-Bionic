import { wait } from "zotero-plugin-toolkit";
import { getPref } from "../utils/prefs";
import { getCurrentItemStatus, toggleCurrentItemStatus, getHighlightStatus, setHighlightStatus, getItemColorSetting, setItemColorSetting } from "../utils/status";

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
  Zotero.Reader._readers.forEach(async (reader) => {
    ztoolkit.log("注入脚本到现有阅读器...", reader.type);
    
    // 先等待阅读器完全加载
    const win = await waitForReaderPDFViewer(reader);
    if (win) {
      // 设置窗口参数，确保正确应用所有设置
      setWindowPrefs(reader, win);
    }
    
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
    
    // 如果已有阅读器加载完成，刷新一次视图以应用设置
    if (win) {
      setTimeout(() => {
        win.PDFViewerApplication?.pdfViewer?.refresh();
      }, 200);
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
  // 确保在注入脚本前设置窗口参数，让PDF加载时就能应用正确的设置
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
    min-width: 28px;
    width: auto;
    padding: 0 4px;
    margin: 0 2px;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    position: relative;
    font-size: 12px;
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
  
  // 脚本添加后立即刷新视图以应用设置
  setTimeout(() => {
    win.PDFViewerApplication?.pdfViewer?.refresh();
  }, 100);
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

            // 获取视口宽度和按钮位置
            const mainWindow = Zotero.getMainWindow();
            const viewportWidth = mainWindow.innerWidth || mainWindow.document.documentElement.clientWidth;
            
            // 估计的菜单宽度和最大高度
            const menuWidth = 280;
            const maxMenuHeight = 500;
            
            // 始终将菜单放置在按钮左侧
            menu.style.left = `${rect.left - menuWidth - 30}px`; // 按钮左侧30px的安全距离
            
            // 如果左侧空间不足，则最小保证10px的边距
            if (rect.left < menuWidth + 30) {
              menu.style.left = "10px";
            }
            
            // 垂直定位 - 检查下方空间是否足够
            const bottomSpace = mainWindow.innerHeight - rect.bottom;
            if (bottomSpace < maxMenuHeight) {
              // 空间不足时在按钮上方显示
              menu.style.bottom = `${mainWindow.innerHeight - rect.top}px`;
            } else {
              // 空间足够时在按钮下方显示
              menu.style.top = `${rect.bottom}px`;
            }

            // 添加到DOM
            doc.body.appendChild(menu);

            // 添加全局点击事件来关闭菜单
            const closeMenu = (e: MouseEvent) => {
              const target = e.target as HTMLElement;
              if (!menu.contains(target) && !button.contains(target)) {
                menu.remove();
                doc.removeEventListener('click', closeMenu);
              }
            };
            
            // 延迟添加事件监听器，避免立即触发
            setTimeout(() => {
              doc.addEventListener('click', closeMenu);
            }, 0);
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
  menu.style.cssText = `
    position: absolute;
    top: 100%;
    right: 0;
    background: white;
    border: 1px solid rgba(0,0,0,0.2);
    border-radius: 4px;
    padding: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 1000;
    width: max-content;
    user-select: none;
  `;

  // 确保菜单创建后立即同步所有状态
  waitForReaderPDFViewer(reader).then(win => {
    if (win) {
      // 使用正确的状态获取函数
      win.__BIONIC_READER_ENABLED = getCurrentItemStatus(reader.itemID || -1);
      win.__BIONIC_HIGHLIGHT_VERBS = getHighlightStatus(reader.itemID || -1, 'verbs');
      win.__BIONIC_HIGHLIGHT_NOUNS = getHighlightStatus(reader.itemID || -1, 'nouns');
      win.__BIONIC_HIGHLIGHT_CONJUNCTIONS = getHighlightStatus(reader.itemID || -1, 'conjunctions');
      win.__BIONIC_HIGHLIGHT_PUNCTUATION = getHighlightStatus(reader.itemID || -1, 'punctuation');
      win.__BIONIC_PUNCTUATION_BOLD = getHighlightStatus(reader.itemID || -1, 'punctuationBold');
      
      // 同步颜色设置（使用每个文档的设置）
      win.__BIONIC_VERB_HIGHLIGHT_COLOR = getItemColorSetting(reader.itemID || -1, 'verb');
      win.__BIONIC_NOUN_HIGHLIGHT_COLOR = getItemColorSetting(reader.itemID || -1, 'noun');
      win.__BIONIC_CONJUNCTION_HIGHLIGHT_COLOR = getItemColorSetting(reader.itemID || -1, 'conjunction');
      win.__BIONIC_PUNCTUATION_HIGHLIGHT_COLOR = getItemColorSetting(reader.itemID || -1, 'punctuation');
      
      // 刷新视图以显示更改
      win.PDFViewerApplication?.pdfViewer?.refresh();
    }
  });

  // 创建Bionic阅读模式开关（黑白模式）
  const bionicOption = createOptionCheckbox(
    doc,
    "enableBionicReader",
    "启用Bionic阅读",
    async (checked: boolean) => {
      // 更新设置
      toggleCurrentItemStatus(reader.itemID || -1);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_READER_ENABLED = getCurrentItemStatus(reader.itemID || -1);
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
      // 更新按钮状态
      const button = doc.querySelector(`.${addon.data.config.addonRef}-reader-button`) as HTMLButtonElement;
      if (button) {
        updateReaderToolbarButton(button, reader);
      }
    },
    getCurrentItemStatus(reader.itemID || -1)  // 传入当前文章的实际状态
  );

  const bionicDesc = doc.createElement("div");
  bionicDesc.textContent = "（黑白加粗模式）";
  bionicDesc.style.fontSize = "11px";
  bionicDesc.style.color = "#666";
  bionicDesc.style.marginLeft = "20px";
  bionicDesc.style.marginBottom = "5px";

  menu.appendChild(bionicOption);
  menu.appendChild(bionicDesc);

  // 创建分隔线
  menu.appendChild(createDivider(doc));

  // 添加词性高亮标题
  const highlightTitle = doc.createElement("div");
  highlightTitle.textContent = "词性标注功能:";
  highlightTitle.style.fontWeight = "bold";
  highlightTitle.style.marginBottom = "5px";

  menu.appendChild(highlightTitle);

  // 创建动词高亮选项
  const verbOption = createOptionCheckbox(
    doc,
    "highlightVerbs",
    "高亮动词",
    async (checked: boolean) => {
      // 更新设置
      setHighlightStatus(reader.itemID || -1, 'verbs', checked);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_HIGHLIGHT_VERBS = checked;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
      // 更新按钮状态
      const button = doc.querySelector(`.${addon.data.config.addonRef}-reader-button`) as HTMLButtonElement;
      if (button) {
        updateReaderToolbarButton(button, reader);
      }
    },
    getHighlightStatus(reader.itemID || -1, 'verbs')  // 使用新函数获取当前状态
  );
  menu.appendChild(verbOption);

  // 添加动词颜色选择器
  const verbColorOption = createColorOption(
    doc,
    'verb',
    '动词颜色: ',
    [
      { color: "#FF5252", id: "verb-color-1" },  // 红色
      { color: "#E53935", id: "verb-color-2" },  // 深红色
      { color: "#D81B60", id: "verb-color-3" },  // 粉红色
      { color: "#8E24AA", id: "verb-color-4" },  // 紫色
      { color: "#5E35B1", id: "verb-color-5" },  // 深紫色
      { color: "#3949AB", id: "verb-color-6" },  // 靛蓝色
      { color: "#1E88E5", id: "verb-color-7" },  // 蓝色
      { color: "#039BE5", id: "verb-color-8" },  // 浅蓝色
      { color: "#00ACC1", id: "verb-color-9" },  // 青色
      { color: "#00897B", id: "verb-color-10" }  // 蓝绿色
    ],
    async (color: string) => {
      // 更新设置
      setItemColorSetting(reader.itemID || -1, 'verb', color);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_VERB_HIGHLIGHT_COLOR = color;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
    },
    reader
  );
  menu.appendChild(verbColorOption);

  // 创建名词高亮选项
  const nounOption = createOptionCheckbox(
    doc,
    "highlightNouns",
    "高亮名词",
    async (checked: boolean) => {
      // 更新设置
      setHighlightStatus(reader.itemID || -1, 'nouns', checked);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_HIGHLIGHT_NOUNS = checked;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
      // 更新按钮状态
      const button = doc.querySelector(`.${addon.data.config.addonRef}-reader-button`) as HTMLButtonElement;
      if (button) {
        updateReaderToolbarButton(button, reader);
      }
    },
    getHighlightStatus(reader.itemID || -1, 'nouns')  // 使用新函数获取当前状态
  );
  menu.appendChild(nounOption);

  // 添加名词颜色选择器
  const nounColorOption = createColorOption(
    doc,
    'noun',
    '名词颜色: ',
    [
      { color: "#5252FF", id: "noun-color-1" },  // 靛蓝色
      { color: "#3F51B5", id: "noun-color-2" },  // 蓝紫色
      { color: "#1976D2", id: "noun-color-3" },  // 深蓝色
      { color: "#0288D1", id: "noun-color-4" },  // 亮蓝色
      { color: "#0097A7", id: "noun-color-5" },  // 青色
      { color: "#607D8B", id: "noun-color-6" },  // 蓝灰色
      { color: "#757575", id: "noun-color-7" },  // 灰色
      { color: "#9E9E9E", id: "noun-color-8" },  // 浅灰色
      { color: "#37474F", id: "noun-color-9" },  // 深蓝灰色
      { color: "#455A64", id: "noun-color-10" }  // 蓝灰色
    ],
    async (color: string) => {
      // 更新设置
      setItemColorSetting(reader.itemID || -1, 'noun', color);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_NOUN_HIGHLIGHT_COLOR = color;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
    },
    reader
  );
  menu.appendChild(nounColorOption);

  // 创建连词高亮选项
  const conjunctionOption = createOptionCheckbox(
    doc,
    "highlightConjunctions",
    "高亮连词",
    async (checked: boolean) => {
      // 更新设置
      setHighlightStatus(reader.itemID || -1, 'conjunctions', checked);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_HIGHLIGHT_CONJUNCTIONS = checked;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
      // 更新按钮状态
      const button = doc.querySelector(`.${addon.data.config.addonRef}-reader-button`) as HTMLButtonElement;
      if (button) {
        updateReaderToolbarButton(button, reader);
      }
    },
    getHighlightStatus(reader.itemID || -1, 'conjunctions')  // 使用新函数获取当前状态
  );
  menu.appendChild(conjunctionOption);

  // 添加连词颜色选择器
  const conjunctionColorOption = createColorOption(
    doc,
    'conjunction',
    '连词颜色: ',
    [
      { color: "#FFA500", id: "conjunction-color-1" },  // 橙色
      { color: "#F57C00", id: "conjunction-color-2" },  // 深橙色
      { color: "#FF9800", id: "conjunction-color-3" },  // 橙色 
      { color: "#FF8F00", id: "conjunction-color-4" },  // 琥珀色
      { color: "#FFB300", id: "conjunction-color-5" },  // 琥珀色
      { color: "#FBC02D", id: "conjunction-color-6" },  // 深黄色
      { color: "#FFC107", id: "conjunction-color-7" },  // 琥珀色
      { color: "#FFD54F", id: "conjunction-color-8" },  // 浅琥珀色
      { color: "#FFCA28", id: "conjunction-color-9" },  // 琥珀色
      { color: "#FFE082", id: "conjunction-color-10" }  // 浅琥珀色
    ],
    async (color: string) => {
      // 更新设置
      setItemColorSetting(reader.itemID || -1, 'conjunction', color);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_CONJUNCTION_HIGHLIGHT_COLOR = color;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
    },
    reader
  );
  menu.appendChild(conjunctionColorOption);

  // 创建标点符号高亮选项
  const punctuationOption = createOptionCheckbox(
    doc,
    "highlightPunctuation",
    "高亮标点符号",
    async (checked: boolean) => {
      // 更新设置
      setHighlightStatus(reader.itemID || -1, 'punctuation', checked);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_HIGHLIGHT_PUNCTUATION = checked;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
      // 更新按钮状态
      const button = doc.querySelector(`.${addon.data.config.addonRef}-reader-button`) as HTMLButtonElement;
      if (button) {
        updateReaderToolbarButton(button, reader);
      }
    },
    getHighlightStatus(reader.itemID || -1, 'punctuation')
  );
  menu.appendChild(punctuationOption);

  // 创建标点符号加粗选项
  const punctuationBoldOption = createOptionCheckbox(
    doc,
    "punctuationBold",
    "标点符号加粗",
    async (checked: boolean) => {
      // 更新设置
      setHighlightStatus(reader.itemID || -1, 'punctuationBold', checked);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_PUNCTUATION_BOLD = checked;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
      // 更新按钮状态
      const button = doc.querySelector(`.${addon.data.config.addonRef}-reader-button`) as HTMLButtonElement;
      if (button) {
        updateReaderToolbarButton(button, reader);
      }
    },
    getHighlightStatus(reader.itemID || -1, 'punctuationBold')
  );
  menu.appendChild(punctuationBoldOption);

  // 添加标点符号颜色选择器
  const punctuationColorOption = createColorOption(
    doc,
    'punctuation',
    '标点符号颜色: ',
    [
      { color: "#FF00FF", id: "punctuation-color-1" },   // 洋红色
      { color: "#E040FB", id: "punctuation-color-2" },   // 紫色
      { color: "#D500F9", id: "punctuation-color-3" },   // 紫色
      { color: "#AA00FF", id: "punctuation-color-4" },   // 深紫色
      { color: "#7B1FA2", id: "punctuation-color-5" },   // 紫色
      { color: "#6A1B9A", id: "punctuation-color-6" },   // 深紫色
      { color: "#4A148C", id: "punctuation-color-7" },   // 暗紫色
      { color: "#F50057", id: "punctuation-color-8" },   // 粉红色
      { color: "#C51162", id: "punctuation-color-9" },   // 深粉色
      { color: "#880E4F", id: "punctuation-color-10" }   // 暗粉色
    ],
    async (color: string) => {
      // 更新设置
      setItemColorSetting(reader.itemID || -1, 'punctuation', color);
      // 刷新视图
      const win = await waitForReaderPDFViewer(reader);
      if (win) {
        win.__BIONIC_PUNCTUATION_HIGHLIGHT_COLOR = color;
        await win.PDFViewerApplication?.pdfViewer?.refresh();
      }
    },
    reader
  );
  menu.appendChild(punctuationColorOption);

  return menu;
}

/**
 * 创建选项复选框
 */
function createOptionCheckbox(
  doc: Document,
  prefName: string,
  label: string,
  onChange: (checked: boolean) => void,
  initialState: boolean
): HTMLElement {
  const container = doc.createElement("div");
  container.style.margin = "8px 0";
  container.style.display = "flex";
  container.style.alignItems = "center";

  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  
  // 获取当前实际状态
  checkbox.checked = initialState;
  
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
    // 点击标签时也切换复选框状态
    checkbox.checked = !checkbox.checked;
    onChange(checkbox.checked);
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
  prefName: 'verb' | 'noun' | 'conjunction' | 'punctuation',
  label: string,
  colors: { color: string, id: string }[],
  onChange: (color: string) => void,
  reader: _ZoteroTypes.ReaderInstance
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
  const currentColor = getItemColorSetting(reader.itemID || -1, prefName);

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
  
  // 获取文档对象
  const doc = button.ownerDocument;
  
  // 获取各功能的状态
  const bionicEnabled = enableBionicReader !== undefined 
    ? enableBionicReader 
    : getCurrentItemStatus(reader.itemID || -1);
  const verbsEnabled = getHighlightStatus(reader.itemID || -1, 'verbs');
  const nounsEnabled = getHighlightStatus(reader.itemID || -1, 'nouns');
  const conjunctionsEnabled = getHighlightStatus(reader.itemID || -1, 'conjunctions');
  const punctuationEnabled = getHighlightStatus(reader.itemID || -1, 'punctuation');
  const punctuationBoldEnabled = getHighlightStatus(reader.itemID || -1, 'punctuationBold');
  
  // 获取各功能的颜色设置
  const verbColor = getItemColorSetting(reader.itemID || -1, 'verb');
  const nounColor = getItemColorSetting(reader.itemID || -1, 'noun');
  const conjunctionColor = getItemColorSetting(reader.itemID || -1, 'conjunction');
  const punctuationColor = getItemColorSetting(reader.itemID || -1, 'punctuation');
  
  // 创建按钮内容的容器
  const container = doc.createElement('div');
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  
  // 创建Bio文本
  const bioText = doc.createElement('span');
  bioText.textContent = bionicEnabled ? "BIO" : "bio";
  bioText.style.marginRight = '2px';
  container.appendChild(bioText);
  
  // 添加功能指示字母
  if (verbsEnabled) {
    const vIndicator = doc.createElement('span');
    vIndicator.textContent = 'V';
    vIndicator.style.color = verbColor;
    if (bionicEnabled) vIndicator.style.fontWeight = 'bold';
    container.appendChild(vIndicator);
  }
  
  if (nounsEnabled) {
    const nIndicator = doc.createElement('span');
    nIndicator.textContent = 'N';
    nIndicator.style.color = nounColor;
    if (bionicEnabled) nIndicator.style.fontWeight = 'bold';
    container.appendChild(nIndicator);
  }
  
  if (conjunctionsEnabled) {
    const cIndicator = doc.createElement('span');
    cIndicator.textContent = 'C';
    cIndicator.style.color = conjunctionColor;
    if (bionicEnabled) cIndicator.style.fontWeight = 'bold';
    container.appendChild(cIndicator);
  }
  
  if (punctuationEnabled) {
    const pIndicator = doc.createElement('span');
    pIndicator.textContent = 'P';
    pIndicator.style.color = punctuationColor;
    if (punctuationBoldEnabled) pIndicator.style.fontWeight = 'bold';
    container.appendChild(pIndicator);
  }
  
  // 清空按钮内容并添加新内容
  button.textContent = '';
  button.appendChild(container);
  
  // 根据启用的高亮功能设置边框
  if (verbsEnabled || nounsEnabled || conjunctionsEnabled || punctuationEnabled || punctuationBoldEnabled) {
    button.style.borderWidth = "2px";
    
    // 根据启用的高亮类型设置不同的边框颜色
    if (verbsEnabled && nounsEnabled && conjunctionsEnabled && punctuationEnabled) {
      button.style.borderColor = "#000"; // 全部启用时，边框为黑色
    } else {
      const colors = [];
      if (verbsEnabled) colors.push(verbColor); // 动词颜色
      if (nounsEnabled) colors.push(nounColor); // 名词颜色
      if (conjunctionsEnabled) colors.push(conjunctionColor); // 连词颜色
      if (punctuationEnabled) colors.push(punctuationColor); // 标点颜色
      
      if (colors.length === 1) {
        button.style.borderColor = colors[0]; // 单种高亮时使用该颜色
      } else if (colors.length > 1) {
        // 多种高亮时使用渐变色
        button.style.borderImage = `linear-gradient(to right, ${colors.join(", ")}) 1`;
      }
    }
    
    // 当punctuationBold独立激活时也要有特殊样式
    if (punctuationBoldEnabled && !verbsEnabled && !nounsEnabled && !conjunctionsEnabled && !punctuationEnabled) {
      button.style.borderColor = "#666";
    }
  } else {
    // 没有启用高亮功能，使用默认边框
    button.style.borderWidth = "1px";
    button.style.borderColor = "#ccc";
    button.style.borderImage = "none";
  }
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
  
  // 确保设置和状态正确同步
  setWindowPrefs(reader, win);

  // 更新Bio按钮
  const bioButton = reader._iframeWindow?.document.querySelector(
    `.${addon.data.config.addonRef}-reader-button`,
  ) as HTMLButtonElement;

  if (bioButton) {
    ztoolkit.log("更新已存在的Bio按钮");
    // 确保使用最新状态更新按钮
    updateReaderToolbarButton(bioButton, reader);
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

  // 一定要刷新页面以应用所有设置
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
  
  // 设置词性高亮状态
  win.__BIONIC_HIGHLIGHT_VERBS = getHighlightStatus(reader.itemID || -1, 'verbs');
  win.__BIONIC_HIGHLIGHT_NOUNS = getHighlightStatus(reader.itemID || -1, 'nouns');
  win.__BIONIC_HIGHLIGHT_CONJUNCTIONS = getHighlightStatus(reader.itemID || -1, 'conjunctions');
  win.__BIONIC_HIGHLIGHT_PUNCTUATION = getHighlightStatus(reader.itemID || -1, 'punctuation');
  
  // 设置标点符号加粗
  win.__BIONIC_PUNCTUATION_BOLD = getHighlightStatus(reader.itemID || -1, 'punctuationBold');
  
  // 设置颜色（使用每个文档的设置）
  win.__BIONIC_VERB_HIGHLIGHT_COLOR = getItemColorSetting(reader.itemID || -1, 'verb');
  win.__BIONIC_NOUN_HIGHLIGHT_COLOR = getItemColorSetting(reader.itemID || -1, 'noun');
  win.__BIONIC_CONJUNCTION_HIGHLIGHT_COLOR = getItemColorSetting(reader.itemID || -1, 'conjunction');
  win.__BIONIC_PUNCTUATION_HIGHLIGHT_COLOR = getItemColorSetting(reader.itemID || -1, 'punctuation');
  
  // 设置其他参数
  win.__BIONIC_PARSING_OFFSET = Number(getPref("parsingOffset") || 0);
  win.__BIONIC_OPACITY_CONTRAST = Number(getPref("opacityContrast") || 1);
  win.__BIONIC_WEIGHT_CONTRAST = Number(getPref("weightContrast") || 1);
  win.__BIONIC_WEIGHT_OFFSET = Number(getPref("weightOffset") || 0);
}

function deleteWindowPrefs(win: Window) {
  delete win.__BIONIC_READER_ENABLED;
  delete win.__BIONIC_HIGHLIGHT_VERBS;
  delete win.__BIONIC_VERB_HIGHLIGHT_COLOR;
  delete win.__BIONIC_HIGHLIGHT_NOUNS;
  delete win.__BIONIC_NOUN_HIGHLIGHT_COLOR;
  delete win.__BIONIC_HIGHLIGHT_CONJUNCTIONS;
  delete win.__BIONIC_CONJUNCTION_HIGHLIGHT_COLOR;
  delete win.__BIONIC_HIGHLIGHT_PUNCTUATION;
  delete win.__BIONIC_PUNCTUATION_HIGHLIGHT_COLOR;
  delete win.__BIONIC_PUNCTUATION_BOLD;
  delete win.__BIONIC_PARSING_OFFSET;
  delete win.__BIONIC_OPACITY_CONTRAST;
  delete win.__BIONIC_WEIGHT_CONTRAST;
  delete win.__BIONIC_WEIGHT_OFFSET;
}
