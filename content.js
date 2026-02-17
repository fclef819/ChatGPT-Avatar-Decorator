(() => {
  const MAX_IMAGES = 5;
  let messageImageCache = new WeakMap();
  let lastBackgroundTargets = [];
  let lastGlassTargets = [];
  let lastProjectHeaderTargets = [];
  let lastListDarkTargets = [];
  let lastThemeSignature = "";
  let scanScheduled = false;
  let themeDirty = true;
  let featureSettings = null;
  let cachedSettings = mergeSettings({});
  let settingsLoaded = false;
  let toggleButton = null;
  let toggleBtnScheduled = false;
  let fallbackObserverTimer = null;
  let fallbackObserverActive = false;
  let postNavTimers = [];
  const rgbaCache = new Map();
  const TOGGLE_SHORTCUT_KEY = "A";
  const FALLBACK_OBSERVER_WINDOW_MS = 3500;

  const defaultSettings = {
    global: {
      enabled: true,
      showToggleButton: true,
      shortcutEnabled: true,
      name: "",
      mode: "random",
      images: Array(MAX_IMAGES).fill(""),
      avatarSize: 35,
      nameSize: 13,
      nameColor: "",
      bgImage: "",
      bgOverlay: 0,
      assistantBg: "",
      assistantBgOpacity: 100,
      assistantText: "",
      userBg: "",
      userBgOpacity: 100,
      userText: ""
    },
    projects: {}
  };

  function getProjectIdFromUrl() {
    const path = window.location.pathname;
    let m = path.match(/\/projects\/([^/]+)/);
    if (m) return normalizeProjectId(m[1]);
    m = path.match(/\/g\/([^/]+)/);
    if (m) {
      const raw = m[1];
      const base = raw.match(/^(g-p-[0-9a-f]{32})/i);
      return normalizeProjectId(base ? base[1] : raw);
    }
    return "";
  }

  function normalizeProjectId(input) {
    if (!input) return "";
    const match = input.match(/(g-p-[0-9a-f]{32})/i);
    if (match) return match[1].toLowerCase();
    return input;
  }

  function refreshCachedSettings() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "cad:get-settings" }, (res) => {
          const err = chrome.runtime?.lastError;
          if (err || !res?.ok) {
            cachedSettings = mergeSettings({});
            featureSettings = cachedSettings;
            settingsLoaded = true;
            resolve(cachedSettings);
            return;
          }
          cachedSettings = mergeSettings(res.settings || {});
          featureSettings = cachedSettings;
          settingsLoaded = true;
          resolve(cachedSettings);
        });
      } catch {
        cachedSettings = mergeSettings({});
        featureSettings = cachedSettings;
        settingsLoaded = true;
        resolve(cachedSettings);
      }
    });
  }

  function mergeSettings(settings) {
    const normalizedProjects = {};
    const inputProjects = settings.projects || {};
    for (const [key, value] of Object.entries(inputProjects)) {
      const normalizedKey = normalizeProjectId(key);
      if (!normalizedKey) continue;
      normalizedProjects[normalizedKey] = {
        name: value?.name || "",
        mode: value?.mode || "random",
        images: Array(MAX_IMAGES).fill("").map((_, i) => value?.images?.[i] || ""),
        avatarSize: value?.avatarSize ?? 35,
        nameSize: value?.nameSize ?? 13,
        nameColor: value?.nameColor || "",
        bgImage: value?.bgImage || "",
        bgOverlay: clampBgOverlay(value?.bgOverlay),
        assistantBg: value?.assistantBg || "",
        assistantBgOpacity: clampOpacity(value?.assistantBgOpacity),
        assistantText: value?.assistantText || "",
        userBg: value?.userBg || "",
        userBgOpacity: clampOpacity(value?.userBgOpacity),
        userText: value?.userText || ""
      };
    }
    const merged = {
      global: {
        enabled: settings.global?.enabled ?? true,
        showToggleButton: settings.global?.showToggleButton ?? true,
        shortcutEnabled: settings.global?.shortcutEnabled ?? true,
        name: settings.global?.name || "",
        mode: settings.global?.mode || "random",
        images: Array(MAX_IMAGES).fill("").map((_, i) => settings.global?.images?.[i] || ""),
        avatarSize: settings.global?.avatarSize ?? 35,
        nameSize: settings.global?.nameSize ?? 13,
        nameColor: settings.global?.nameColor || "",
        bgImage: settings.global?.bgImage || "",
        bgOverlay: clampBgOverlay(settings.global?.bgOverlay),
        assistantBg: settings.global?.assistantBg || "",
        assistantBgOpacity: clampOpacity(settings.global?.assistantBgOpacity),
        assistantText: settings.global?.assistantText || "",
        userBg: settings.global?.userBg || "",
        userBgOpacity: clampOpacity(settings.global?.userBgOpacity),
        userText: settings.global?.userText || ""
      },
      projects: normalizedProjects
    };
    return merged;
  }

  function getActiveProfile(settings) {
    const projectId = getProjectIdFromUrl();
    if (!projectId) return settings.global;
    if (settings.projects?.[projectId]) return settings.projects[projectId];
    return settings.global;
  }

  function pickImageIndex(profile, messageEl, text) {
    const images = Array(MAX_IMAGES).fill("").map((_, i) => profile.images?.[i] || "");
    const available = images.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    if (!available.length) return -1;

    if (messageImageCache.has(messageEl)) {
      return messageImageCache.get(messageEl);
    }

    let idx = available[0];
    if (profile.mode === "random") {
      idx = available[Math.floor(Math.random() * available.length)];
    } else {
      const score = window.CadSentiment?.computeSentimentScore(text) ?? 0;
      let target = 2;
      if (score <= -0.6) target = 0;
      else if (score <= -0.2) target = 1;
      else if (score <= 0.2) target = 2;
      else if (score <= 0.6) target = 3;
      else target = 4;

      if (images[target]) {
        idx = target;
      } else {
        let best = available[0];
        let bestDist = Infinity;
        for (const i of available) {
          const d = Math.abs(i - target);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        }
        idx = best;
      }
    }

    messageImageCache.set(messageEl, idx);
    return idx;
  }

  function decorateMessage(messageEl, profile) {
    if (!messageEl || messageEl.dataset.cadDecorated === "1") return;

    const name = (profile.name || "").trim();
    const text = messageEl.innerText || "";
    const imgIndex = pickImageIndex(profile, messageEl, text);
    const imgSrc = imgIndex >= 0 ? profile.images?.[imgIndex] : "";

    if (!name && !imgSrc) return;

    messageEl.classList.add("cad-message");
    if (profile.avatarSize) {
      messageEl.style.setProperty("--cad-avatar-size", `${profile.avatarSize}px`);
    }
    if (profile.nameSize) {
      messageEl.style.setProperty("--cad-name-size", `${profile.nameSize}px`);
    }

    const header = document.createElement("div");
    header.className = "cad-header";

    if (imgSrc) {
      const img = document.createElement("img");
      img.className = "cad-avatar";
      img.alt = "avatar";
      img.src = imgSrc;
      header.appendChild(img);
    }

    if (name) {
      const span = document.createElement("span");
      span.className = "cad-name";
      span.textContent = name;
      if (profile.nameColor) {
        span.style.color = profile.nameColor;
        span.style.opacity = "1";
      }
      header.appendChild(span);
    }

    messageEl.insertBefore(header, messageEl.firstChild);
    messageEl.dataset.cadDecorated = "1";
  }

  function applyTheme(profile) {
    const signature = getThemeSignature(profile);
    const bgTargets = getBackgroundTargets();
    const glassTargets = getGlassTargets();
    const projectHeaderTargets = getProjectHeaderTargets();
    const listDarkTargets = getListDarkTargets();
    const sameTheme = signature === lastThemeSignature;
    const sameTargets =
      sameNodeList(bgTargets, lastBackgroundTargets) &&
      sameNodeList(glassTargets, lastGlassTargets) &&
      sameNodeList(projectHeaderTargets, lastProjectHeaderTargets) &&
      sameNodeList(listDarkTargets, lastListDarkTargets);
    if (!themeDirty && sameTheme && sameTargets) return;

    const root = document.documentElement;
    root.classList.add("cad-root", "cad-theme-active");

    const body = document.body;
    clearBackgroundStyles(lastBackgroundTargets);
    clearGlassStyles(lastGlassTargets);
    clearProjectHeaderStyles(lastProjectHeaderTargets);
    clearListDarkStyles(lastListDarkTargets);
    lastBackgroundTargets = bgTargets;
    lastGlassTargets = glassTargets;
    lastProjectHeaderTargets = projectHeaderTargets;
    lastListDarkTargets = listDarkTargets;
    if (profile.bgImage) {
      root.style.setProperty("--cad-bg-image", `url("${profile.bgImage}")`);
      root.classList.add("cad-bg");
      body.classList.add("cad-bg");
      applyBackgroundStyles(bgTargets, profile.bgImage, clampBgOverlay(profile.bgOverlay));
      applyGlassStyles(glassTargets);
      applyProjectHeaderStyles(projectHeaderTargets);
      applyListDarkStyles(listDarkTargets);
    } else {
      root.style.setProperty("--cad-bg-image", "none");
      root.classList.remove("cad-bg");
      body.classList.remove("cad-bg");
    }
    root.style.setProperty("--cad-bg-overlay", String(clampBgOverlay(profile.bgOverlay) / 100));

    setCssVar(
      root,
      "--cad-assistant-bg",
      colorWithOpacity(profile.assistantBg, profile.assistantBgOpacity)
    );
    setCssVar(root, "--cad-assistant-text", profile.assistantText);
    setCssVar(root, "--cad-user-bg", colorWithOpacity(profile.userBg, profile.userBgOpacity));
    setCssVar(root, "--cad-user-text", profile.userText);
    lastThemeSignature = signature;
    themeDirty = false;
  }

  function clearTheme() {
    const root = document.documentElement;
    const body = document.body;
    clearBackgroundStyles(lastBackgroundTargets);
    clearGlassStyles(lastGlassTargets);
    clearProjectHeaderStyles(lastProjectHeaderTargets);
    clearListDarkStyles(lastListDarkTargets);
    lastBackgroundTargets = [];
    lastGlassTargets = [];
    lastProjectHeaderTargets = [];
    lastListDarkTargets = [];
    root.classList.remove("cad-root", "cad-bg", "cad-theme-active");
    body.classList.remove("cad-bg");
    root.style.removeProperty("--cad-bg-image");
    root.style.removeProperty("--cad-bg-overlay");
    root.style.removeProperty("--cad-assistant-bg");
    root.style.removeProperty("--cad-assistant-text");
    root.style.removeProperty("--cad-user-bg");
    root.style.removeProperty("--cad-user-text");
    lastThemeSignature = "";
    themeDirty = false;
  }

  function getBackgroundTargets() {
    const targets = [];
    const primary = document.querySelector("body > div:nth-of-type(2) > div:first-child > div > div:nth-child(2)");
    if (primary) targets.push(primary);
    return Array.from(new Set(targets));
  }

  function getGlassTargets() {
    const targets = [];
    const pageHeader = document.getElementById("page-header");
    if (pageHeader) targets.push(pageHeader);
    return Array.from(new Set(targets));
  }

  function getProjectHeaderTargets() {
    const targets = [];
    const listArea = document.querySelector(
      'div.flex.min-w-0.flex-col.gap-8.pb-6, div[class*="min-w-0"][class*="flex-col"][class*="gap-8"][class*="pb-6"]'
    );
    if (!listArea) return targets;
    const first = listArea.firstElementChild;
    if (first) targets.push(first);
    first
      ?.querySelectorAll(
        '[class*="bg-token-main-surface-primary"], [class*="bg-token-main-surface-secondary"], [class*="main-surface-primary"], [class*="main-surface-secondary"], [style*="main-surface-primary"], [style*="main-surface-secondary"]'
      )
      .forEach((el) => targets.push(el));
    return Array.from(new Set(targets));
  }

  function getListDarkTargets() {
    const targets = [];
    const listArea = document.querySelector(
      'div.flex.min-w-0.flex-col.gap-8.pb-6, div[class*="min-w-0"][class*="flex-col"][class*="gap-8"][class*="pb-6"]'
    );
    if (listArea) targets.push(listArea);
    return Array.from(new Set(targets));
  }

  function applyBackgroundStyles(targets, image, overlayPercent) {
    const alpha = Math.max(0, Math.min(100, overlayPercent)) / 100;
    const imageValue = `linear-gradient(rgba(0,0,0,${alpha}), rgba(0,0,0,${alpha})), url("${image}")`;
    const attachment = window.matchMedia("(max-width: 768px)").matches ? "scroll" : "fixed";
    targets.forEach((el) => {
      el.style.setProperty("background-color", "transparent", "important");
      el.style.setProperty("background-image", imageValue, "important");
      el.style.setProperty("background-size", "cover", "important");
      el.style.setProperty("background-position", "center", "important");
      el.style.setProperty("background-repeat", "no-repeat", "important");
      el.style.setProperty("background-attachment", attachment, "important");
    });
  }

  function clearBackgroundStyles(targets) {
    targets.forEach((el) => {
      el.style.removeProperty("background-color");
      el.style.removeProperty("background-image");
      el.style.removeProperty("background-size");
      el.style.removeProperty("background-position");
      el.style.removeProperty("background-repeat");
      el.style.removeProperty("background-attachment");
    });
  }

  function applyGlassStyles(targets) {
    targets.forEach((el) => {
      el.classList.add("cad-glass-panel");
    });
  }

  function clearGlassStyles(targets) {
    targets.forEach((el) => {
      el.classList.remove("cad-glass-panel");
    });
  }

  function applyProjectHeaderStyles(targets) {
    targets.forEach((el) => {
      el.classList.add("cad-project-header-clear");
      el.style.setProperty("background", "transparent", "important");
      el.style.setProperty("background-color", "transparent", "important");
      el.style.setProperty("box-shadow", "none", "important");
      el.style.setProperty("backdrop-filter", "none", "important");
      el.style.setProperty("-webkit-backdrop-filter", "none", "important");
    });
  }

  function clearProjectHeaderStyles(targets) {
    targets.forEach((el) => {
      el.classList.remove("cad-project-header-clear");
      el.style.removeProperty("background");
      el.style.removeProperty("background-color");
      el.style.removeProperty("box-shadow");
      el.style.removeProperty("backdrop-filter");
      el.style.removeProperty("-webkit-backdrop-filter");
    });
  }

  function applyListDarkStyles(targets) {
    targets.forEach((el) => {
      el.classList.add("cad-list-dark");
    });
  }

  function clearListDarkStyles(targets) {
    targets.forEach((el) => {
      el.classList.remove("cad-list-dark");
    });
  }

  function setCssVar(root, key, value) {
    if (!root) return;
    if (value) {
      root.style.setProperty(key, value);
    } else {
      root.style.removeProperty(key);
    }
  }

  function clampBgOverlay(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function clampOpacity(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 100;
    return Math.max(0, Math.min(100, n));
  }

  function colorWithOpacity(color, opacityPercent) {
    const v = (color || "").trim();
    if (!v) return "";
    const key = `${v}|${clampOpacity(opacityPercent)}`;
    if (rgbaCache.has(key)) return rgbaCache.get(key);
    const probe = document.createElement("span");
    probe.style.color = "";
    probe.style.color = v;
    if (!probe.style.color) return v;
    document.body.appendChild(probe);
    const rgba = getComputedStyle(probe).color;
    probe.remove();
    const m = rgba.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (!m) return v;
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    const baseA = m[4] !== undefined ? Number(m[4]) : 1;
    const a = Math.max(0, Math.min(1, baseA * (clampOpacity(opacityPercent) / 100)));
    const out = `rgba(${r}, ${g}, ${b}, ${a})`;
    rgbaCache.set(key, out);
    return out;
  }

  function getThemeSignature(profile) {
    return [
      profile.bgImage || "",
      clampBgOverlay(profile.bgOverlay),
      profile.assistantBg || "",
      clampOpacity(profile.assistantBgOpacity),
      profile.assistantText || "",
      profile.userBg || "",
      clampOpacity(profile.userBgOpacity),
      profile.userText || ""
    ].join("|");
  }

  function sameNodeList(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function isFeatureEnabled(settings) {
    return settings?.global?.enabled ?? true;
  }

  function getToggleLabel(enabled) {
    return enabled ? "CAD: ON" : "CAD: OFF";
  }

  function upsertToggleButton(settings) {
    const show = settings?.global?.showToggleButton ?? true;
    if (!show) {
      removeToggleButton();
      return;
    }
    if (!toggleButton) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cad-toggle-btn";
      btn.addEventListener("click", () => {
        const current = isFeatureEnabled(featureSettings || settings);
        void updateEnabledFlag(!current, true);
      });
      toggleButton = btn;
    }
    if (!toggleButton.isConnected) {
      document.body.appendChild(toggleButton);
    }
    const enabled = isFeatureEnabled(settings);
    toggleButton.textContent = getToggleLabel(enabled);
    toggleButton.classList.toggle("is-off", !enabled);
    toggleButton.title = `Avatar Decorator ${enabled ? "ON" : "OFF"}`;
  }

  function removeToggleButton() {
    if (toggleButton?.isConnected) toggleButton.remove();
  }

  function scheduleToggleButtonUpdate(settings) {
    if (toggleBtnScheduled) return;
    toggleBtnScheduled = true;
    requestAnimationFrame(() => {
      toggleBtnScheduled = false;
      upsertToggleButton(settings || featureSettings || mergeSettings({}));
    });
  }

  function updateEnabledFlag(nextEnabled, notify = false) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(
          {
            type: "cad:set-global-flags",
            flags: { enabled: !!nextEnabled }
          },
          (res) => {
            const ok = !chrome.runtime?.lastError && res?.ok;
            if (!ok) {
              resolve(false);
              return;
            }
            cachedSettings = mergeSettings(res.settings || {});
            settingsLoaded = true;
            featureSettings = cachedSettings;
            resetDecorations();
            if (!isFeatureEnabled(featureSettings)) {
              clearTheme();
            }
            scheduleToggleButtonUpdate(featureSettings);
            scheduleScan(true);
            if (notify) showToggleToast(isFeatureEnabled(featureSettings));
            resolve(true);
          }
        );
      } catch {
        resolve(false);
      }
    });
  }

  function showToggleToast(enabled) {
    const existing = document.querySelector(".cad-toggle-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "cad-toggle-toast";
    toast.textContent = `Avatar Decorator ${enabled ? "ON" : "OFF"}`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 180);
    }, 900);
  }

  function scanAndDecorate() {
    if (!settingsLoaded) return;
    const settings = cachedSettings;
    featureSettings = settings;
    scheduleToggleButtonUpdate(settings);
    if (!isFeatureEnabled(settings)) {
      resetDecorations();
      clearTheme();
      return;
    }
    const profile = getActiveProfile(settings);
    applyTheme(profile);
    applyAskTooltipLabel(profile);
    const nodes = document.querySelectorAll('div[data-message-author-role="assistant"]');
    nodes.forEach((el) => {
      decorateMessage(el, profile);
    });
  }

  function applyAskTooltipLabel(profile) {
    const name = (profile?.name || "").trim() || "ChatGPT";
    const askPattern = /ChatGPT[ \u00A0\u3000]*(?=に質問する)/g;
    const replaceAskLabel = (text) => {
      if (!text) return text;
      return text.replace(askPattern, name);
    };

    const attrTargets = document.querySelectorAll('[aria-label*="に質問する"], [title*="に質問する"]');
    attrTargets.forEach((el) => {
      const aria = el.getAttribute("aria-label");
      if (aria?.includes("に質問する")) {
        if (!el.dataset.cadAskBaseAriaLabel) {
          el.dataset.cadAskBaseAriaLabel = aria;
        }
        const next = replaceAskLabel(el.dataset.cadAskBaseAriaLabel);
        if (next !== aria) el.setAttribute("aria-label", next);
      }
      const title = el.getAttribute("title");
      if (title?.includes("に質問する")) {
        if (!el.dataset.cadAskBaseTitle) {
          el.dataset.cadAskBaseTitle = title;
        }
        const next = replaceAskLabel(el.dataset.cadAskBaseTitle);
        if (next !== title) el.setAttribute("title", next);
      }
    });

    const textTargets = document.querySelectorAll(
      'button span, [role="tooltip"] span, [class*="tooltip"] span, [data-radix-popper-content-wrapper] span'
    );
    textTargets.forEach((el) => {
      if (el.childElementCount > 0) return;
      const text = el.textContent || "";
      if (!text.includes("に質問する") || !text.includes("ChatGPT")) return;
      if (!el.dataset.cadAskBaseText) {
        el.dataset.cadAskBaseText = text;
      }
      const next = replaceAskLabel(el.dataset.cadAskBaseText);
      if (next !== text) el.textContent = next;
    });
  }

  function resetDecorations() {
    document.querySelectorAll(".cad-header").forEach((el) => el.remove());
    document.querySelectorAll(".cad-message").forEach((el) => {
      el.classList.remove("cad-message");
      el.dataset.cadDecorated = "0";
    });
    messageImageCache = new WeakMap();
  }

  function isInjectedNode(node) {
    if (!(node instanceof Element)) return false;
    return (
      node.classList.contains("cad-header") ||
      node.classList.contains("cad-toggle-btn") ||
      node.classList.contains("cad-toggle-toast") ||
      !!node.closest(".cad-header, .cad-toggle-btn, .cad-toggle-toast")
    );
  }

  function shouldProcessMutations(mutations) {
    const messageOrTooltipSelector = [
      'div[data-message-author-role="assistant"]',
      '[aria-label*="に質問する"]',
      '[title*="に質問する"]',
      '[role="tooltip"]'
    ].join(",");
    for (const mutation of mutations) {
      if (mutation.type !== "childList") continue;
      for (const node of mutation.addedNodes) {
        if (isInjectedNode(node)) continue;
        if (!(node instanceof Element)) continue;
        if (node.matches(messageOrTooltipSelector) || node.querySelector(messageOrTooltipSelector)) {
          return true;
        }
      }
      for (const node of mutation.removedNodes) {
        if (isInjectedNode(node)) continue;
        if (!(node instanceof Element)) continue;
        if (node.matches(messageOrTooltipSelector) || node.querySelector(messageOrTooltipSelector)) {
          return true;
        }
      }
    }
    return false;
  }

  const observer = new MutationObserver((mutations) => {
    if (!shouldProcessMutations(mutations)) return;
    scheduleScan();
    startFallbackObservation(1200);
  });

  function startFallbackObservation(windowMs = FALLBACK_OBSERVER_WINDOW_MS) {
    if (!fallbackObserverActive) {
      observer.observe(document.body, { childList: true, subtree: true });
      fallbackObserverActive = true;
    }
    if (fallbackObserverTimer) clearTimeout(fallbackObserverTimer);
    fallbackObserverTimer = setTimeout(() => {
      observer.disconnect();
      fallbackObserverActive = false;
      fallbackObserverTimer = null;
    }, windowMs);
  }

  function clearPostNavTimers() {
    postNavTimers.forEach((id) => clearTimeout(id));
    postNavTimers = [];
  }

  function schedulePostNavigationRescans() {
    clearPostNavTimers();
    // Project list and header often render after async hydration.
    const delays = [250, 900, 1800, 3500, 5500];
    delays.forEach((delay) => {
      const id = setTimeout(() => {
        scheduleScan(true);
      }, delay);
      postNavTimers.push(id);
    });
  }

  function scheduleScan(forceTheme = false) {
    if (forceTheme) themeDirty = true;
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scanAndDecorate();
    });
  }

  let lastPath = window.location.pathname;
  let lastProjectId = getProjectIdFromUrl();

  function handleLocationChange() {
    const path = window.location.pathname;
    const projectId = getProjectIdFromUrl();
    if (path === lastPath && projectId === lastProjectId) return;
    lastPath = path;
    lastProjectId = projectId;
    resetDecorations();
    scheduleScan(true);
    startFallbackObservation(8000);
    schedulePostNavigationRescans();
  }

  function patchHistoryEvents() {
    const { pushState, replaceState } = history;
    history.pushState = function patchedPushState(...args) {
      const out = pushState.apply(this, args);
      handleLocationChange();
      return out;
    };
    history.replaceState = function patchedReplaceState(...args) {
      const out = replaceState.apply(this, args);
      handleLocationChange();
      return out;
    };
  }

  function handleUiNavigationTrigger(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const hit = target.closest(
      [
        'a[href]',
        'button',
        '[role="button"]',
        '[data-testid*="conversation"]',
        '[data-testid*="chat"]',
        '[data-testid*="project"]',
        "aside",
        "nav"
      ].join(",")
    );
    if (!hit) return;
    scheduleScan();
    startFallbackObservation(8000);
    schedulePostNavigationRescans();
  }

  function handleShortcutToggle(event) {
    const settings = featureSettings || defaultSettings;
    const shortcutEnabled = settings?.global?.shortcutEnabled ?? true;
    if (!shortcutEnabled) return;
    if (!event.altKey || !event.shiftKey) return;
    if (event.repeat) return;
    const key = String(event.key || "").toUpperCase();
    if (key !== TOGGLE_SHORTCUT_KEY) return;
    const activeEl = document.activeElement;
    const isTyping =
      activeEl &&
      (activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.isContentEditable === true);
    if (isTyping) return;
    event.preventDefault();
    event.stopPropagation();
    const current = isFeatureEnabled(settings);
    void updateEnabledFlag(!current, true);
  }

  function start() {
    patchHistoryEvents();
    refreshCachedSettings().then(() => scheduleScan(true));
    startFallbackObservation();
    window.addEventListener("load", () => {
      scheduleScan(true);
      startFallbackObservation(8000);
      schedulePostNavigationRescans();
    });
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("pointerup", handleUiNavigationTrigger, true);
    window.addEventListener("click", handleUiNavigationTrigger, true);
    window.addEventListener("resize", () => scheduleScan(true));
    window.addEventListener("keydown", handleShortcutToggle, true);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "cad:settings-updated") {
      document.querySelectorAll("[data-cad-decorated='1']").forEach((el) => {
        el.dataset.cadDecorated = "0";
      });
      messageImageCache = new WeakMap();
      rgbaCache.clear();
      refreshCachedSettings().then(() => {
        scheduleScan(true);
        startFallbackObservation(8000);
        schedulePostNavigationRescans();
      });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
