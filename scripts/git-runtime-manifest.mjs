export const GIT_FOR_WINDOWS_RELEASE = Object.freeze({
  version: '2.55.0.3',
  gitVersion: '2.55.0.windows.3',
  packageVersion: '2.55.0.3-1',
  tag: 'v2.55.0.windows.3',
  archiveName: 'MinGit-2.55.0.3-64-bit.zip',
  archiveUrl: 'https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.3/MinGit-2.55.0.3-64-bit.zip',
  archiveSha256: 'f48e2d2dc74a24454adc6d8fd0ac25bf9c2386f19cfb06202b9465aaad4f9f05',
  archiveBytes: 38_791_206,
  releaseUrl: 'https://github.com/git-for-windows/git/releases/tag/v2.55.0.windows.3'
});

export const GIT_RUNTIME_PAYLOAD = Object.freeze([
  Object.freeze({
    path: 'mingw64/bin/git.exe',
    bytes: 4_383_048,
    sha256: '1a0043555d254618f2d56c936c3d9a1fbfb878bc878416a133c346bc7835eda9',
    package: 'mingw-w64-x86_64-git',
    version: '2.55.0.3-1',
    license: 'GPL-2.0-only'
  }),
  Object.freeze({
    path: 'mingw64/bin/libiconv-2.dll',
    bytes: 1_143_148,
    sha256: '7a282a854e01be726c6cccfe46f548c716aa45b3014818468253aaa4efbcd067',
    package: 'mingw-w64-x86_64-libiconv',
    version: '1.19-1',
    license: 'LGPL-2.1-or-later'
  }),
  Object.freeze({
    path: 'mingw64/bin/libintl-8.dll',
    bytes: 298_731,
    sha256: '0537c3dd2378218508ebe3cc416d72a99ee2d24ae1c5525e23458f32544ef861',
    package: 'mingw-w64-x86_64-gettext-runtime',
    version: '1.0-1',
    license: 'LGPL-2.1-or-later'
  }),
  Object.freeze({
    path: 'mingw64/bin/libpcre2-8-0.dll',
    bytes: 717_955,
    sha256: 'c135a87ed0f11eae8ffc4cb469671ff0b3f5d71fab5fb024e9b1e7241ca25b52',
    package: 'mingw-w64-x86_64-pcre2',
    version: '10.47-1',
    license: 'BSD-3-Clause'
  }),
  Object.freeze({
    path: 'mingw64/bin/zlib1.dll',
    bytes: 128_488,
    sha256: '93e9243a44c29200eeacaf9658efe2558581770e4b11ca4b500e18e424a6e3b5',
    package: 'mingw-w64-x86_64-zlib',
    version: '1.3.2-2',
    license: 'Zlib'
  })
]);

export const GIT_RUNTIME_LICENSES = Object.freeze([
  Object.freeze({ source: 'LICENSE.txt', target: 'legal/licenses/git/COPYING', bytes: 19_125, sha256: '454649ddc02b5cc098513cea28db6592b45ac0a906386287c4d48cf8dbde651c' }),
  Object.freeze({ source: 'mingw64/share/licenses/libiconv/COPYING', target: 'legal/licenses/libiconv/COPYING', bytes: 35_147, sha256: '8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903' }),
  Object.freeze({ source: 'mingw64/share/licenses/libiconv/COPYING.LIB', target: 'legal/licenses/libiconv/COPYING.LIB', bytes: 26_419, sha256: '20e50fe7aae3e56378ebf0417d9de904f55a0e61e4df315333e632a4d3555d95' }),
  Object.freeze({ source: 'mingw64/share/licenses/libiconv/README', target: 'legal/licenses/libiconv/README', bytes: 5_741, sha256: '4ae66e61d1c6593c84c47105b368d579bcee1af566dbb959ec63a0c48425dcf4' }),
  Object.freeze({ source: 'mingw64/share/licenses/libiconv/libcharset/COPYING.LIB', target: 'legal/licenses/libiconv/libcharset/COPYING.LIB', bytes: 26_419, sha256: '20e50fe7aae3e56378ebf0417d9de904f55a0e61e4df315333e632a4d3555d95' }),
  Object.freeze({ source: 'mingw64/share/licenses/gettext-runtime/COPYING', target: 'legal/licenses/gettext-runtime/COPYING', bytes: 495, sha256: '7ef2cdfe58e0c0460657b6598b49af29d4e03c1e41cbaf0e1da1eb8ad74b95d0' }),
  Object.freeze({ source: 'mingw64/share/licenses/gettext-runtime/intl/COPYING.LIB', target: 'legal/licenses/gettext-runtime/intl/COPYING.LIB', bytes: 26_419, sha256: '20e50fe7aae3e56378ebf0417d9de904f55a0e61e4df315333e632a4d3555d95' }),
  Object.freeze({ source: 'mingw64/share/licenses/gettext-runtime/libasprintf/COPYING', target: 'legal/licenses/gettext-runtime/libasprintf/COPYING', bytes: 65, sha256: '03133addae5b99a6148c538300e6d97074453089be1423b741bd081f18e2b298' }),
  Object.freeze({ source: 'mingw64/share/licenses/gettext-runtime/libasprintf/COPYING.LIB', target: 'legal/licenses/gettext-runtime/libasprintf/COPYING.LIB', bytes: 26_419, sha256: '20e50fe7aae3e56378ebf0417d9de904f55a0e61e4df315333e632a4d3555d95' }),
  Object.freeze({ source: 'mingw64/share/licenses/pcre2/COPYING', target: 'legal/licenses/pcre2/COPYING', bytes: 97, sha256: '99272c55f3dcfa07a8a7e15a5c1a33096e4727de74241d65fa049fccfdd59507' }),
  Object.freeze({ source: 'mingw64/share/licenses/pcre2/LICENCE.md', target: 'legal/licenses/pcre2/LICENCE.md', bytes: 4_011, sha256: '197d8a73ffee0d6b09adba2f9c677b5f5aede24edf89258a68e48248d010d811' }),
  Object.freeze({ source: 'mingw64/share/licenses/zlib/LICENSE', target: 'legal/licenses/zlib/LICENSE', bytes: 1_002, sha256: 'e32ff4e00d9d94930537635291da39e7e612703334bf6fde8c7f1686fe8a45a2' }),
  Object.freeze({ source: 'etc/package-versions.txt', target: 'legal/min-git-package-versions.txt', bytes: 1_690, sha256: '104ca60c3e0db5c282f92357fb99235e054d9c4105a0b8db1bd3d023cfbf6cbd' })
]);

export const MINGW_RECIPES = Object.freeze({
  repository: 'https://github.com/git-for-windows/MINGW-packages.git',
  commit: '998707b909fd8fc204ba34f1c2dfb2885bc381a7',
  archiveName: 'git-for-windows-MINGW-packages-998707b909fd8fc204ba34f1c2dfb2885bc381a7-runtime-recipes.tar',
  archiveSha256: 'd0347d00fc034e8a44e9786bc2e70627af083fb1cba319da8d1ddcca61e35626',
  archiveBytes: 40_960,
  paths: Object.freeze(['mingw-w64-libiconv', 'mingw-w64-gettext'])
});

export const GIT_RUNTIME_SOURCE_ASSETS = Object.freeze([
  Object.freeze({
    name: 'mingw-w64-git-2.55.0.3-1.src.tar.gz',
    url: 'https://github.com/git-for-windows/git/releases/download/v2.55.0.windows.3/mingw-w64-git-2.55.0.3-1.src.tar.gz',
    sha256: '83fe0426914069810fe3b4b5b4c662f52757b553d05272933ca0ea370cf1d905',
    bytes: 12_483_901,
    role: 'git-corresponding-source'
  }),
  Object.freeze({
    name: 'libiconv-1.19.tar.gz',
    url: 'https://ftp.gnu.org/pub/gnu/libiconv/libiconv-1.19.tar.gz',
    sha256: '88dd96a8c0464eca144fc791ae60cd31cd8ee78321e67397e25fc095c4a19aa6',
    bytes: 5_921_103,
    role: 'libiconv-corresponding-source'
  }),
  Object.freeze({
    name: 'gettext-1.0.tar.lz',
    url: 'https://ftp.gnu.org/pub/gnu/gettext/gettext-1.0.tar.lz',
    sha256: 'd6342cbe1411a2fe7d139bfed80c2d63b1babc92acfedc72501cc105184f61ee',
    bytes: 10_261_665,
    role: 'gettext-corresponding-source'
  })
]);

export const GIT_RUNTIME_COMPONENT_MANIFEST = 'legal/git-runtime-component-manifest.json';
export const GIT_RUNTIME_EXPECTED_PATHS = Object.freeze([
  ...GIT_RUNTIME_PAYLOAD.map((entry) => entry.path),
  ...GIT_RUNTIME_LICENSES.map((entry) => entry.target),
  GIT_RUNTIME_COMPONENT_MANIFEST
].sort());
