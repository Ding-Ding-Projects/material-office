# Third-party notices

This notice applies to the Material Office `0.1.0` Windows release. Material Office's original source code is offered under the [MIT License](LICENSE). That license does not replace the licenses, notices, or source-code obligations of the components listed below.

## Electron and Chromium

Material Office packages Electron `43.2.0`, whose official release identifies Chromium `150.0.7871.129`, Node.js `24.18.0`, and V8 `15.0.1240245`.

- Project: Electron
- Source: <https://github.com/electron/electron/tree/v43.2.0>
- Release/runtime versions: <https://releases.electronjs.org/release/v43.2.0>
- License: MIT
- Copyright: Electron contributors

Electron incorporates Chromium and other third-party components. Chromium is primarily distributed under a BSD-style license, while individual bundled components use their own licenses. The Material Office package includes Electron's exact MIT license as `resources/legal/ELECTRON_LICENSE.txt` and this notice as `resources/legal/THIRD_PARTY_NOTICES.md`. Chromium's source and license are available from <https://chromium.googlesource.com/chromium/src/+/150.0.7871.129/>; Chromium's component-specific notices remain authoritative for the corresponding Chromium tree. A distributor must preserve any additional notices supplied by the exact Electron binary even when they are not duplicated here.

Material Office does not modify Electron or Chromium. Electron is a runtime dependency; Electron Builder, ASAR tooling, fuse tooling, and the landing-site toolchain are build/test dependencies. Their exact versions and registry integrity values are recorded in the checked-in npm lockfiles.

## Git for Windows MinGit runtime

The Windows installer is designed to carry a minimal, unmodified subset extracted from Git for Windows MinGit so app-owned local history does not depend on a separately installed Git executable. The release package is limited to `git.exe` and the four DLLs it needs for the app's bounded local-history commands; it must not ship the complete extracted MinGit tree merely because the build archive contains it.

| Field | Exact value |
| --- | --- |
| Distribution | `MinGit-2.55.0.3-64-bit.zip` |
| Git version | `2.55.0.windows.3` |
| Upstream release | <https://github.com/git-for-windows/git/releases/tag/v2.55.0.windows.3> |
| Binary archive | <https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.3/MinGit-2.55.0.3-64-bit.zip> |
| SHA-256 | `f48e2d2dc74a24454adc6d8fd0ac25bf9c2386f19cfb06202b9465aaad4f9f05` |
| Git license | GNU General Public License version 2 (`GPL-2.0-only` for Git unless a file says otherwise) |

The intended runtime payload is exactly:

| Packaged file | Upstream component/version recorded by the pinned MinGit manifest | License family |
| --- | --- | --- |
| `mingw64/bin/git.exe` | `mingw-w64-x86_64-git 2.55.0.3-1` | GPL-2.0-only for Git unless a source file says otherwise |
| `mingw64/bin/libiconv-2.dll` | `mingw-w64-x86_64-libiconv 1.19-1` | GNU libiconv library terms, including LGPL terms; exact upstream text must accompany the binary |
| `mingw64/bin/libintl-8.dll` | `mingw-w64-x86_64-gettext-runtime 1.0-1` | GNU gettext runtime/library terms, including LGPL terms; exact upstream text must accompany the binary |
| `mingw64/bin/libpcre2-8-0.dll` | `mingw-w64-x86_64-pcre2 10.47-1` | PCRE2 BSD-style license |
| `mingw64/bin/zlib1.dll` | `mingw-w64-x86_64-zlib 1.3.2-2` | zlib License |

Packaging must retain a generated component manifest plus the exact upstream license texts for Git, libiconv, gettext-runtime/libintl, PCRE2, and zlib. Utilities and libraries outside this five-file payload are not part of the intended installer and must be rejected by package verification.

### Corresponding-source distribution gate

The release workflow prepares and verifies the following primary-source records before an installer can enter a release draft:

| Required record | Primary source | SHA-256 |
| --- | --- | --- |
| Git for Windows package source `mingw-w64-git-2.55.0.3-1.src.tar.gz` | <https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.3/mingw-w64-git-2.55.0.3-1.src.tar.gz> | `83fe0426914069810fe3b4b5b4c662f52757b553d05272933ca0ea370cf1d905` |
| GNU libiconv `1.19` source | <https://ftp.gnu.org/pub/gnu/libiconv/libiconv-1.19.tar.gz> | `88dd96a8c0464eca144fc791ae60cd31cd8ee78321e67397e25fc095c4a19aa6` |
| GNU gettext `1.0` source | <https://ftp.gnu.org/pub/gnu/gettext/gettext-1.0.tar.lz> | `d6342cbe1411a2fe7d139bfed80c2d63b1babc92acfedc72501cc105184f61ee` |
| Git-for-Windows libiconv/gettext recipes and patches | deterministic `git archive` of `mingw-w64-libiconv` and `mingw-w64-gettext` from <https://github.com/git-for-windows/MINGW-packages/commit/998707b909fd8fc204ba34f1c2dfb2885bc381a7> | `d0347d00fc034e8a44e9786bc2e70627af083fb1cba319da8d1ddcca61e35626` |

The Git for Windows source asset contains the exact `PKGBUILD`, `.SRCINFO`, Windows files, and `git-v2.55.0.windows.3.tar.gz` used for `mingw-w64-x86_64-git 2.55.0.3-1`. The pinned Git-for-Windows recipe snapshot identifies GNU libiconv `1.19` and GNU gettext `1.0`, retains every applied Windows patch, and records the same upstream hashes shown above. The installer retains the exact MinGit package-version manifest and license trees for Git, libiconv, gettext-runtime/libintl, PCRE2, and zlib.

Before any Material Office installer is publicly distributed, its release record must:

1. identify the exact MinGit archive, version, upstream release, SHA-256, five-file payload, and package versions shown above;
2. preserve the exact applicable license texts and a machine-readable component/source manifest in installed resources;
3. attach the official corresponding source for `mingw-w64-x86_64-git 2.55.0.3-1`, including the Git for Windows build recipe/patch identity needed to reproduce that package;
4. attach the exact corresponding source archives and build-recipe identity for the LGPL-covered libiconv and gettext-runtime/libintl binaries, and preserve the source/license records for PCRE2 and zlib;
5. verify every attached source asset's declared version, byte length, and SHA-256 against the release component/source manifests; and
6. block publication when the payload contains an unlisted binary, an exact license is missing, or a required corresponding-source asset cannot be obtained or matched.

`scripts/prepare-git-runtime-sources.mjs` implements this fail-closed gate. The release workflow attaches all source archives, the deterministic recipe archive, both machine-readable manifests, and the legal notices; it downloads every uploaded asset back and verifies its byte length and SHA-256 before making the release non-draft. No detached-signature verification claim is made: the gate relies on the exact upstream URLs, versions, byte lengths, and pinned SHA-256 values listed above. An upstream project page by itself is not accepted as proof. This notice describes a locally verified gate and does not claim that any public installer or hosted run has passed it.

## LibreOffice source reference and installed integration

LibreOffice is not bundled in the Material Office application or installer. Material Office can discover and invoke a separately installed LibreOffice through validated process and UNO boundaries. The `original-code-reference/libreoffice-core` Git submodule exists only for permitted behavior/API research and is excluded from application packaging and automated release checkouts.

| Field | Exact value |
| --- | --- |
| Upstream | <https://github.com/LibreOffice/core> |
| Pinned revision | `b9141dee2805a5551d112ecc4fcc6a7db7b41cd9` |
| Revision date | `2026-08-01T00:14:17+02:00` |
| Revision subject | `tdf#171940 Add tooltip for page size in sidebar` |

The pinned tree includes top-level `COPYING`, `COPYING.LGPL`, and `COPYING.MPL` texts for GPL-3.0, LGPL-3.0, and MPL-2.0 respectively, plus component-specific notices. Consult the notice on each referenced file before copying it. No LibreOffice source or binary is copied into Material Office merely because the reference submodule exists.

LibreOffice and its names and marks belong to their respective owners. Material Office is an independent project and is not an official LibreOffice or The Document Foundation product.

## Bundled dim-sum image

The Classic Har Gow · 蝦餃 PNG is a non-code catalog asset. Its exact record, source-catalog revision, byte hash, native dimensions, and bundled-copy paths are documented in [the public provenance record](docs/legal/classic-har-gow-provenance.md).

The project owner's standing release directive authorizes this exact catalog asset to be bundled with Material Office and attached to its releases. The Material Office MIT License applies to the project's original software and documentation, not automatically to this image, and the source catalog grants no downstream reuse license. The provenance record establishes identity and origin; it does not grant trademark, publicity, cultural-property, or reuse rights beyond those the applicable rights holder can grant. Downstream redistributors must make their own rights assessment and preserve this notice.

## No warranty from upstream projects

The names of upstream projects are used only to identify dependencies or interoperability targets. Their licenses include their own warranty and liability terms. Nothing in this notice implies sponsorship, endorsement, or a warranty from Electron, Chromium, Git for Windows, LibreOffice, The Document Foundation, OpenAI, or their contributors.
