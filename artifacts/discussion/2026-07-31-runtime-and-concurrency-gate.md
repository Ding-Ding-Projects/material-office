# 🧪 Runtime and concurrency gate / 真實 runtime 同並行閘口

![Status](https://img.shields.io/badge/status-final%20hardening-6750A4) ![Windows](https://img.shields.io/badge/platform-Windows%20x64-0078D4) ![Audit](https://img.shields.io/badge/audit-P1s%20being%20closed-F9A825)

**Checkpoint:** `2026-07-31T22:10:15-04:00`

> [!IMPORTANT]
> This is still **local candidate evidence**. No Material Office application commit, GitHub Actions run, installer release, or GitHub Pages deployment is being claimed yet.
>
> 呢度仍然係**本機候選版本證據**。Material Office 應用程式 commit、GitHub Actions、安裝器 release 同 GitHub Pages 都未發布；雞已經熟得七七八八，但未上碟就唔會叫客人埋單。

## ✅ Verified evidence / 已驗證證據

| Gate | Current evidence | State |
| --- | --- | --- |
| Main-process and security suites | **80 passing** after adding a real-Git cleanup-retry regression | ✅ Verified locally |
| Renderer domain suites | **64 passing** across editing, formulas, regex deadlines, localization, tabs, accessibility, and workspace merging | ✅ Verified locally |
| Package contract | **3 passing**; canonical legal assets are byte-identical in desktop and site bundles | ✅ Verified locally |
| Documentation site | Sites build **4/4**, static Pages build **3/3**, lint clean | ✅ Verified locally |
| Dependency audit | Root and documentation trees report **0 vulnerabilities** | ✅ Verified locally |
| Electron | Official Electron **43.2.0** isolated runtime passed the real desktop smoke | ✅ Verified locally |
| LibreOffice | Official signed **26.2.5** MSI; HTML→PDF **72,189 bytes**, FODT→PDF **57,884 bytes**, both valid through EOF | ✅ Verified locally |
| Workflow | Pinned-action workflow passes `actionlint`; every push and manual dispatch enters the test/release pipeline | ✅ Verified locally |

- Every rendered interactive control now receives a persistent appearance target, including controls created later in dialogs, popovers, and notifications. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> opens the exact focused element's editor, and the editor can customize its own controls.
- The Windows package carries a five-file isolated Git history runtime plus exact legal manifests and gated corresponding-source assets; no shell, credential manager, or unrelated tool is bundled.
- The app now exercises genuine LibreOffice conversion rather than accepting a mocked executable handshake.

- 每個畫面控制項——包括之後先開嘅 dialog、popover 同通知——都有穩定外觀目標。撳 <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> 會精準打開焦點元件嘅編輯器，個編輯器自己都唔可以扮透明人，一樣改得到。
- Windows 套件只帶五個檔案嘅隔離 Git 歷史 runtime，同埋完整法律清單及對應原始碼資產；冇偷偷夾帶 shell、credential manager 或工具雜貨舖。
- LibreOffice 閘口而家真係轉兩種文件做 PDF，唔再俾一個識點頭嘅假程序蒙混過關。

## 🔎 Independent audit findings / 獨立覆核發現

The independent persistence audit found **four P1 edge cases and no P0s**:

- [x] A failed post-prune Git collection could leave removed objects readable. Retry now always completes reflog expiry and garbage collection; the injected-failure regression proves the old snapshot becomes unreachable.
- [ ] Separate window settings could diverge from revisioned workspace state.
- [ ] A save conflict could roll back stale object references and leave live unsaved work marked clean.
- [ ] Closing immediately after an explicit discard could beat the debounce and resurrect discarded state.

後三項正喺同一個 revision-aware persistence 修正入面處理。呢啲唔係「平時撞唔到就當冇事」嘅彩蛋；未有衝突、即時關窗同重新啟動證據之前，封裝同發布閘口會繼續鎖住。

## 🚧 Next gate / 下一個閘口

1. Land the three renderer persistence regressions and repeat all suites plus isolated Electron smoke.
2. Rebuild the NSIS package from the settled tree, verify Electron fuses and packaged contents, install silently, smoke the installed binary, validate the Start-menu icon, and uninstall cleanly.
3. Run one final independent P0/P1 audit.
4. Only then publish `main`, observe CI, Pages, and the real release asset readback before calling the build shipped.

> [!NOTE]
> Open-issue re-scan at this checkpoint: **0** in Material Office and **0** in the shared-instructions repository.
