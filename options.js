(() => {
  const MAX_IMAGES = 5;
  const STORAGE_KEY = "cad_settings_v1";

  const elGlobalName = document.getElementById("globalName");
  const elGlobalMode = document.getElementById("globalMode");
  const elGlobalImages = document.getElementById("globalImages");
  const elSaveGlobal = document.getElementById("saveGlobal");
  const elGlobalSentimentHint = document.getElementById("globalSentimentHint");

  const elProjectId = document.getElementById("projectId");
  const elProjectName = document.getElementById("projectName");
  const elProjectMode = document.getElementById("projectMode");
  const elProjectImages = document.getElementById("projectImages");
  const elSaveProject = document.getElementById("saveProject");
  const elClearProject = document.getElementById("clearProject");
  const elProjectList = document.getElementById("projectList");
  const elProjectSentimentHint = document.getElementById("projectSentimentHint");
  const elExportSettings = document.getElementById("exportSettings");
  const elImportSettings = document.getElementById("importSettings");
  const elToast = document.getElementById("toast");

  let settingsCache = null;
  let globalImages = Array(MAX_IMAGES).fill("");
  let projectImages = Array(MAX_IMAGES).fill("");

  function buildImageSlots(container, images, onChange) {
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
        const dataUrl = await readAsDataUrl(file);
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
        images: Array(MAX_IMAGES).fill("")
      },
      projects: {}
    };
  }

  function mergeSettings(settings) {
    return {
      global: {
        name: settings?.global?.name || "",
        mode: settings?.global?.mode || "random",
        images: Array(MAX_IMAGES)
          .fill("")
          .map((_, i) => settings?.global?.images?.[i] || "")
      },
      projects: settings?.projects || {}
    };
  }

  function loadSettings() {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const merged = mergeSettings(res[STORAGE_KEY] || defaultSettings());
      settingsCache = merged;

      elGlobalName.value = merged.global.name || "";
      elGlobalMode.value = merged.global.mode || "random";
      syncSentimentHint(elGlobalMode.value, elGlobalSentimentHint);
      globalImages = [...merged.global.images];
      buildImageSlots(elGlobalImages, globalImages);

      renderProjectList();
    });
  }

  function saveSettings() {
    chrome.storage.local.set({ [STORAGE_KEY]: settingsCache });
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
      saveSettings();
      elGlobalName.value = settingsCache.global.name || "";
      elGlobalMode.value = settingsCache.global.mode || "random";
      syncSentimentHint(elGlobalMode.value, elGlobalSentimentHint);
      globalImages = [...settingsCache.global.images];
      buildImageSlots(elGlobalImages, globalImages);
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

  function saveGlobal() {
    settingsCache.global.name = elGlobalName.value.trim();
    settingsCache.global.mode = elGlobalMode.value;
    settingsCache.global.images = [...globalImages];
    saveSettings();
    showToast("全体設定を保存しました");
  }

  function saveProject() {
    const projectId = elProjectId.value.trim();
    if (!projectId) {
      showToast("projectId を入力してください");
      return;
    }
    settingsCache.projects[projectId] = {
      name: elProjectName.value.trim(),
      mode: elProjectMode.value,
      images: [...projectImages]
    };
    saveSettings();
    renderProjectList();
    showToast("プロジェクト設定を保存しました");
  }

  function clearProjectForm() {
    elProjectId.value = "";
    elProjectName.value = "";
    elProjectMode.value = "random";
    syncSentimentHint(elProjectMode.value, elProjectSentimentHint);
    projectImages = Array(MAX_IMAGES).fill("");
    buildImageSlots(elProjectImages, projectImages);
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
        syncSentimentHint(elProjectMode.value, elProjectSentimentHint);
        projectImages = Array(MAX_IMAGES)
          .fill("")
          .map((_, i) => profile.images?.[i] || "");
        buildImageSlots(elProjectImages, projectImages);
      });

      const remove = document.createElement("button");
      remove.textContent = "削除";
      remove.addEventListener("click", () => {
        delete settingsCache.projects[projectId];
        saveSettings();
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
  elProjectMode.addEventListener("change", () => {
    syncSentimentHint(elProjectMode.value, elProjectSentimentHint);
  });
  elExportSettings.addEventListener("click", exportSettings);
  elImportSettings.addEventListener("change", () => {
    const file = elImportSettings.files?.[0];
    importSettings(file);
    elImportSettings.value = "";
  });

  buildImageSlots(elProjectImages, projectImages);
  syncSentimentHint(elProjectMode.value, elProjectSentimentHint);
  loadSettings();

  function syncSentimentHint(mode, elHint) {
    if (!elHint) return;
    elHint.style.display = mode === "sentiment" ? "block" : "none";
  }
})();
