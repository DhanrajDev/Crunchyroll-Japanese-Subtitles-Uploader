(() => {
  "use strict";

  function timestamp(value) {
    const match = /^(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(value.trim());
    if (!match) return NaN;
    const [, hours, minutes, seconds, fraction] = match;
    if (+minutes > 59 || +seconds > 59) return NaN;
    return +hours * 3600 + +minutes * 60 + +seconds + +(fraction.padEnd(3, "0")) / 1000;
  }

  function parseSrt(source) {
    const blocks = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/\n\s*\n/);
    const cues = [];
    for (const block of blocks) {
      const lines = block.trim().split("\n");
      const timingIndex = lines.findIndex(line => line.includes("-->"));
      if (timingIndex < 0) continue;
      const timing = /^\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}[,.]\d{1,3})/.exec(lines[timingIndex]);
      if (!timing) continue;
      const start = timestamp(timing[1]);
      const end = timestamp(timing[2]);
      const text = lines.slice(timingIndex + 1).join("\n")
        .replace(/<\/?(?:i|b|u|font)(?:\s[^>]*)?>/gi, "")
        .trim();
      if (Number.isFinite(start) && end > start && text) cues.push({ start, end, text });
    }
    return cues.sort((a, b) => a.start - b.start);
  }

  globalThis.autoSubParseSrt = parseSrt;
})();
