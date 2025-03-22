export { initSettings, unInitSettings };

let prefsObservers: symbol[] = [];

const PREFS_TO_OBSERVE = [
  "enableBionicReader",
  "parsingOffset",
  "opacityContrast",
  "weightContrast",
  "weightOffset",
  "enableReaderToolbarButton",
  "highlightVerbs",
  "highlightNouns",
];

function initSettings() {
  ztoolkit.log("初始化设置监听器...");

  prefsObservers = PREFS_TO_OBSERVE.map((pref) => {
    ztoolkit.log(`注册首选项观察器: ${pref}`);
    return Zotero.Prefs.registerObserver(
      `${addon.data.config.prefsPrefix}.${pref}`,
      () => {
        ztoolkit.log(`首选项变更: ${pref}`);
        addon.hooks.onRefreshReaders();
      },
      true,
    );
  });
}

function unInitSettings() {
  prefsObservers.forEach((observer) => {
    Zotero.Prefs.unregisterObserver(observer);
  });
}
