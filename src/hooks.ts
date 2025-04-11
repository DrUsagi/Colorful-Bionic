import { config } from "../package.json";
import { initMenus } from "./modules/menu";
import { initPreferencePane } from "./modules/preferences";
import { initSettings, unInitSettings } from "./modules/settings";
import { initReader, refreshReaders, unInitReader } from "./modules/reader";
import { initLocale } from "./utils/locale";
import { showRestartDialog } from "./utils/window";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  ztoolkit.log("插件启动...");

  initLocale();

  initPreferencePane();

  initReader();

  initSettings();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  ztoolkit.log("插件初始化完成");
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // @ts-ignore This is a moz feature
  win.MozXULElement.insertFTLIfNeeded(`${config.addonRef}-mainWindow.ftl`);

  initMenus(win);
}

async function onMainWindowUnload(
  win: _ZoteroTypes.MainWindow,
): Promise<void> { }

function onShutdown(): void {
  unInitSettings();

  unInitReader();

  ztoolkit.unregisterAll();
  // Remove addon object
  addon.data.alive = false;
  delete Zotero[config.addonInstance];
}

const onRefreshReaders = async () => {
  ztoolkit.log("触发刷新阅读器...");
  await refreshReaders();

  // 重新初始化阅读器，确保事件监听器正确应用
  ztoolkit.log("重新初始化阅读器...");
  initReader();
};

const onShowRestartDialog = showRestartDialog;

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onRefreshReaders,
  onShowRestartDialog,
};
