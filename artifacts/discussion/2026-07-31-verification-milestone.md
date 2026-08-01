## 🧪 Milestone: real-runtime verification / 真機驗證里程碑

![Status](https://img.shields.io/badge/status-local%20verification-blue) ![Platform](https://img.shields.io/badge/platform-Windows-0078D4) ![LibreOffice](https://img.shields.io/badge/LibreOffice-26.2.5-18A303)

> [!IMPORTANT]
> These results are verified in the local working tree. They are **not yet published on the default branch**, and the release workflow has **not yet run**.
>
> 以下結果已經喺本機工作樹驗證，但**尚未發布到預設分支**，發布工作流程亦都**未開始跑**。隻雞已經焗緊，未上碟就唔會扮上咗碟。

### ✅ Evidence / 證據

| Area | Verified result | 驗證結果 |
| --- | --- | --- |
| Electron smoke | 12/12 product checks; all 11 surfaces rendered; 2,433 command records loaded | 12/12 產品檢查通過；11 個畫面齊章；2,433 個指令記錄全部載入 |
| Main-process tests | 27/27 passing at the broker checkpoint | broker 檢查點 27/27 通過 |
| Renderer tests | 35/35 passing, including bounded worker-only regex evaluation | 35/35 通過，包括有時限嘅 worker-only regex 評估 |
| UNO catalog | 2,433 identities validated with no collisions; raw command URIs never cross IPC | 2,433 個身份驗證、零碰撞；原始指令 URI 唔會跨過 IPC |
| Stable LibreOffice | LibreOffice 26.2.5.2 provides conversion and pyuno | LibreOffice 26.2.5.2 轉檔同 pyuno 都正常 |
| Unicode HTML → PDF | Historical local check only; its output was not retained, so no current artifact hash is asserted | 歷史本機檢查；輸出冇保留，所以唔聲稱目前有可核對 hash |
| Retained FODT → PDF | `artifacts/verification/libreoffice-roundtrip-source.pdf`; 57,884 bytes; current SHA-256 `109ea3d4daa24ec43138612609854d38e16f8b0df6def7d1e3f2408aca2c14ed` | 已保留檔案 57,884 bytes；列出目前實際 SHA-256 |

The historical checkpoint recorded two one-page `%PDF-1.7` results. Only the FODT-derived PDF is retained in this repository; claims about the other output are not independently reproducible from the checked-in artifacts. The retained file's current byte hash is the value above.

歷史檢查點記錄過兩份一頁 `%PDF-1.7` 結果，但 repository 只保留 FODT 嗰份；另一份冇 checked-in artifact，依家唔會扮可以重現。已保留檔案嘅目前 byte hash 就係上面嗰個。

### 🔍 Root cause caught / 捉到真正原因

The installed LibreOfficeDev 27.2 alpha accepts the PDF export command but exits `255` and leaves a zero-byte temporary output. A checksum-verified official stable LibreOffice 26.2.5 runtime completes the same service calls successfully. This proves the service argument construction is sound and the failure is specific to that alpha build.

已安裝嘅 LibreOfficeDev 27.2 alpha 接受 PDF 匯出指令之後會用 `255` 離場，只留低零 byte 暫存檔。用官方 checksum 驗證過嘅 LibreOffice 26.2.5 stable 跑同一組服務呼叫就成功，所以參數冇砌歪，係嗰個 alpha build 自己踩香蕉皮。

### 🚧 Next verified gate / 下一個驗證閘口

- [ ] Finish the independent broker and renderer security reviews.
- [ ] Build and inspect the real NSIS Windows installer.
- [ ] Publish the default branch and wait for CI, Pages, and exactly one installer release.
- [ ] Verify release assets, wiki, repository homepage, and branch containment before marking complete.

- [ ] 完成獨立 broker 同 renderer 安全覆核。
- [ ] 建立兼檢查真正 NSIS Windows 安裝器。
- [ ] 發布預設分支，等 CI、Pages 同唯一一個安裝器 release 真正完成。
- [ ] 驗證 release 資產、wiki、repository homepage 同分支包含證據，先至收工。
