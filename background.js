(() => {
  const LEGACY_STORAGE_KEY = "cad_settings_v1";
  const DB_NAME = "cad_settings_db";
  const DB_VERSION = 1;
  const STORE_NAME = "settings_store";
  const RECORD_ID = "cad_settings";

  let dbPromise = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "cad:get-settings") {
      getStoredSettings()
        .then((settings) => sendResponse({ ok: true, settings }))
        .catch((err) => sendResponse({ ok: false, error: err?.message || "load failed" }));
      return true;
    }
    return false;
  });

  async function getStoredSettings() {
    const fromDb = await idbGetSettings();
    if (fromDb) return fromDb;
    const legacy = await getLegacySettings();
    if (legacy) {
      await setStoredSettings(legacy);
      return legacy;
    }
    return {};
  }

  async function idbGetSettings() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      tx.onabort = () => reject(tx.error || new Error("IndexedDB read aborted"));
      tx.onerror = () => reject(tx.error || new Error("IndexedDB read failed"));
      const req = tx.objectStore(STORE_NAME).get(RECORD_ID);
      req.onsuccess = () => resolve(req.result?.value || null);
      req.onerror = () => reject(req.error || new Error("IndexedDB get failed"));
    });
  }

  async function setStoredSettings(settings) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error("IndexedDB write aborted"));
      tx.onerror = () => reject(tx.error || new Error("IndexedDB write failed"));
      tx.objectStore(STORE_NAME).put({ id: RECORD_ID, value: settings });
    });
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    });
    return dbPromise;
  }

  function getLegacySettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([LEGACY_STORAGE_KEY], (res) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          resolve(null);
          return;
        }
        resolve(res?.[LEGACY_STORAGE_KEY] || null);
      });
    });
  }
})();
