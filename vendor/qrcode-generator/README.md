# qrcode-generator 2.0.4

The unmodified standalone browser distribution is vendored from the official
`qrcode-generator@2.0.4` npm release. Wallet print sheets use this local encoder;
it has no runtime dependencies and makes no network requests.

- Project: https://github.com/kazuhikoarase/qrcode-generator
- Release: https://github.com/kazuhikoarase/qrcode-generator/releases/tag/js2.0.4
- Package metadata: https://registry.npmjs.org/qrcode-generator/2.0.4
- Archive: https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-2.0.4.tgz
- Retrieved: 2026-09-05
- Verified archive integrity:
  `sha512-mZSiP6RnbHl4xL2Ap5HfkjLnmxfKcPWpWe/c+5XxCuetEenqmNFf1FH/ftXPCtFG5/TDobjsjz6sSNL0Sr8Z9g==`
- `package/dist/qrcode.js` -> `qrcode-2.0.4.js`, SHA-256:
  `79ec86f82856005b1c887905cfccfcfbec3821ca61c7fd5a952faa5f778f791c`
- MIT `LICENSE`, SHA-256:
  `3a850fa5f08101db6f40676c2786e10bd2cd5fff7b12ffdf1e0c434d4e49d90c`

The npm archive omits the license file. The unmodified license was retrieved
from the package metadata's immutable `gitHead` commit:
https://raw.githubusercontent.com/kazuhikoarase/qrcode-generator/83b7e8fe3fddd3b0368dbafd6ce56995bd25e3c8/LICENSE

Only the explicitly named regular JavaScript file was extracted, after checking
the archive SHA-512 against the official npm metadata. No package installation
or package scripts were run. The immutable version and hashes make future
vendor changes reviewable. Tests verify the file hashes and round-trip public
deterministic wallet address/WIF fixtures through this encoder and the vendored
`jsQR` decoder.
