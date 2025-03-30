import { getPrefJSON, getPref, setPref } from "./prefs";

export { getCurrentItemStatus, toggleCurrentItemStatus, getHighlightStatus, setHighlightStatus };

function getCurrentItemStatus(itemID: number): boolean {
  const bionicTemporaryData = getPrefJSON("bionicTemporaryData") || {};
  let currentStatus = bionicTemporaryData[itemID];
  if (currentStatus === undefined) {
    // 如果是无效的itemID，返回false
    if (itemID === -1) {
      return false;
    }
    // 获取文章语言设置
    const item = Zotero.Items.get(itemID);
    if (!item) {
      return false;
    }
    const topLevelItem = Zotero.Items.getTopLevel([item])[0];
    if (isDisabledLanguage(topLevelItem.getField("language"))) {
      return false;
    }
    // 使用全局设置作为默认值
    currentStatus = bionicTemporaryData[itemID] || false;
  }
  return currentStatus;
}

function isDisabledLanguage(lang: string): boolean {
  const disabledLanguages = (
    (getPref("disableForLanguages") as string) || ""
  ).toLocaleLowerCase();
  if (!disabledLanguages) {
    return false;
  }
  const langSplitter = lang.includes("-") ? "-" : "_";
  const langPart = lang.split(langSplitter)[0].toLocaleLowerCase();
  if (!langPart) {
    return false;
  }
  return disabledLanguages.includes(langPart);
}

function toggleCurrentItemStatus(itemID: number): void {
  // 如果是无效的itemID，不执行任何操作
  if (itemID === -1) {
    return;
  }
  
  const bionicTemporaryData = getPrefJSON("bionicTemporaryData") || {};
  let currentStatus = bionicTemporaryData[itemID];
  if (currentStatus === undefined) {
    currentStatus = false;
  }
  bionicTemporaryData[itemID] = !currentStatus;
  setPref("bionicTemporaryData", JSON.stringify(bionicTemporaryData));

  // 只刷新与当前itemID相关的阅读器
  const readersToRefresh = Zotero.Reader._readers.filter((reader) => reader.itemID === itemID);
  // 调用刷新函数，不传递参数，让它刷新所有阅读器
  addon.hooks.onRefreshReaders();
}

/**
 * 获取当前文章的词性标注状态
 */
function getHighlightStatus(itemID: number, type: 'verbs' | 'nouns' | 'conjunctions'): boolean {
  // 如果是无效的itemID，返回false
  if (itemID === -1) {
    return false;
  }

  const highlightData = getPrefJSON("highlightData") || {};
  if (!highlightData[itemID]) {
    highlightData[itemID] = {
      verbs: false,
      nouns: false,
      conjunctions: false
    };
  }
  return highlightData[itemID][type];
}

/**
 * 设置当前文章的词性标注状态
 */
function setHighlightStatus(itemID: number, type: 'verbs' | 'nouns' | 'conjunctions', status: boolean): void {
  // 如果是无效的itemID，不执行任何操作
  if (itemID === -1) {
    return;
  }

  const highlightData = getPrefJSON("highlightData") || {};
  if (!highlightData[itemID]) {
    highlightData[itemID] = {
      verbs: false,
      nouns: false,
      conjunctions: false
    };
  }
  highlightData[itemID][type] = status;
  setPref("highlightData", JSON.stringify(highlightData));
}
