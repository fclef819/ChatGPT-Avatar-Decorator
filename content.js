(() => {
  const MAX_IMAGES = 5;
  let messageImageCache = new WeakMap();
  let lastBackgroundTargets = [];
  let lastGlassTargets = [];
  let lastProjectHeaderTargets = [];
  let lastListDarkTargets = [];

  const defaultSettings = {
    global: {
      name: "",
      mode: "random",
      images: Array(MAX_IMAGES).fill(""),
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

  function getSettings(cb) {
    chrome.runtime.sendMessage({ type: "cad:get-settings" }, (res) => {
      const err = chrome.runtime?.lastError;
      if (err || !res?.ok) {
        cb(mergeSettings({}));
        return;
      }
      cb(mergeSettings(res.settings || {}));
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
        assistantText: value?.assistantText || "",
        userBg: value?.userBg || "",
        userText: value?.userText || ""
      };
    }
    const merged = {
      global: {
        name: settings.global?.name || "",
        mode: settings.global?.mode || "random",
        images: Array(MAX_IMAGES).fill("").map((_, i) => settings.global?.images?.[i] || ""),
        avatarSize: settings.global?.avatarSize ?? 35,
        nameSize: settings.global?.nameSize ?? 13,
        nameColor: settings.global?.nameColor || "",
        bgImage: settings.global?.bgImage || "",
        bgOverlay: clampBgOverlay(settings.global?.bgOverlay),
        assistantBg: settings.global?.assistantBg || "",
        assistantText: settings.global?.assistantText || "",
        userBg: settings.global?.userBg || "",
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
    const root = document.documentElement;
    root.classList.add("cad-root");

    const body = document.body;
    clearBackgroundStyles(lastBackgroundTargets);
    clearGlassStyles(lastGlassTargets);
    clearProjectHeaderStyles(lastProjectHeaderTargets);
    clearListDarkStyles(lastListDarkTargets);
    const bgTargets = getBackgroundTargets();
    const glassTargets = getGlassTargets();
    const projectHeaderTargets = getProjectHeaderTargets();
    const listDarkTargets = getListDarkTargets();
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

    setCssVar(root, "--cad-assistant-bg", profile.assistantBg);
    setCssVar(root, "--cad-assistant-text", profile.assistantText);
    setCssVar(root, "--cad-user-bg", profile.userBg);
    setCssVar(root, "--cad-user-text", profile.userText);
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

  function applyMessageTheme(messageEl, role, profile) {
    if (!messageEl) return;
    if (role === "assistant") {
      if (profile.assistantBg || profile.assistantText) {
        messageEl.classList.add("cad-message-assistant");
      } else {
        messageEl.classList.remove("cad-message-assistant");
      }
      messageEl.classList.remove("cad-message-user");
    } else {
      if (profile.userBg || profile.userText) {
        messageEl.classList.add("cad-message-user");
      } else {
        messageEl.classList.remove("cad-message-user");
      }
      messageEl.classList.remove("cad-message-assistant");
    }
  }

  function scanAndDecorate() {
    getSettings((settings) => {
      const profile = getActiveProfile(settings);
      applyTheme(profile);
      const nodes = document.querySelectorAll('div[data-message-author-role="assistant"]');
      nodes.forEach((el) => {
        applyMessageTheme(el, "assistant", profile);
        decorateMessage(el, profile);
      });
      const userNodes = document.querySelectorAll('div[data-message-author-role="user"]');
      userNodes.forEach((el) => applyMessageTheme(el, "user", profile));
    });
  }

  function resetDecorations() {
    document.querySelectorAll(".cad-header").forEach((el) => el.remove());
    document.querySelectorAll(".cad-message").forEach((el) => {
      el.classList.remove("cad-message");
      el.dataset.cadDecorated = "0";
    });
    document.querySelectorAll(".cad-message-assistant").forEach((el) => {
      el.classList.remove("cad-message-assistant");
    });
    document.querySelectorAll(".cad-message-user").forEach((el) => {
      el.classList.remove("cad-message-user");
    });
    messageImageCache = new WeakMap();
  }

  const observer = new MutationObserver(() => {
    scanAndDecorate();
  });

  let lastPath = window.location.pathname;
  let lastProjectId = getProjectIdFromUrl();

  function handleLocationChange() {
    const path = window.location.pathname;
    const projectId = getProjectIdFromUrl();
    if (path === lastPath && projectId === lastProjectId) return;
    lastPath = path;
    lastProjectId = projectId;
    resetDecorations();
    scanAndDecorate();
  }

  function start() {
    scanAndDecorate();
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(handleLocationChange, 800);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "cad:settings-updated") {
      document.querySelectorAll("[data-cad-decorated='1']").forEach((el) => {
        el.dataset.cadDecorated = "0";
      });
      messageImageCache = new WeakMap();
      scanAndDecorate();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
