# 🧱 Packaging, history, and hosted-site milestone

![Status](https://img.shields.io/badge/status-hardening%20in%20progress-6750A4) ![Windows](https://img.shields.io/badge/platform-Windows%20x64-0078D4) ![Tests](https://img.shields.io/badge/local%20tests-110%20passing-2E7D32)

**Checkpoint:** `2026-07-31T21:08:12-04:00`

> [!IMPORTANT]
> The application work is still local on `main`; no Material Office application commit has been pushed yet. The public release is deliberately blocked until the hardened packaged renderer starts successfully.
>
> Material Office 應用程式改動而家仲喺本機 `main`，未推送任何應用程式 commit。加固後封裝 renderer 未真正起到之前，正式版本會繼續閂閘——閘門今次冇扮瞓，真係有做嘢。

## ✅ Verified now / 而家已驗證

| Area | Evidence | State |
|---|---|---|
| Main-process services | **63/63** tests: opaque file capabilities, transactional state, >8 MiB Git restore, process-tree abort/timeout, LibreOffice bounds, UNO catalog and broker | ✅ Verified |
| Renderer domains | **45/45** tests: colors, CSV, formulas, MathML, regex worker deadlines, tabs/groups, localization, action coverage | ✅ Verified |
| Package contract | **2/2** tests plus ASAR allowlist; generated Python cache excluded | ✅ Verified |
| Local history | Official Git-for-Windows MinGit `2.55.0.windows.3`, pinned by SHA-256 and packaged at a fixed app-owned path | ✅ Verified |
| LibreOffice | Real stable LibreOffice conversion preserved Unicode and produced valid one-page PDFs | ✅ Verified |
| Documentation site | Historical local checkpoint recorded a dependency audit, build, and 3/3 rendered-site checks; no hosted deployment or public URL is currently verified | 🟡 Local only |

## 🛠️ Functionality added / 新增真功能

- Base now has distinct working **Tables**, **Queries**, **Forms**, and **Reports** views. Queries use fixed predicates, forms create/save records, and reports calculate and export factual summaries.
- The anchored appearance editor now includes installed-font discovery, variable axes, typography and text effects, spacing, continuous color translation, state colors, named presets, theme import/export, per-element reset, and global reset.
- Local history no longer assumes Git is already installed on the PC; the installer carries a verified runtime and packaged smoke performs real snapshot/restore operations.
- Electron fuses are verified byte-for-byte, including disabled RunAsNode, Node options, CLI inspection, and legacy file-protocol privileges.

- Base 而家唔再係四個 tab 同一碟餸：**Tables、Queries、Forms、Reports** 各自真係做到編輯、查詢、表單儲存同報告匯出。
- 外觀編輯器由「改兩隻色」升級做認真工具：已安裝字型、字體軸、文字效果、間距、連續色彩翻譯、狀態色、預設、匯入匯出同重設全部齊腳。
- 本機歷史唔再靠部機「啱啱好有 Git」先開工；安裝檔自己帶住驗證 runtime，唔使向空氣借士巴拿。

## 🚧 Exact blocker / 精準阻塞

The fresh isolated build proved that disabling Electron's legacy file-protocol privilege makes `BrowserWindow.loadFile()` unsuitable for the packaged ASAR. The gate correctly failed with `ERR_FILE_NOT_FOUND` before installer or release publication. The fix in progress is a narrow `material-office://app/` protocol that serves only allowlisted renderer assets beneath the packaged root, with traversal tests and exact navigation trust.

全新隔離建置證明：關掉 Electron 舊式 file protocol 特權之後，封裝 ASAR 唔可以再靠 `BrowserWindow.loadFile()`。閘門喺發佈之前用 `ERR_FILE_NOT_FOUND` 正確截停。依家正改用窄身 `material-office://app/` protocol，只准讀封裝 renderer 根目錄下嘅白名單資產，仲要有 traversal 同導航信任測試先過關。

## 🔒 Repository controls / 儲存庫保護

- [x] Workflow configuration is present in the local candidate
- [ ] First GitHub Actions run — none existed at the 2026-07-31 publication audit
- [ ] GitHub Pages deployment — not published or verified
- [ ] Hosted Sites deployment — not published or verified
- [ ] First installer release — no GitHub Release exists

Repository settings that were not re-queried for this artifact are deliberately not marked verified. A green-looking checkbox is not a substitute for current external evidence.

> [!NOTE]
> Open-issue re-scan: **0** in this repository and **0** in the shared-instructions repository at this checkpoint.
