# Crunchyroll Local Subtitles

**Watch Crunchyroll with your own local SRT subtitles.** This small Chrome extension finds the series and episode on a `/watch/` page, loads the matching file from its `Series` folder, and places subtitles over the video.

`Chrome 122+` · `Manifest V3` · `SRT files` · `No build step`

> [!NOTE]
> This is an unofficial project and is not affiliated with Crunchyroll. It starts **off** until you enable it in the popup.

## Get started

1. Open `chrome://extensions`, turn on **Developer mode**, and select **Load unpacked**.
2. Select this folder—the one containing `manifest.json`. There is no install or build command.
3. Open a Crunchyroll episode at `crunchyroll.com/watch/...`.
4. Open the extension popup and switch it **On**. The popup shows which series and episode it found.

The included `Series` folder already contains some SRT files. To use another series, add a folder and episode files as described below. After changing extension files, reload the extension in `chrome://extensions` and refresh the episode page.

## Add subtitles

Put one folder per series inside `Series`. Name each SRT file after its episode number:

```text
Series/
├── One Piece/
│   ├── 1.srt
│   └── 304.srt
└── Series S1/
    └── 3.srt
```

For example, an episode headed **E304 – ...** under **One Piece** loads `Series/One Piece/304.srt`. Files should be UTF-8 SRTs.

The series title must otherwise match the folder name, ignoring case and repeated whitespace. For Windows folder names, matching also ignores `< > : " / \ | ? *`, control characters, and trailing spaces or periods. Thus **Series: S1** matches `Series/Series S1/`. A semicolon (`;`) is allowed in Windows folder names and remains part of the name.

The popup scans folder names when opened. If folder scanning is unavailable, it uses the last saved list or `series-catalog.json`; add new folder names to that file for the fallback.

## Sync and appearance

| Control | What it does |
| --- | --- |
| **− / +** | Move subtitles 0.5 seconds earlier or later. **+** shows them later. |
| **Sync field** | Type a signed offset in seconds, then press Enter. |
| **Reset** | Restore the episode's automatic offset, or zero when none applies. |
| **Appearance settings** | Adjust text size, text color and opacity, background color and opacity, and vertical position. |

The on/off choice, appearance settings, and each episode's manual sync value are saved in Chrome's local extension storage. A saved manual value takes precedence over an automatic offset.

**Included One Piece timing note:** The bundled SRTs for episodes 284–325 use a shorter cut. When one of those files matches that timing pattern, the extension starts it at **+110 seconds**. You can still enter a different offset for any episode.

## If subtitles do not appear

| Popup message | Check |
| --- | --- |
| **Series not in library** | Match the series folder name to the page title, then reopen the popup to rescan. |
| **Waiting for episode title** | Wait for the page to finish loading; the title must begin with `E` and a number. |
| **Waiting for video player** | Start the episode and wait for the visible player. |
| **No _n_.srt in _series_** | Add the numbered SRT file to the matched series folder. |
| **No valid cues** | Check that the file contains standard SRT timestamps and text. |

The overlay follows the visible HTML video as it resizes, including player-container fullscreen. Browser-native video fullscreen and picture-in-picture do not support this overlay. The extension currently supports Crunchyroll `/watch/` pages and SRT files only.

## Files and publishing

| File | Purpose |
| --- | --- |
| `manifest.json` | Chrome extension configuration and site scope. |
| `popup.html`, `popup.css`, `popup.js` | Controls, status, sync, and appearance settings. |
| `content.js`, `srt.js` | Page matching, SRT parsing, and subtitle overlay. |
| `Series/` | Subtitle files grouped by series. |
| `series-catalog.json` | Fallback series list if folder scanning fails. |

There is no remote subtitle service or account. Subtitle files are packaged with the extension, and Chrome exposes those files to Crunchyroll pages so the content script can load them. Avoid bundling files you want to keep private. Before publishing a repository or fork, review whether you may redistribute the SRT files it contains.
