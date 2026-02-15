(() => {
  const MAX_IMAGES = 5;
  const STORAGE_KEY = "cad_settings_v1";
  let messageImageCache = new WeakMap();

  const defaultSettings = {
    global: {
      name: "",
      mode: "random",
      images: Array(MAX_IMAGES).fill(""),
      avatarSize: 35,
      nameSize: 13,
      bgImage: "",
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
    if (m) return m[1];
    m = path.match(/\/g\/([^/]+)/);
    if (m) {
      const raw = m[1];
      const base = raw.match(/^(g-p-[0-9a-f]{32})/i);
      return base ? base[1] : raw;
    }
    return "";
  }

  function getSettings(cb) {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      const settings = res[STORAGE_KEY] || {};
      cb(mergeSettings(settings));
    });
  }

  function mergeSettings(settings) {
    const normalizedProjects = {};
    const inputProjects = settings.projects || {};
    for (const [key, value] of Object.entries(inputProjects)) {
      normalizedProjects[key] = {
        name: value?.name || "",
        mode: value?.mode || "random",
        images: Array(MAX_IMAGES).fill("").map((_, i) => value?.images?.[i] || ""),
        avatarSize: value?.avatarSize ?? 35,
        nameSize: value?.nameSize ?? 13,
        bgImage: value?.bgImage || "",
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
        bgImage: settings.global?.bgImage || "",
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
      header.appendChild(span);
    }

    messageEl.insertBefore(header, messageEl.firstChild);
    messageEl.dataset.cadDecorated = "1";
  }

  function applyTheme(profile) {
    const root = document.documentElement;
    root.classList.add("cad-root");

    const body = document.body;
    if (profile.bgImage) {
      root.style.setProperty("--cad-bg-image", `url("${profile.bgImage}")`);
      body.classList.add("cad-bg");
    } else {
      root.style.setProperty("--cad-bg-image", "none");
      body.classList.remove("cad-bg");
    }

    setCssVar(root, "--cad-assistant-bg", profile.assistantBg);
    setCssVar(root, "--cad-assistant-text", profile.assistantText);
    setCssVar(root, "--cad-user-bg", profile.userBg);
    setCssVar(root, "--cad-user-text", profile.userText);
  }

  function setCssVar(root, key, value) {
    if (!root) return;
    if (value) {
      root.style.setProperty(key, value);
    } else {
      root.style.removeProperty(key);
    }
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

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_KEY]) {
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
