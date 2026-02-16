(() => {
  const LEGACY_STORAGE_KEY = "cad_settings_v1";
  const UPDATE_STATE_KEY = "cad_update_state_v1";
  const DB_NAME = "cad_settings_db";
  const DB_VERSION = 1;
  const STORE_NAME = "settings_store";
  const RECORD_ID = "cad_settings";
  const UPDATE_CHECK_ALARM = "cad:update-check";
  const UPDATE_CHECK_PERIOD_MINUTES = 360;
  const UPDATE_NOTIFICATION_ID = "cad-update-available";
  const UPDATE_MANIFEST_URL =
    "https://raw.githubusercontent.com/fclef819/ChatGPT-Avatar-Decorator/main/manifest.json";
  const UPDATE_PAGE_URL = "https://github.com/fclef819/ChatGPT-Avatar-Decorator";

  let dbPromise = null;

  chrome.runtime.onInstalled.addListener(() => {
    ensureUpdateAlarm();
    void checkForUpdates({ forceNotify: false });
  });

  chrome.runtime.onStartup.addListener(() => {
    ensureUpdateAlarm();
    void checkForUpdates({ forceNotify: false });
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm?.name === UPDATE_CHECK_ALARM) {
      void checkForUpdates({ forceNotify: false });
    }
  });

  chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId !== UPDATE_NOTIFICATION_ID) return;
    void chrome.tabs.create({ url: UPDATE_PAGE_URL });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "cad:get-settings") {
      getStoredSettings()
        .then((settings) => sendResponse({ ok: true, settings }))
        .catch((err) => sendResponse({ ok: false, error: err?.message || "load failed" }));
      return true;
    }
    if (message?.type === "cad:check-update") {
      checkForUpdates({ forceNotify: true })
        .then((status) => sendResponse({ ok: true, status }))
        .catch((err) => sendResponse({ ok: false, error: err?.message || "update check failed" }));
      return true;
    }
    if (message?.type === "cad:get-update-status") {
      getUpdateState()
        .then((status) => sendResponse({ ok: true, status }))
        .catch((err) => sendResponse({ ok: false, error: err?.message || "status load failed" }));
      return true;
    }
    if (message?.type === "cad:set-global-flags") {
      setGlobalFlags(message?.flags || {})
        .then((settings) => sendResponse({ ok: true, settings }))
        .catch((err) => sendResponse({ ok: false, error: err?.message || "update flags failed" }));
      return true;
    }
    return false;
  });

  function ensureUpdateAlarm() {
    chrome.alarms.create(UPDATE_CHECK_ALARM, {
      periodInMinutes: UPDATE_CHECK_PERIOD_MINUTES
    });
  }

  async function checkForUpdates({ forceNotify }) {
    const currentVersion = chrome.runtime.getManifest().version;
    const now = Date.now();
    const prevState = await getUpdateState();
    let updateAvailable = false;
    let latestVersion = "";
    let error = "";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(UPDATE_MANIFEST_URL, {
        cache: "no-store",
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const manifest = await res.json();
      latestVersion = String(manifest?.version || "").trim();
      if (!latestVersion) throw new Error("latest version missing");
      updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
    } catch (err) {
      error = err?.message || "fetch failed";
    }

    const state = {
      currentVersion,
      latestVersion: latestVersion || currentVersion,
      updateAvailable,
      checkedAt: now,
      error
    };
    await setUpdateState(state);
    await applyUpdateBadge(state);
    const shouldNotifyUpdate =
      updateAvailable &&
      (forceNotify ||
        !prevState?.updateAvailable ||
        String(prevState?.latestVersion || "") !== String(state.latestVersion || ""));
    if (shouldNotifyUpdate) {
      await showUpdateNotification(state.latestVersion);
    }
    if (!updateAvailable && forceNotify) {
      await showInfoNotification("最新版です", `現在のバージョン ${currentVersion} を利用中です。`);
    }
    if (error && forceNotify) {
      await showInfoNotification("更新確認に失敗しました", error);
    }
    return state;
  }

  async function applyUpdateBadge(state) {
    const actionApi = chrome.action;
    if (!actionApi?.setBadgeText || !actionApi?.setTitle) return;
    if (state.updateAvailable) {
      await actionApi.setBadgeText({ text: "NEW" });
      if (actionApi?.setBadgeBackgroundColor) {
        await actionApi.setBadgeBackgroundColor({ color: "#d13b2e" });
      }
      await actionApi.setTitle({
        title: `新しいバージョン ${state.latestVersion} があります（現在 ${state.currentVersion}）`
      });
      return;
    }
    await actionApi.setBadgeText({ text: "" });
    await actionApi.setTitle({ title: "ChatGPT Avatar Decorator" });
  }

  async function showUpdateNotification(latestVersion) {
    try {
      await chrome.notifications.create(UPDATE_NOTIFICATION_ID, {
        type: "basic",
        iconUrl: "icon128.png",
        title: "拡張機能の更新があります",
        message: `最新: ${latestVersion}\nGitHubから pull して拡張を再読み込みしてください。`
      });
    } catch {
      // ignore
    }
  }

  async function showInfoNotification(title, message) {
    try {
      await chrome.notifications.create({
        type: "basic",
        iconUrl: "icon128.png",
        title,
        message
      });
    } catch {
      // ignore
    }
  }

  async function getUpdateState() {
    const state = await chrome.storage.local.get([UPDATE_STATE_KEY]);
    return state?.[UPDATE_STATE_KEY] || null;
  }

  async function setUpdateState(state) {
    await chrome.storage.local.set({ [UPDATE_STATE_KEY]: state });
  }

  function compareVersions(a, b) {
    const pa = String(a)
      .split(".")
      .map((v) => Number(v));
    const pb = String(b)
      .split(".")
      .map((v) => Number(v));
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
      const va = Number.isFinite(pa[i]) ? pa[i] : 0;
      const vb = Number.isFinite(pb[i]) ? pb[i] : 0;
      if (va > vb) return 1;
      if (va < vb) return -1;
    }
    return 0;
  }

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

  async function setGlobalFlags(flags) {
    const settings = normalizeSettings(await getStoredSettings());
    if ("enabled" in flags) settings.global.enabled = !!flags.enabled;
    if ("showToggleButton" in flags) settings.global.showToggleButton = !!flags.showToggleButton;
    if ("shortcutEnabled" in flags) settings.global.shortcutEnabled = !!flags.shortcutEnabled;
    await setStoredSettings(settings);
    await broadcastSettingsUpdated();
    return settings;
  }

  async function broadcastSettingsUpdated() {
    try {
      const tabs = await chrome.tabs.query({
        url: ["https://chatgpt.com/*", "https://chat.openai.com/*"]
      });
      await Promise.all(
        tabs.map(async (tab) => {
          if (!tab.id) return;
          try {
            await chrome.tabs.sendMessage(tab.id, { type: "cad:settings-updated" });
          } catch {
            // ignore tabs without content script context
          }
        })
      );
    } catch {
      // ignore
    }
  }

  function normalizeSettings(settings) {
    const normalized = settings && typeof settings === "object" ? settings : {};
    if (!normalized.global || typeof normalized.global !== "object") {
      normalized.global = {};
    }
    if (normalized.global.enabled === undefined) normalized.global.enabled = true;
    if (normalized.global.showToggleButton === undefined) normalized.global.showToggleButton = true;
    if (normalized.global.shortcutEnabled === undefined) normalized.global.shortcutEnabled = true;
    if (!normalized.projects || typeof normalized.projects !== "object") {
      normalized.projects = {};
    }
    return normalized;
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
