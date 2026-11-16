import { config } from "../../package.json";
import { getString, initLocale } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";

const rowID = `${config.addonRef}-language-row`;
const documents = new Map<Document, () => void>();
const managerObserver = {
  observe(subject: any) {
    const doc = subject?.document as Document | undefined;
    if (!doc || documents.has(doc)) return;
    const render = () => renderLanguageMenu(doc);
    documents.set(doc, render);
    doc.addEventListener("view-loaded", render);
    doc.defaultView?.addEventListener("unload", () => documents.delete(doc), { once: true });
    render();
  },
};

export function initLanguageMenu() {
  Services.obs.addObserver(managerObserver, "EM-loaded");
  Services.obs.addObserver(managerObserver, "EM-pong");
  // Discover an already-open plugin manager as well as future windows.
  Services.obs.notifyObservers(null!, "EM-ping");
}

export function unInitLanguageMenu() {
  Services.obs.removeObserver(managerObserver, "EM-loaded");
  Services.obs.removeObserver(managerObserver, "EM-pong");
  for (const [doc, render] of documents) {
    doc.removeEventListener("view-loaded", render);
    doc.getElementById(rowID)?.remove();
  }
  documents.clear();
}

function renderLanguageMenu(doc: Document) {
  const details = doc.querySelector(
    `addon-card[addon-id="${config.addonID}"][expanded] section[name="details"]`,
  );
  if (!details || doc.getElementById(rowID)) return;
  const row = doc.createElement("div");
  row.id = rowID;
  row.className = "addon-detail-row";
  const label = doc.createElement("label");
  label.htmlFor = `${rowID}-select`;
  label.textContent = "菜单语言 / Menu language";
  const select = doc.createElement("select");
  select.id = label.htmlFor;
  for (const [value, text] of [
    ["auto", "自动 / Auto"],
    ["zh-CN", "简体中文"],
    ["en-US", "English"],
  ]) {
    const option = doc.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  }
  const saved = getPref("menuLanguage");
  select.value = saved === "zh-CN" || saved === "en-US" ? saved : "auto";
  select.addEventListener("change", () => {
    setPref("menuLanguage", select.value);
    initLocale();
    // Update existing View menu entries without registering duplicate listeners.
    for (const win of Zotero.getMainWindows()) {
      for (const [id, key] of [
        ["enable-bionic", "menu-enableBionic"],
        ["enable-bionic-current-item", "menu-enableBionicForCurrentItem"],
        ["refresh-readers", "menu-refreshReaders"],
      ]) {
        const item = win.document.getElementById(`${config.addonRef}-menu-view-${id}`);
        if (item) (item as unknown as XUL.MenuItem).label = getString(key);
      }
    }
    // The next BIO popup is built using the selected language.
    for (const reader of Zotero.Reader._readers) {
      reader._iframeWindow?.document.querySelector(`.${config.addonRef}-bio-menu`)?.remove();
    }
  });
  row.append(label, select);
  details.appendChild(row);
}
