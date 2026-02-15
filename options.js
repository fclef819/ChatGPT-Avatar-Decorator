(() => {
  const MAX_IMAGES = 5;
  const LEGACY_STORAGE_KEY = "cad_settings_v1";
  const DB_NAME = "cad_settings_db";
  const DB_VERSION = 1;
  const STORE_NAME = "settings_store";
  const RECORD_ID = "cad_settings";
  const MAX_AVATAR_LONG_EDGE = 1024;
  const MAX_BG_LONG_EDGE = 2048;
  const AVATAR_WEBP_QUALITY = 0.9;
  const BG_WEBP_QUALITY = 0.82;

  const elGlobalName = document.getElementById("globalName");
  const elGlobalMode = document.getElementById("globalMode");
  const elGlobalImages = document.getElementById("globalImages");
  const elGlobalAvatarCrop = document.getElementById("globalAvatarCrop");
  const elSaveGlobal = document.getElementById("saveGlobal");
  const elGlobalSentimentHint = document.getElementById("globalSentimentHint");
  const elGlobalAvatarSize = document.getElementById("globalAvatarSize");
  const elGlobalNameSize = document.getElementById("globalNameSize");
  const elGlobalPreview = document.getElementById("globalPreview");
  const elGlobalBgInput = document.getElementById("globalBgInput");
  const elGlobalBgClear = document.getElementById("globalBgClear");
  const elGlobalBgPreview = document.getElementById("globalBgPreview");
  const elGlobalBgOverlay = document.getElementById("globalBgOverlay");
  const elGlobalNameColor = document.getElementById("globalNameColor");
  const elGlobalNameColorPicker = document.getElementById("globalNameColorPicker");
  const elGlobalAssistantBg = document.getElementById("globalAssistantBg");
  const elGlobalAssistantBgPicker = document.getElementById("globalAssistantBgPicker");
  const elGlobalAssistantText = document.getElementById("globalAssistantText");
  const elGlobalAssistantTextPicker = document.getElementById("globalAssistantTextPicker");
  const elGlobalUserBg = document.getElementById("globalUserBg");
  const elGlobalUserBgPicker = document.getElementById("globalUserBgPicker");
  const elGlobalUserText = document.getElementById("globalUserText");
  const elGlobalUserTextPicker = document.getElementById("globalUserTextPicker");

  const elProjectId = document.getElementById("projectId");
  const elProjectUrl = document.getElementById("projectUrl");
  const elExtractProjectId = document.getElementById("extractProjectId");
  const elProjectName = document.getElementById("projectName");
  const elProjectMode = document.getElementById("projectMode");
  const elProjectImages = document.getElementById("projectImages");
  const elProjectAvatarCrop = document.getElementById("projectAvatarCrop");
  const elSaveProject = document.getElementById("saveProject");
  const elClearProject = document.getElementById("clearProject");
  const elProjectList = document.getElementById("projectList");
  const elProjectSentimentHint = document.getElementById("projectSentimentHint");
  const elProjectAvatarSize = document.getElementById("projectAvatarSize");
  const elProjectNameSize = document.getElementById("projectNameSize");
  const elProjectPreview = document.getElementById("projectPreview");
  const elProjectBgInput = document.getElementById("projectBgInput");
  const elProjectBgClear = document.getElementById("projectBgClear");
  const elProjectBgPreview = document.getElementById("projectBgPreview");
  const elProjectBgOverlay = document.getElementById("projectBgOverlay");
  const elProjectNameColor = document.getElementById("projectNameColor");
  const elProjectNameColorPicker = document.getElementById("projectNameColorPicker");
  const elProjectAssistantBg = document.getElementById("projectAssistantBg");
  const elProjectAssistantBgPicker = document.getElementById("projectAssistantBgPicker");
  const elProjectAssistantText = document.getElementById("projectAssistantText");
  const elProjectAssistantTextPicker = document.getElementById("projectAssistantTextPicker");
  const elProjectUserBg = document.getElementById("projectUserBg");
  const elProjectUserBgPicker = document.getElementById("projectUserBgPicker");
  const elProjectUserText = document.getElementById("projectUserText");
  const elProjectUserTextPicker = document.getElementById("projectUserTextPicker");
  const elExportSettings = document.getElementById("exportSettings");
  const elImportSettings = document.getElementById("importSettings");
  const elImportLabel = document.getElementById("importLabel");
  const elImportLabelText = document.getElementById("importLabelText");
  const elToast = document.getElementById("toast");

  let settingsCache = null;
  let globalImages = Array(MAX_IMAGES).fill("");
  let projectImages = Array(MAX_IMAGES).fill("");
  let globalBgImage = "";
  let projectBgImage = "";
  let isImporting = false;
  let dbPromise = null;

  function buildImageSlots(container, images, onChange, transform) {
    container.innerHTML = "";
    for (let i = 0; i < MAX_IMAGES; i += 1) {
      const slot = document.createElement("div");
      slot.className = "image-slot";

      const title = document.createElement("div");
      title.textContent = `スロット ${i + 1}`;
      title.style.fontSize = "12px";
      title.style.opacity = "0.8";

      let preview = images[i] ? createImagePreview(images[i]) : createPlaceholder();

      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.className = "file-input";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        const dataUrl = transform ? await transform(file, i) : await readAsDataUrl(file);
        images[i] = dataUrl;
        const img = createImagePreview(dataUrl);
        preview.replaceWith(img);
        preview = img;
        onChange?.();
      });

      const clear = document.createElement("button");
      clear.textContent = "クリア";
      clear.addEventListener("click", () => {
        images[i] = "";
        const placeholder = createPlaceholder();
        preview.replaceWith(placeholder);
        preview = placeholder;
        input.value = "";
        onChange?.();
      });

      slot.appendChild(title);
      slot.appendChild(preview);
      slot.appendChild(input);
      slot.appendChild(clear);
      container.appendChild(slot);
    }
  }

  function createImagePreview(src) {
    const img = document.createElement("img");
    img.src = src;
    return img;
  }

  function createPlaceholder() {
    const div = document.createElement("div");
    div.className = "image-placeholder";
    return div;
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function defaultSettings() {
    return {
      global: {
        name: "",
        mode: "random",
        images: Array(MAX_IMAGES).fill(""),
        avatarCrop: true,
        avatarSize: 35,
        nameSize: 13,
        nameColor: "",
        bgImage: "",
        bgOverlay: 0,
        assistantBg: "",
        assistantText: "",
        userBg: "",
        userText: ""
      },
      projects: {}
    };
  }

  function mergeSettings(settings) {
    const normalizedProjects = {};
    const inputProjects = settings?.projects || {};
    for (const [key, value] of Object.entries(inputProjects)) {
      const normalized = normalizeProjectId(key);
      if (!normalized) continue;
      normalizedProjects[normalized] = {
        name: value?.name || "",
          mode: value?.mode || "random",
          images: Array(MAX_IMAGES)
            .fill("")
            .map((_, i) => value?.images?.[i] || ""),
          avatarCrop: value?.avatarCrop ?? true,
          avatarSize: value?.avatarSize ?? 35,
        nameSize: value?.nameSize ?? 13,
        nameColor: value?.nameColor || "",
        bgImage: value?.bgImage || "",
        bgOverlay: clampBgOverlay(value?.bgOverlay),
        assistantBg: value?.assistantBg || "",
        assistantText: value?.assistantText || "",
        userBg: value?.userBg || "",
        userText: value?.userText || ""
      };
    }
    return {
      global: {
        name: settings?.global?.name || "",
        mode: settings?.global?.mode || "random",
        images: Array(MAX_IMAGES)
          .fill("")
          .map((_, i) => settings?.global?.images?.[i] || ""),
        avatarCrop: settings?.global?.avatarCrop ?? true,
        avatarSize: settings?.global?.avatarSize ?? 35,
        nameSize: settings?.global?.nameSize ?? 13,
        nameColor: settings?.global?.nameColor || "",
        bgImage: settings?.global?.bgImage || "",
        bgOverlay: clampBgOverlay(settings?.global?.bgOverlay),
        assistantBg: settings?.global?.assistantBg || "",
        assistantText: settings?.global?.assistantText || "",
        userBg: settings?.global?.userBg || "",
        userText: settings?.global?.userText || ""
      },
      projects: normalizedProjects
    };
  }

  async function loadSettings() {
    try {
      const stored = await getStoredSettings();
      const merged = mergeSettings(stored || defaultSettings());
      settingsCache = merged;

      elGlobalName.value = merged.global.name || "";
      elGlobalMode.value = merged.global.mode || "random";
      elGlobalAvatarSize.value = merged.global.avatarSize ?? 35;
      elGlobalNameSize.value = merged.global.nameSize ?? 13;
      elGlobalAvatarCrop.checked = merged.global.avatarCrop ?? true;
      elGlobalNameColor.value = merged.global.nameColor || "";
      elGlobalBgOverlay.value = clampBgOverlay(merged.global.bgOverlay);
      elGlobalAssistantBg.value = merged.global.assistantBg || "";
      elGlobalAssistantText.value = merged.global.assistantText || "";
      elGlobalUserBg.value = merged.global.userBg || "";
      elGlobalUserText.value = merged.global.userText || "";
      syncAllColorPickers();
      syncSentimentHint(elGlobalMode.value, elGlobalSentimentHint);
      globalImages = [...merged.global.images];
      globalBgImage = merged.global.bgImage || "";
      updateBgPreview(elGlobalBgPreview, globalBgImage);
      buildImageSlots(elGlobalImages, globalImages, updateGlobalPreview, (file) =>
        processAvatarUpload(file, elGlobalAvatarCrop.checked)
      );
      updateGlobalPreview();

      renderProjectList();
    } catch (err) {
      settingsCache = mergeSettings(defaultSettings());
      renderProjectList();
      showToast("設定の読み込みに失敗しました");
    }
  }

  async function saveSettings() {
    try {
      await setStoredSettings(settingsCache);
      notifySettingsUpdated();
      return true;
    } catch (err) {
      showToast(formatSaveError(err));
      return false;
    }
  }

  function formatSaveError(err) {
    const name = err?.name || "";
    const msg = err?.message || "";
    const bytes = estimateSettingsBytes(settingsCache);
    const kb = Math.ceil(bytes / 1024);
    const isQuota =
      name === "QuotaExceededError" ||
      msg.includes("QUOTA_BYTES") ||
      msg.includes("MAX_WRITE_OPERATIONS") ||
      msg.includes("MAX_WRITE_OPERATIONS_PER_HOUR") ||
      msg.includes("exceeded");
    if (isQuota) {
      return `保存に失敗しました: データ容量の上限を超えています（現在約${kb}KB）`;
    }
    return "保存に失敗しました。画像サイズを小さくして再試行してください。";
  }

  function estimateSettingsBytes(value) {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch {
      return 0;
    }
  }

  async function getStoredSettings() {
    const fromDb = await idbGetSettings();
    if (fromDb) return fromDb;
    const legacy = await getLegacySettings();
    if (legacy) {
      await setStoredSettings(legacy);
      return legacy;
    }
    return defaultSettings();
  }

  function notifySettingsUpdated() {
    try {
      chrome.runtime.sendMessage({ type: "cad:settings-updated" }, () => {
        void chrome.runtime?.lastError;
      });
    } catch {
      // Ignore when there are no listeners.
    }
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
      try {
        chrome.storage.local.get([LEGACY_STORAGE_KEY], (res) => {
          const err = chrome.runtime?.lastError;
          if (err) {
            resolve(null);
            return;
          }
          resolve(res?.[LEGACY_STORAGE_KEY] || null);
        });
      } catch {
        resolve(null);
      }
    });
  }

  function exportSettings() {
    const payload = JSON.stringify(settingsCache, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chatgpt-avatar-settings.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("設定をダウンロードしました");
  }

  async function importSettings(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      settingsCache = mergeSettings(parsed);
      const ok = await saveSettings();
      if (!ok) return;
      elGlobalName.value = settingsCache.global.name || "";
      elGlobalMode.value = settingsCache.global.mode || "random";
      elGlobalAvatarSize.value = settingsCache.global.avatarSize ?? 35;
      elGlobalNameSize.value = settingsCache.global.nameSize ?? 13;
      elGlobalAvatarCrop.checked = settingsCache.global.avatarCrop ?? true;
      elGlobalNameColor.value = settingsCache.global.nameColor || "";
      elGlobalBgOverlay.value = clampBgOverlay(settingsCache.global.bgOverlay);
      elGlobalAssistantBg.value = settingsCache.global.assistantBg || "";
      elGlobalAssistantText.value = settingsCache.global.assistantText || "";
      elGlobalUserBg.value = settingsCache.global.userBg || "";
      elGlobalUserText.value = settingsCache.global.userText || "";
      syncAllColorPickers();
      syncSentimentHint(elGlobalMode.value, elGlobalSentimentHint);
      globalImages = [...settingsCache.global.images];
      globalBgImage = settingsCache.global.bgImage || "";
      updateBgPreview(elGlobalBgPreview, globalBgImage);
      buildImageSlots(elGlobalImages, globalImages, updateGlobalPreview, (file) =>
        processAvatarUpload(file, elGlobalAvatarCrop.checked)
      );
      updateGlobalPreview();
      clearProjectForm();
      renderProjectList();
      showToast("設定を読み込みました");
    } catch (err) {
      showToast("設定の読み込みに失敗しました");
    }
  }

  let toastTimer = null;
  function showToast(message) {
    if (!elToast) return;
    elToast.textContent = message;
    elToast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elToast.classList.remove("show");
    }, 1600);
  }

  async function saveGlobal() {
    settingsCache.global.name = elGlobalName.value.trim();
    settingsCache.global.mode = elGlobalMode.value;
    settingsCache.global.images = [...globalImages];
    settingsCache.global.avatarCrop = elGlobalAvatarCrop.checked;
    settingsCache.global.avatarSize = clampNumber(elGlobalAvatarSize.value, 16, 96, 35);
    settingsCache.global.nameSize = clampNumber(elGlobalNameSize.value, 10, 32, 13);
    settingsCache.global.nameColor = elGlobalNameColor.value.trim();
    settingsCache.global.bgImage = globalBgImage || "";
    settingsCache.global.bgOverlay = clampBgOverlay(elGlobalBgOverlay.value);
    settingsCache.global.assistantBg = elGlobalAssistantBg.value.trim();
    settingsCache.global.assistantText = elGlobalAssistantText.value.trim();
    settingsCache.global.userBg = elGlobalUserBg.value.trim();
    settingsCache.global.userText = elGlobalUserText.value.trim();
    const ok = await saveSettings();
    if (ok) showToast("全体設定を保存しました");
  }

  async function saveProject() {
    const raw = elProjectId.value.trim();
    const projectId = normalizeProjectId(raw);
    if (!projectId) {
      showToast("projectId を入力してください");
      return;
    }
    settingsCache.projects[projectId] = {
      name: elProjectName.value.trim(),
      mode: elProjectMode.value,
      images: [...projectImages],
      avatarCrop: elProjectAvatarCrop.checked,
      avatarSize: clampNumber(elProjectAvatarSize.value, 16, 96, 35),
      nameSize: clampNumber(elProjectNameSize.value, 10, 32, 13),
      nameColor: elProjectNameColor.value.trim(),
      bgImage: projectBgImage || "",
      bgOverlay: clampBgOverlay(elProjectBgOverlay.value),
      assistantBg: elProjectAssistantBg.value.trim(),
      assistantText: elProjectAssistantText.value.trim(),
      userBg: elProjectUserBg.value.trim(),
      userText: elProjectUserText.value.trim()
    };
    const ok = await saveSettings();
    if (!ok) return;
    renderProjectList();
    showToast("プロジェクト設定を保存しました");
  }

  function clearProjectForm() {
    elProjectId.value = "";
    elProjectName.value = "";
    elProjectMode.value = "random";
    elProjectAvatarCrop.checked = true;
    elProjectAvatarSize.value = 35;
    elProjectNameSize.value = 13;
    elProjectNameColor.value = "";
    elProjectBgOverlay.value = 0;
    elProjectAssistantBg.value = "";
    elProjectAssistantText.value = "";
    elProjectUserBg.value = "";
    elProjectUserText.value = "";
    syncAllColorPickers();
    syncSentimentHint(elProjectMode.value, elProjectSentimentHint);
    projectImages = Array(MAX_IMAGES).fill("");
    projectBgImage = "";
    updateBgPreview(elProjectBgPreview, projectBgImage);
    buildImageSlots(elProjectImages, projectImages, updateProjectPreview, (file) =>
      processAvatarUpload(file, elProjectAvatarCrop.checked)
    );
    updateProjectPreview();
  }

  function renderProjectList() {
    elProjectList.innerHTML = "";
    const entries = Object.entries(settingsCache.projects || {});
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "プロジェクト設定はまだありません。";
      elProjectList.appendChild(empty);
      return;
    }
    for (const [projectId, profile] of entries) {
      const row = document.createElement("div");
      row.className = "project-row";

      const meta = document.createElement("div");
      meta.className = "project-meta";
      meta.innerHTML = `<div><strong>${projectId}</strong></div>
        <div>name: ${profile.name || "(未設定)"}</div>
        <div>mode: ${profile.mode || "random"}</div>
        <div>images: ${(profile.images || []).filter((v) => v).length}</div>`;

      const actions = document.createElement("div");

      const edit = document.createElement("button");
      edit.textContent = "編集";
      edit.addEventListener("click", () => {
        elProjectId.value = projectId;
        elProjectName.value = profile.name || "";
        elProjectMode.value = profile.mode || "random";
        elProjectAvatarCrop.checked = profile.avatarCrop ?? true;
        elProjectAvatarSize.value = profile.avatarSize ?? 35;
        elProjectNameSize.value = profile.nameSize ?? 13;
        elProjectNameColor.value = profile.nameColor || "";
        elProjectBgOverlay.value = clampBgOverlay(profile.bgOverlay);
        elProjectAssistantBg.value = profile.assistantBg || "";
        elProjectAssistantText.value = profile.assistantText || "";
        elProjectUserBg.value = profile.userBg || "";
        elProjectUserText.value = profile.userText || "";
        syncAllColorPickers();
        syncSentimentHint(elProjectMode.value, elProjectSentimentHint);
        projectImages = Array(MAX_IMAGES)
          .fill("")
          .map((_, i) => profile.images?.[i] || "");
        projectBgImage = profile.bgImage || "";
        updateBgPreview(elProjectBgPreview, projectBgImage);
        buildImageSlots(elProjectImages, projectImages, updateProjectPreview, (file) =>
          processAvatarUpload(file, elProjectAvatarCrop.checked)
        );
        updateProjectPreview();
      });

      const remove = document.createElement("button");
      remove.textContent = "削除";
      remove.addEventListener("click", async () => {
        const prev = settingsCache.projects[projectId];
        delete settingsCache.projects[projectId];
        const ok = await saveSettings();
        if (!ok) {
          settingsCache.projects[projectId] = prev;
          return;
        }
        renderProjectList();
      });

      actions.appendChild(edit);
      actions.appendChild(remove);
      row.appendChild(meta);
      row.appendChild(actions);
      elProjectList.appendChild(row);
    }
  }

  elSaveGlobal.addEventListener("click", saveGlobal);
  elSaveProject.addEventListener("click", saveProject);
  elClearProject.addEventListener("click", clearProjectForm);
  elGlobalMode.addEventListener("change", () => {
    syncSentimentHint(elGlobalMode.value, elGlobalSentimentHint);
  });
  elGlobalAvatarCrop.addEventListener("change", () => {
    settingsCache.global.avatarCrop = elGlobalAvatarCrop.checked;
  });
  elProjectMode.addEventListener("change", () => {
    syncSentimentHint(elProjectMode.value, elProjectSentimentHint);
  });
  elProjectAvatarCrop.addEventListener("change", () => {
    updateProjectPreview();
  });
  elExportSettings.addEventListener("click", exportSettings);
  elImportSettings.addEventListener("change", async () => {
    if (isImporting) return;
    const file = elImportSettings.files?.[0];
    if (!file) return;
    setImportLoading(true);
    try {
      await importSettings(file);
    } finally {
      elImportSettings.value = "";
      setImportLoading(false);
    }
  });
  elGlobalName.addEventListener("input", updateGlobalPreview);
  elGlobalAvatarSize.addEventListener("input", updateGlobalPreview);
  elGlobalNameSize.addEventListener("input", updateGlobalPreview);
  elGlobalBgOverlay.addEventListener("input", updateGlobalPreview);
  elProjectName.addEventListener("input", updateProjectPreview);
  elProjectAvatarSize.addEventListener("input", updateProjectPreview);
  elProjectNameSize.addEventListener("input", updateProjectPreview);
  elProjectBgOverlay.addEventListener("input", updateProjectPreview);
  elExtractProjectId.addEventListener("click", () => {
    const raw = elProjectUrl.value.trim();
    const id = normalizeProjectId(raw);
    if (!id) {
      showToast("projectId を抽出できませんでした");
      return;
    }
    elProjectId.value = id;
    showToast("projectId を抽出しました");
  });

  elGlobalBgInput.addEventListener("change", async () => {
    const file = elGlobalBgInput.files?.[0];
    if (!file) return;
    globalBgImage = await processBackgroundUpload(file);
    updateBgPreview(elGlobalBgPreview, globalBgImage);
    updateGlobalPreview();
  });

  elGlobalBgClear.addEventListener("click", () => {
    globalBgImage = "";
    elGlobalBgInput.value = "";
    updateBgPreview(elGlobalBgPreview, globalBgImage);
    updateGlobalPreview();
  });

  elProjectBgInput.addEventListener("change", async () => {
    const file = elProjectBgInput.files?.[0];
    if (!file) return;
    projectBgImage = await processBackgroundUpload(file);
    updateBgPreview(elProjectBgPreview, projectBgImage);
    updateProjectPreview();
  });

  elProjectBgClear.addEventListener("click", () => {
    projectBgImage = "";
    elProjectBgInput.value = "";
    updateBgPreview(elProjectBgPreview, projectBgImage);
    updateProjectPreview();
  });

  buildImageSlots(elProjectImages, projectImages, updateProjectPreview, (file) =>
    processAvatarUpload(file, elProjectAvatarCrop.checked)
  );
  syncSentimentHint(elProjectMode.value, elProjectSentimentHint);
  bindColorPair(elGlobalNameColor, elGlobalNameColorPicker, updateGlobalPreview, "#ffffff");
  bindColorPair(elGlobalAssistantBg, elGlobalAssistantBgPicker, updateGlobalPreview, "#ffffff");
  bindColorPair(elGlobalAssistantText, elGlobalAssistantTextPicker, updateGlobalPreview, "#111111");
  bindColorPair(elGlobalUserBg, elGlobalUserBgPicker, updateGlobalPreview, "#f5f5f5");
  bindColorPair(elGlobalUserText, elGlobalUserTextPicker, updateGlobalPreview, "#111111");
  bindColorPair(elProjectNameColor, elProjectNameColorPicker, updateProjectPreview, "#ffffff");
  bindColorPair(elProjectAssistantBg, elProjectAssistantBgPicker, updateProjectPreview, "#ffffff");
  bindColorPair(elProjectAssistantText, elProjectAssistantTextPicker, updateProjectPreview, "#111111");
  bindColorPair(elProjectUserBg, elProjectUserBgPicker, updateProjectPreview, "#f5f5f5");
  bindColorPair(elProjectUserText, elProjectUserTextPicker, updateProjectPreview, "#111111");
  updateProjectPreview();
  loadSettings();

  function normalizeProjectId(input) {
    if (!input) return "";
    // Accept raw id or full URL, but canonicalize to g-p-<32hex> when present.
    const match = input.match(/(g-p-[0-9a-f]{32})/i);
    if (match) return match[1].toLowerCase();
    return input;
  }

  function clampNumber(value, min, max, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  }

  function clampBgOverlay(value) {
    return clampNumber(value, 0, 100, 0);
  }

  async function processAvatarUpload(file, cropSquare) {
    try {
      return await convertFileToWebP(file, {
        maxLongEdge: MAX_AVATAR_LONG_EDGE,
        quality: AVATAR_WEBP_QUALITY,
        cropSquare
      });
    } catch {
      return readAsDataUrl(file);
    }
  }

  async function processBackgroundUpload(file) {
    try {
      return await convertFileToWebP(file, {
        maxLongEdge: MAX_BG_LONG_EDGE,
        quality: BG_WEBP_QUALITY,
        cropSquare: false
      });
    } catch {
      return readAsDataUrl(file);
    }
  }

  async function convertFileToWebP(file, opts) {
    const { maxLongEdge, quality, cropSquare } = opts;
    const bitmap = await createImageBitmap(file);
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    let sx = 0;
    let sy = 0;
    let sw = srcW;
    let sh = srcH;

    if (cropSquare) {
      const side = Math.min(srcW, srcH);
      sx = Math.floor((srcW - side) / 2);
      sy = Math.floor((srcH - side) / 2);
      sw = side;
      sh = side;
    }

    const scale = Math.min(1, maxLongEdge / Math.max(sw, sh));
    const outW = Math.max(1, Math.round(sw * scale));
    const outH = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas context unavailable");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);
    if (typeof bitmap.close === "function") bitmap.close();
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error("toBlob failed"));
      }, "image/webp", quality);
    });
    return await readAsDataUrl(blob);
  }

  function bindColorPair(textEl, pickerEl, onChange, fallbackHex) {
    if (!textEl || !pickerEl) return;
    const syncPickerFromText = () => {
      const hex = toHexColor(textEl.value);
      pickerEl.value = hex || fallbackHex;
    };
    textEl.addEventListener("input", () => {
      syncPickerFromText();
      onChange?.();
    });
    pickerEl.addEventListener("change", () => {
      textEl.value = pickerEl.value;
      onChange?.();
    });
    syncPickerFromText();
  }

  function syncAllColorPickers() {
    syncPickerFromText(elGlobalNameColor, elGlobalNameColorPicker, "#ffffff");
    syncPickerFromText(elGlobalAssistantBg, elGlobalAssistantBgPicker, "#ffffff");
    syncPickerFromText(elGlobalAssistantText, elGlobalAssistantTextPicker, "#111111");
    syncPickerFromText(elGlobalUserBg, elGlobalUserBgPicker, "#f5f5f5");
    syncPickerFromText(elGlobalUserText, elGlobalUserTextPicker, "#111111");
    syncPickerFromText(elProjectNameColor, elProjectNameColorPicker, "#ffffff");
    syncPickerFromText(elProjectAssistantBg, elProjectAssistantBgPicker, "#ffffff");
    syncPickerFromText(elProjectAssistantText, elProjectAssistantTextPicker, "#111111");
    syncPickerFromText(elProjectUserBg, elProjectUserBgPicker, "#f5f5f5");
    syncPickerFromText(elProjectUserText, elProjectUserTextPicker, "#111111");
  }

  function syncPickerFromText(textEl, pickerEl, fallbackHex) {
    if (!textEl || !pickerEl) return;
    const hex = toHexColor(textEl.value);
    pickerEl.value = hex || fallbackHex;
  }

  function toHexColor(value) {
    const v = (value || "").trim();
    if (!v) return "";
    const probe = document.createElement("span");
    probe.style.color = "";
    probe.style.color = v;
    if (!probe.style.color) return "";
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return "";
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const to2 = (n) => n.toString(16).padStart(2, "0");
    return `#${to2(r)}${to2(g)}${to2(b)}`;
  }

  function getFirstImage(images) {
    return (images || []).find((v) => v) || "";
  }

  function updateGlobalPreview() {
    updatePreview(elGlobalPreview, {
      name: elGlobalName.value.trim(),
      avatarSize: clampNumber(elGlobalAvatarSize.value, 16, 96, 35),
      nameSize: clampNumber(elGlobalNameSize.value, 10, 32, 13),
      nameColor: elGlobalNameColor.value.trim(),
      image: getFirstImage(globalImages),
      bgImage: globalBgImage,
      bgOverlay: clampBgOverlay(elGlobalBgOverlay.value),
      assistantBg: elGlobalAssistantBg.value.trim(),
      assistantText: elGlobalAssistantText.value.trim(),
      userBg: elGlobalUserBg.value.trim(),
      userText: elGlobalUserText.value.trim()
    });
  }

  function updateProjectPreview() {
    updatePreview(elProjectPreview, {
      name: elProjectName.value.trim(),
      avatarSize: clampNumber(elProjectAvatarSize.value, 16, 96, 35),
      nameSize: clampNumber(elProjectNameSize.value, 10, 32, 13),
      nameColor: elProjectNameColor.value.trim(),
      image: getFirstImage(projectImages),
      bgImage: projectBgImage,
      bgOverlay: clampBgOverlay(elProjectBgOverlay.value),
      assistantBg: elProjectAssistantBg.value.trim(),
      assistantText: elProjectAssistantText.value.trim(),
      userBg: elProjectUserBg.value.trim(),
      userText: elProjectUserText.value.trim()
    });
  }

  function updatePreview(container, profile) {
    if (!container) return;
    const avatar = container.querySelector(".preview-avatar");
    const name = container.querySelector(".preview-name");
    if (avatar) {
      avatar.style.width = `${profile.avatarSize}px`;
      avatar.style.height = `${profile.avatarSize}px`;
      if (profile.image) {
        avatar.style.backgroundImage = `url(${profile.image})`;
        avatar.classList.remove("is-empty");
      } else {
        avatar.style.backgroundImage = "";
        avatar.classList.add("is-empty");
      }
    }
    if (name) {
      name.textContent = profile.name || "プレビュー";
      name.style.fontSize = `${profile.nameSize}px`;
      name.style.color = profile.nameColor || "";
      name.style.opacity = profile.nameColor ? "1" : "";
    }
    if (profile.bgImage) {
      const a = clampBgOverlay(profile.bgOverlay) / 100;
      container.style.backgroundImage = `linear-gradient(rgba(0,0,0,${a}), rgba(0,0,0,${a})), url(${profile.bgImage})`;
    } else {
      container.style.backgroundImage = "";
    }
    const bubbles = container.querySelectorAll(".preview-bubble");
    const assistantBubble = container.querySelector(".preview-bubble.assistant");
    const userBubble = container.querySelector(".preview-bubble.user");
    bubbles.forEach((bubble) => {
      bubble.style.color = "";
      bubble.style.background = "";
    });
    if (assistantBubble) {
      if (profile.assistantBg) assistantBubble.style.background = profile.assistantBg;
      if (profile.assistantText) assistantBubble.style.color = profile.assistantText;
    }
    if (userBubble) {
      if (profile.userBg) userBubble.style.background = profile.userBg;
      if (profile.userText) userBubble.style.color = profile.userText;
    }
  }

  function syncSentimentHint(mode, elHint) {
    if (!elHint) return;
    elHint.style.display = mode === "sentiment" ? "block" : "none";
  }

  function updateBgPreview(previewEl, image) {
    if (!previewEl) return;
    if (image) {
      previewEl.style.backgroundImage = `url(${image})`;
      previewEl.classList.remove("is-empty");
    } else {
      previewEl.style.backgroundImage = "";
      previewEl.classList.add("is-empty");
    }
  }

  function setImportLoading(value) {
    isImporting = value;
    if (elImportLabel) {
      elImportLabel.classList.toggle("is-loading", value);
    }
    if (elImportLabelText) {
      elImportLabelText.textContent = value ? "読み込み中..." : "設定をアップロード";
    }
    if (elImportSettings) {
      elImportSettings.disabled = value;
    }
  }
})();
