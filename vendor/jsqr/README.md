# jsQR 1.4.0

The unmodified browser distribution and Apache-2.0 license are vendored from
the official `jsqr@1.4.0` npm release. Wallet camera scanning loads this local
copy lazily; it makes no CDN request and uploads no camera images.

- Project: https://github.com/cozmo/jsQR
- Archive: https://registry.npmjs.org/jsqr/-/jsqr-1.4.0.tgz
- Retrieved: 2026-09-05
- Verified archive integrity:
  `sha512-dxLob7q65Xg2DvstYkRpkYtmKm2sPJ9oFhrhmudT1dZvNFFTlroai3AWSpLey/w5vMcLBXRgOJsbXpdN9HzU/A==`
- `package/dist/jsQR.js` → `jsQR-1.4.0.js`, SHA-256:
  `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`
- `package/LICENSE` → `LICENSE`, SHA-256:
  `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08`

Only these two explicitly named regular files were extracted, after verifying
the archive digest. No package installation or package scripts were run.
The immutable version and hashes make future vendor changes reviewable.

The loading specification named cdnjs, but cdnjs does not publish this package.
The official npm release provides the same standalone `window.jsQR` API.
