(() => {
  "use strict";

  const defaults = {
    size: 32,
    textColor: "#ffffff",
    textOpacity: 100,
    backgroundColor: "#000000",
    backgroundOpacity: 70,
    verticalPosition: 12
  };

  let enabled = false;
  let settings = { ...defaults };
  let catalog = [];
  let offsets = {};
  let current = null;
  let cues = [];
  let video = null;
  let host = null;
  let caption = null;
  let detectTimer = null;
  let renderTimer = null;
  let loadController = null;
  let loadVersion = 0;
  let status = "Off";
  let lastText = "";

  // Compare display titles with Windows-safe folder names. Keep whitespace
  // boundaries before removing control characters such as line breaks.
  const normalize = value => value.normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .toLocaleLowerCase();
  const watchPage = () => location.pathname.startsWith("/watch/");
  const offsetKey = item => `${item.series}/${item.episode}`;

  // These bundled One Piece SRTs use a shorter cut. The offset was measured
  // against Crunchyroll playback; the duration check avoids shifting replacements.
  function bundledOffset(item, parsed) {
    const lastCue = parsed.at(-1);
    return normalize(item.series) === "one piece"
      && item.episode >= 284 && item.episode <= 325
      && lastCue && lastCue.end >= 1260 && lastCue.end <= 1300 ? 110 : 0;
  }

  function effectiveOffset() {
    if (!current) return 0;
    const saved = offsets[offsetKey(current)];
    return Number.isFinite(Number(saved)) && saved !== undefined
      ? Number(saved) : current.baseOffset || 0;
  }

  function statusReply() {
    return {
      enabled,
      status,
      series: current?.series || null,
      episode: current?.episode || null,
      offset: effectiveOffset(),
      defaultOffset: current?.baseOffset || 0
    };
  }

  function seriesOnPage() {
    if (!catalog.length) return null;
    const candidates = document.querySelectorAll(
      "a[href*='/series/'], [data-t*='series-title'], h1, h2, h3"
    );
    for (const element of candidates) {
      const name = normalize(element.textContent || "");
      const match = catalog.find(series => normalize(series) === name);
      if (match) return match;
    }
    return null;
  }

  function episodeOnPage() {
    const candidates = document.querySelectorAll("h1, h2, [data-t*='episode-title']");
    for (const element of candidates) {
      const text = (element.textContent || "").trim();
      const match = /^E\s*0*(\d{1,5})(?=\D|$)/i.exec(text);
      if (match && Number(match[1]) > 0) return Number(match[1]);
    }
    return null;
  }

  function playerVideo() {
    return [...document.querySelectorAll("video")]
      .filter(element => {
        const box = element.getBoundingClientRect();
        return box.width >= 240 && box.height >= 120;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return br.width * br.height - ar.width * ar.height;
      })[0] || null;
  }

  function removeOverlay() {
    host?.remove();
    host = null;
    caption = null;
    lastText = "";
  }

  function ensureOverlay() {
    if (host) return;
    host = document.createElement("div");
    host.id = "cr-local-subs-overlay";
    host.style.cssText = "position:fixed;pointer-events:none;z-index:2147483647;overflow:visible;";
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      .caption { position:absolute; left:2%; width:96%; text-align:center;
        white-space:pre-line; overflow-wrap:anywhere; font-family:Arial,sans-serif;
        font-weight:700; line-height:1.35; text-shadow:0 1px 2px #000,0 2px 5px #000; }
      .caption span { padding:0.08em 0.28em; box-decoration-break:clone;
        -webkit-box-decoration-break:clone; border-radius:0.15em; }
    `;
    caption = document.createElement("div");
    caption.className = "caption";
    shadow.append(style, caption);
    document.documentElement.append(host);
  }

  function color(hex, opacity) {
    const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000";
    const alpha = Math.min(100, Math.max(0, Number(opacity) || 0)) / 100;
    return `rgba(${parseInt(safe.slice(1, 3), 16)},${parseInt(safe.slice(3, 5), 16)},${parseInt(safe.slice(5, 7), 16)},${alpha})`;
  }

  function placeOverlay() {
    if (!host || !video) return;
    const fullscreen = document.fullscreenElement;
    const parent = fullscreen && fullscreen !== video ? fullscreen : document.documentElement;
    if (host.parentElement !== parent) parent.append(host);
    const rect = video.getBoundingClientRect();
    host.style.left = `${rect.left}px`;
    host.style.top = `${rect.top}px`;
    host.style.width = `${rect.width}px`;
    host.style.height = `${rect.height}px`;
    caption.style.bottom = `${Math.min(35, Math.max(0, Number(settings.verticalPosition) || 0))}%`;
    caption.style.fontSize = `${Math.max(10, Math.min(72, Number(settings.size) || 32)) * Math.min(1.8, rect.width / 1280)}px`;
    caption.style.color = color(settings.textColor, settings.textOpacity);
    if (caption.firstElementChild) {
      caption.firstElementChild.style.backgroundColor = color(settings.backgroundColor, settings.backgroundOpacity);
    }
  }

  function visibleText(time) {
    if (!cues.length) return "";
    const shiftedTime = time - effectiveOffset();
    // Binary search to avoid walking every cue in a long episode on each frame.
    let low = 0;
    let high = cues.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (cues[middle].start <= shiftedTime) low = middle + 1;
      else high = middle;
    }
    const active = [];
    for (let i = low - 1; i >= 0 && i >= low - 8; i--) {
      if (cues[i].end > shiftedTime) active.unshift(cues[i].text);
    }
    return active.join("\n");
  }

  function render() {
    if (!enabled || !current || !video || !cues.length) return;
    ensureOverlay();
    placeOverlay();
    const text = visibleText(video.currentTime);
    if (text === lastText) return;
    lastText = text;
    caption.replaceChildren();
    if (text) {
      const span = document.createElement("span");
      span.textContent = text;
      span.style.backgroundColor = color(settings.backgroundColor, settings.backgroundOpacity);
      caption.append(span);
    }
  }

  async function loadSubtitle(item) {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const version = ++loadVersion;
    cues = [];
    removeOverlay();
    status = `Loading E${item.episode}…`;
    try {
      const file = `Series/${encodeURIComponent(item.series)}/${item.episode}.srt`;
      const response = await fetch(chrome.runtime.getURL(file), { signal: controller.signal });
      if (version !== loadVersion || !enabled) return;
      if (!response.ok) {
        status = response.status === 404 ? `No ${item.episode}.srt in ${item.series}` : `Subtitle load failed (${response.status})`;
        return;
      }
      const parsed = autoSubParseSrt(await response.text());
      if (version !== loadVersion || !enabled) return;
      cues = parsed;
      current.baseOffset = bundledOffset(item, parsed);
      status = parsed.length ? `Showing ${item.series} E${item.episode}` : `No valid cues in ${item.episode}.srt`;
      render();
    } catch (error) {
      if (error.name !== "AbortError" && version === loadVersion) {
        status = "Could not read subtitle file";
        console.warn("Local subtitles:", error);
      }
    }
  }

  function detect() {
    if (!enabled) return;
    if (!watchPage()) {
      loadController?.abort();
      loadVersion++;
      current = null;
      video = null;
      cues = [];
      removeOverlay();
      status = "Open a Crunchyroll episode";
      return;
    }
    if (!catalog.length) {
      loadController?.abort();
      loadVersion++;
      current = null;
      video = null;
      cues = [];
      removeOverlay();
      status = "No series folders found";
      return;
    }
    const series = seriesOnPage();
    const episode = episodeOnPage();
    const foundVideo = playerVideo();
    if (!series || !episode) {
      if (current) {
        loadController?.abort();
        loadVersion++;
        current = null;
        cues = [];
        removeOverlay();
      }
      status = !series ? "Series not in library" : "Waiting for episode title";
      return;
    }
    if (!foundVideo) {
      video = null;
      removeOverlay();
      status = "Waiting for video player";
      return;
    }
    video = foundVideo;
    if (!current || current.series !== series || current.episode !== episode || current.url !== location.pathname) {
      current = { series, episode, url: location.pathname, baseOffset: 0 };
      loadSubtitle(current);
    } else if (cues.length) {
      status = `Showing ${series} E${episode}`;
      render();
    }
  }

  function start() {
    if (detectTimer) return;
    status = "Checking page…";
    detect();
    detectTimer = setInterval(detect, 1000);
    renderTimer = setInterval(render, 100);
  }

  function stop() {
    clearInterval(detectTimer);
    clearInterval(renderTimer);
    detectTimer = null;
    renderTimer = null;
    loadController?.abort();
    loadVersion++;
    current = null;
    video = null;
    cues = [];
    removeOverlay();
    status = "Off";
  }

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.type === "GET_STATUS") reply(statusReply());
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) {
      settings = { ...defaults, ...(changes.settings.newValue || {}) };
      if (enabled) render();
    }
    if (changes.offsets) {
      offsets = changes.offsets.newValue || {};
      if (enabled) render();
    }
    if (changes.seriesCatalog) {
      catalog = Array.isArray(changes.seriesCatalog.newValue) ? changes.seriesCatalog.newValue : [];
      if (enabled) detect();
    }
    if (changes.enabled) {
      enabled = changes.enabled.newValue === true;
      if (enabled) start();
      else stop();
    }
  });

  async function initialize() {
    try {
      const stored = await chrome.storage.local.get(["enabled", "settings", "seriesCatalog", "offsets"]);
      enabled = stored.enabled === true;
      settings = { ...defaults, ...(stored.settings || {}) };
      offsets = stored.offsets || {};
      if (Array.isArray(stored.seriesCatalog)) catalog = stored.seriesCatalog;
      else {
        const response = await fetch(chrome.runtime.getURL("series-catalog.json"));
        if (response.ok) catalog = await response.json();
      }
      if (enabled) start();
    } catch (error) {
      status = "Extension setup failed";
      console.warn("Local subtitles:", error);
    }
  }

  initialize();
})();
