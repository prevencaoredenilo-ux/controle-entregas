# Dependências vendorizadas e checksums

Todos os arquivos listados abaixo são servidos localmente pela PWA. Os hashes são SHA-256 dos bytes entregues no projeto.

## Tesseract.js OCR

- `tesseract.js`: **5.1.1**, licença Apache-2.0; distribuição oficial npm: `https://registry.npmjs.org/tesseract.js/-/tesseract.js-5.1.1.tgz`.
- `tesseract.js-core`: **5.1.1**, licença Apache-2.0; distribuição oficial npm: `https://registry.npmjs.org/tesseract.js-core/-/tesseract.js-core-5.1.1.tgz`. Incluídas as quatro variantes LSTM, com e sem SIMD, em JavaScript e WebAssembly.
- Dados `por.traineddata`: pacote oficial `@tesseract.js-data/por` **1.0.0**, variante `4.0.0_best_int` (fast/quantizada), licença do pacote MIT; fonte do tarball `https://registry.npmjs.org/@tesseract.js-data/por/-/por-1.0.0.tgz`. O arquivo foi descompactado localmente para permitir `gzip: false`.

### SHA-256
- `tesseract.esm.min.js` — `2537be686335e4b2637e933cdc85a52dd80267a592689c1bd63235c8591540ae`
- `worker.min.js` — `aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc`
- `tesseract-core-lstm.wasm.js` — `8f04aa0cc81e7bde33f80e92fa01a7a665f0b4884d098acf5de9c7104a11dfaa`
- `tesseract-core-lstm.wasm` — `5db58ea4d1bd4256be81e8ae3b4fa226c4625dfba1850b1b3308dbf3700e9929`
- `tesseract-core-simd-lstm.wasm.js` — `ce20eda9533cbed1e6c2b4276fbae1e0adc61b6754b5513084be601787b457cf`
- `tesseract-core-simd-lstm.wasm` — `66b601224a0c4a8977bc9d92dd39841189f9ca22cc4122fcd7208cdb0961eeef`
- `tesseract-core-simd.wasm.js` — `63f232c4f7a97b04e52eb940202700b2c6239783a75d0ff0553274fac530cd5c`
- `tesseract-core-simd.wasm` — `baa2f54ef5af43ada4605fd7ae999bde3c6ecc96bfe0d0410b0b4f4a5f9c8b91`
- `tesseract-core.wasm.js` — `2b8c8c92b8788807061fb4bb16c5acdf000c149e100255f879f78d2c58ca9969`
- `tesseract-core.wasm` — `b47a852b19181ae0999f9d970c368cd351135a320ea978b35bd38602d8bcc0bc`
- `lang/por.traineddata` — `42fab1f017aedab69b92bdecc01bbb11166cd3b177575612ee860f8e2825ece0`

### Licenças

As licenças Apache-2.0 distribuídas com Tesseract.js e tesseract.js-core estão preservadas em `LICENSE-tesseract.js.md` e `LICENSE-tesseract-core.txt`. A licença dos dados `por` consta no pacote de origem indicado acima.

## jsQR QR

- `jsqr`: **1.4.0**, distribuído no npm oficial e originado em `https://github.com/cozmo/jsQR`; o manifesto npm oficial declara **Apache-2.0**, embora o pedido inicial tenha citado MIT. Para respeitar a licença da fonte oficial, foi preservado `vendor/jsqr/LICENSE` sem reclassificar o pacote.
- O pacote oficial jsQR contém `dist/jsQR.js`; hash SHA-256: `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`.
- Hash SHA-256 de `vendor/jsqr/LICENSE`: `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08`.

A imagem do comprovante é processada no aparelho. Não são usados endpoints de OCR/QR em nuvem.
