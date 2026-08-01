# 🔐 Final local hardening gate — lifecycle, restore privacy, and installer provenance

![Status](https://img.shields.io/badge/status-local%20verification%20passed-2e7d32) ![Publication](https://img.shields.io/badge/publication-not%20pushed%20yet-ef6c00) ![Platform](https://img.shields.io/badge/platform-Windows-1565c0)

**Checkpoint:** `2026-07-31T22:51:49-04:00`  
**State:** current working tree only; these changes are **not yet on the default branch or in a public release**.

> [!IMPORTANT]
> This milestone records verified local behavior, not a prediction about CI or publication. The final desktop interaction and documentation-site audits are still running.

## What changed / 改咗啲乜

| Area | Exact change | 驗證重點 |
|---|---|---|
| Quit lifecycle | IPC teardown moved from `before-quit` to `will-quit`, keeping persistence available through every renderer close handshake. | 關閉視窗嗰陣唔會早一步拆走儲存通道，唔再自己閂門再問點解入唔到屋。 |
| History restore privacy | Restore now returns only `restored`, `historyRecorded`, public revision metadata, and a bounded error envelope. Restored workspace data and protected paths never cross the restore reply. | 還原內容留喺主程序，回覆只講結果，唔會順手搬埋夾萬出嚟。 |
| Restore truthfulness | The renderer distinguishes a fully recorded append-only restore from a restore that applied but could not append its follow-up history entry. | 套用成功同版本紀錄成功係兩回事；畫面而家會老實分開講。 |
| Installer privilege | The Authenticode-unsigned build is constrained to per-user install, `allowElevation: false`, and `asInvoker`. | 未有正式簽章就唔扮大佬攞管理員權限。 |
| Build provenance | A pinned official build-provenance action attests the exact installer digest. Publication verifies it once before draft creation and again from downloaded draft bytes before making the release public. | 同一個安裝檔驗兩次身份證，唔係望兩眼就放行。 |

## Evidence / 證據

- [x] Lifecycle, IPC, history, and workspace focused tests: **22 passed, 0 failed**.
- [x] Release workflow policy tests: **4 passed, 0 failed**.
- [x] JavaScript syntax checks: **passed**.
- [x] `actionlint 1.7.12`: **passed with no findings**.
- [x] Open issue rescan: **0** in `material-office`; **0** in `agent-global-memory`.
- [ ] Full settled renderer/site suites and rebuilt installer: still pending the active final audit fixes.
- [ ] GitHub Actions, Release, Pages, installer readback, and attestation verification: not started because the working tree has not been pushed.

<details>
<summary><strong>Release trust model / 發布信任模式</strong></summary>

The first installer has no configured Windows code-signing identity, and release notes will say so plainly. It cannot request elevation. The release attaches a SHA-256 checksum and repository/workflow build-provenance attestation; the workflow itself verifies the exact installer before and after draft upload. A future release can add Authenticode when a protected signing identity is available without weakening these provenance checks.

首個安裝檔未配置 Windows code-signing 身份，發布說明會清楚寫明；安裝檔亦唔可以要求提升權限。每個發布會附 SHA-256 同 repository/workflow build provenance，workflow 仲會喺 draft 上載前後驗證同一份 bytes。日後有受保護簽章身份時可以再加 Authenticode，但現有來源驗證唔會拆走。

</details>

## Next gate / 下一關

The remaining work is to finish the active desktop accessibility/history/localization pass and the landing-page regex/tab/funny-level pass, then rebuild and exercise the exact installer through package, install, launch, icon, uninstall, LibreOffice, and static-site verification.

餘下工作係完成桌面無障礙／版本紀錄／本地化，同網站 regex／分頁／搞笑程度兩條線；之後用最終樹重新打包，再由安裝、啟動、圖示、移除、LibreOffice 到靜態網站逐關驗清楚。
