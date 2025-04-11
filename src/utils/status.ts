import { getPrefJSON, getPref, setPref } from "./prefs";

export { getCurrentItemStatus, toggleCurrentItemStatus, getHighlightStatus, setHighlightStatus, getItemColorSetting, setItemColorSetting };

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
function getHighlightStatus(itemID: number, type: 'verbs' | 'nouns' | 'conjunctions' | 'punctuation' | 'punctuationBold'): boolean {
  // 如果是无效的itemID，返回false
  if (itemID === -1) {
    return false;
  }

  const highlightData = getPrefJSON("highlightData") || {};
  if (!highlightData[itemID]) {
    highlightData[itemID] = {
      verbs: false,
      nouns: false,
      conjunctions: false,
      punctuation: false,
      punctuationBold: false
    };
  }
  
  // 如果是旧数据没有punctuationBold字段，则初始化为false
  if (highlightData[itemID][type] === undefined) {
    highlightData[itemID][type] = false;
    setPref("highlightData", JSON.stringify(highlightData));
  }
  
  return highlightData[itemID][type];
}

/**
 * 设置当前文章的词性标注状态
 */
function setHighlightStatus(itemID: number, type: 'verbs' | 'nouns' | 'conjunctions' | 'punctuation' | 'punctuationBold', status: boolean): void {
  // 如果是无效的itemID，不执行任何操作
  if (itemID === -1) {
    return;
  }

  const highlightData = getPrefJSON("highlightData") || {};
  if (!highlightData[itemID]) {
    highlightData[itemID] = {
      verbs: false,
      nouns: false,
      conjunctions: false,
      punctuation: false,
      punctuationBold: false
    };
  }
  highlightData[itemID][type] = status;
  setPref("highlightData", JSON.stringify(highlightData));
}

/**
 * 获取当前文章的词性颜色设置
 */
function getItemColorSetting(itemID: number, type: 'verb' | 'noun' | 'conjunction' | 'punctuation'): string {
  // 如果是无效的itemID，返回默认颜色
  if (itemID === -1) {
    return getDefaultColor(type);
  }

  const colorData = getPrefJSON("colorData") || {};
  if (!colorData[itemID]) {
    colorData[itemID] = {
      verb: getDefaultColor('verb'),
      noun: getDefaultColor('noun'),
      conjunction: getDefaultColor('conjunction'),
      punctuation: getDefaultColor('punctuation')
    };
  }
  
  // 如果是旧数据没有特定颜色字段，则初始化为默认值
  if (colorData[itemID][type] === undefined) {
    colorData[itemID][type] = getDefaultColor(type);
    setPref("colorData", JSON.stringify(colorData));
  }
  
  return colorData[itemID][type];
}

/**
 * 设置当前文章的词性颜色设置
 */
function setItemColorSetting(itemID: number, type: 'verb' | 'noun' | 'conjunction' | 'punctuation', color: string): void {
  // 如果是无效的itemID，不执行任何操作
  if (itemID === -1) {
    return;
  }

  const colorData = getPrefJSON("colorData") || {};
  if (!colorData[itemID]) {
    colorData[itemID] = {
      verb: getDefaultColor('verb'),
      noun: getDefaultColor('noun'),
      conjunction: getDefaultColor('conjunction'),
      punctuation: getDefaultColor('punctuation')
    };
  }
  colorData[itemID][type] = color;
  setPref("colorData", JSON.stringify(colorData));
}

/**
 * 获取默认颜色设置
 */
function getDefaultColor(type: 'verb' | 'noun' | 'conjunction' | 'punctuation'): string {
  switch (type) {
    case 'verb':
      return String(getPref("verbHighlightColor") || "#FF5252");
    case 'noun':
      return String(getPref("nounHighlightColor") || "#5252FF");
    case 'conjunction':
      return String(getPref("conjunctionHighlightColor") || "#FFA500");
    case 'punctuation':
      return String(getPref("punctuationHighlightColor") || "#FF00FF");
    default:
      return "#000000";
  }
}
