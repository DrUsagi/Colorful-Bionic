import { getPrefJSON, getPref, setPref } from "./prefs";

export { getCurrentItemStatus, toggleCurrentItemStatus };

function getCurrentItemStatus(itemID: number): boolean {
  const bionicTemporaryData = getPrefJSON("bionicTemporaryData");
  let currentStatus = bionicTemporaryData[itemID];
  if (currentStatus === undefined) {
    const item = Zotero.Items.getTopLevel([Zotero.Items.get(itemID)])[0];
    if (isDisabledLanguage(item.getField("language"))) {
      return false;
    }
    currentStatus = !!getPref("enableBionicReader");
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
  const bionicTemporaryData = getPrefJSON("bionicTemporaryData");
  let currentStatus = bionicTemporaryData[itemID];
  if (currentStatus === undefined) {
    currentStatus = !!getPref("enableBionicReader");
  }
  bionicTemporaryData[itemID] = !currentStatus;
  setPref("bionicTemporaryData", JSON.stringify(bionicTemporaryData));

  // 只刷新与当前itemID相关的阅读器
  const readersToRefresh = Zotero.Reader._readers.filter((reader) => reader.itemID === itemID);
  // 调用刷新函数，不传递参数，让它刷新所有阅读器
  addon.hooks.onRefreshReaders();
}
