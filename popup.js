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
  const fields = Object.keys(defaults);
  const $ = id => document.getElementById(id);
  let settings = { ...defaults };
  let activeTab = null;
  let current = null;
  let offsetBusy = false;

  function updateLabels() {
    $("sizeValue").textContent = `${settings.size} px`;
    $("verticalPositionValue").textContent = `${settings.verticalPosition}% from bottom`;
  }

  function showSettings() {
    for (const field of fields) $(field).value = settings[field];
    updateLabels();
  }

  async function listFolders() {
    const root = await chrome.runtime.getPackageDirectoryEntry();
    const series = await new Promise((resolve, reject) => root.getDirectory("Series", {}, resolve, reject));
    const reader = series.createReader();
    const entries = [];
    while (true) {
      const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      entries.push(...batch);
    }
    return entries.filter(entry => entry.isDirectory).map(entry => entry.name).sort();
  }

  async function refreshCatalog(stored) {
    let catalog;
    try {
      catalog = await listFolders();
    } catch (error) {
      console.warn("Local subtitles: folder scan failed; using saved list", error);
      if (Array.isArray(stored) && stored.length) catalog = stored;
      else {
        const response = await fetch("series-catalog.json");
        catalog = response.ok ? await response.json() : [];
      }
    }
    $("library").textContent = `${catalog.length} series folder${catalog.length === 1 ? "" : "s"} available`;
    if (JSON.stringify(catalog) !== JSON.stringify(stored)) await chrome.storage.local.set({ seriesCatalog: catalog });
  }

  function updateSync() {
    const available = !!current && $("enabled").checked;
    for (const id of ["minus", "plus", "resetOffset"]) $(id).disabled = !available || offsetBusy;
    $("offset").disabled = !available;
    if (document.activeElement !== $("offset")) {
      $("offset").value = current ? `${current.offset >= 0 ? "+" : ""}${current.offset.toFixed(1)}` : "+0.0";
    }
    $("syncHint").hidden = !current?.defaultOffset;
    $("syncHint").textContent = current?.defaultOffset
      ? `Auto +${current.defaultOffset.toFixed(1)} s for this subtitle cut. Reset uses auto.` : "";
  }

  async function refreshStatus() {
    if (!$("enabled").checked) {
      $("status").textContent = "Off";
      current = null;
      updateSync();
      return;
    }
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = tab || null;
      if (!tab?.url || !/^https:\/\/(?:www\.)?crunchyroll\.com\/watch\//.test(tab.url)) {
        $("status").textContent = "Open a Crunchyroll episode";
        current = null;
      } else {
        const reply = await chrome.tabs.sendMessage(tab.id, { type: "GET_STATUS" });
        $("status").textContent = reply?.status || "Checking page…";
        current = reply?.series && reply?.episode
          ? {
              series: reply.series,
              episode: reply.episode,
              offset: Number(reply.offset) || 0,
              defaultOffset: Number(reply.defaultOffset) || 0
            }
          : null;
      }
    } catch (error) {
      $("status").textContent = "Reload this episode page once";
      current = null;
      console.warn("Local subtitles:", error);
    }
    updateSync();
  }

  async function saveOffset(value, reset = false) {
    if (!current || offsetBusy) return;
    offsetBusy = true;
    updateSync();
    try {
      const key = `${current.series}/${current.episode}`;
      const { offsets = {} } = await chrome.storage.local.get("offsets");
      const next = reset ? current.defaultOffset : Math.max(-3600, Math.min(3600, Math.round(value * 10) / 10));
      if (reset || next === current.defaultOffset) delete offsets[key];
      else offsets[key] = next;
      await chrome.storage.local.set({ offsets });
      current.offset = next;
    } catch (error) {
      $("status").textContent = "Could not save sync setting";
      console.warn("Local subtitles:", error);
    } finally {
      offsetBusy = false;
      updateSync();
    }
  }

  function changeOffset(delta, reset = false) {
    if (!current) return;
    saveOffset(current.offset + delta, reset);
  }

  async function saveSettings() {
    try {
      await chrome.storage.local.set({ settings });
    } catch (error) {
      $("status").textContent = "Could not save appearance settings";
      console.warn("Local subtitles:", error);
    }
  }

  for (const field of fields) {
    $(field).addEventListener("input", () => {
      settings[field] = $(field).type === "range" ? Number($(field).value) : $(field).value;
      updateLabels();
    });
    $(field).addEventListener("change", saveSettings);
  }

  $("enabled").addEventListener("change", async () => {
    try {
      await chrome.storage.local.set({ enabled: $("enabled").checked });
      await refreshStatus();
      if ($("enabled").checked) setTimeout(refreshStatus, 700);
    } catch (error) {
      $("enabled").checked = !$("enabled").checked;
      $("status").textContent = "Could not change extension state";
      console.warn("Local subtitles:", error);
    }
  });
  $("minus").addEventListener("click", () => changeOffset(-0.5));
  $("plus").addEventListener("click", () => changeOffset(0.5));
  $("resetOffset").addEventListener("click", () => changeOffset(0, true));
  $("offset").addEventListener("keydown", event => {
    if (event.key === "Enter") $("offset").blur();
    if (event.key === "Escape") {
      $("offset").value = `${current?.offset >= 0 ? "+" : ""}${(current?.offset || 0).toFixed(1)}`;
      $("offset").blur();
    }
  });
  $("offset").addEventListener("change", () => {
    const raw = $("offset").value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d)?|\.\d)$/.test(raw) || Math.abs(Number(raw)) > 3600) {
      $("status").textContent = "Enter seconds from -3600 to +3600";
      $("offset").value = `${current?.offset >= 0 ? "+" : ""}${(current?.offset || 0).toFixed(1)}`;
      return;
    }
    saveOffset(Number(raw));
  });
  $("resetAppearance").addEventListener("click", () => {
    settings = { ...defaults };
    showSettings();
    saveSettings();
  });

  async function initialize() {
    try {
      const stored = await chrome.storage.local.get(["enabled", "settings", "seriesCatalog"]);
      $("enabled").checked = stored.enabled === true;
      settings = { ...defaults, ...(stored.settings || {}) };
      showSettings();
      await refreshCatalog(stored.seriesCatalog);
      await refreshStatus();
    } catch (error) {
      $("status").textContent = "Extension setup failed";
      console.warn("Local subtitles:", error);
    }
  }
  initialize();
})();
