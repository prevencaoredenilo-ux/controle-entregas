# Relatório de melhorias — Órbita Controle de Entregas 13.66.2

## Mudanças por etapa

1. **Preenchimento e confiabilidade:** OCR pode substituir defaults e leituras OCR anteriores, sem sobrescrever campos editados pelo usuário; data/hora atualizam o preview; a contagem relata campos realmente aplicados; horários de impressão são ignorados, ambiguidades avisadas; Cliente/Fone na mesma linha é separado; bairro aproximado só é aplicado se candidato único; `toBlob(null)` e leituras concorrentes são tratados. A conversão de fuso atual foi preservada.
2. **Duplicidade:** comparação remove zeros à esquerda, espaços, pontos e traços somente para comparar; considera série+número quando há série, informa a entrega já existente e salva exatamente o valor confirmado.
3. **OCR local:** Tesseract.js/core/modelo português fast são locais, fixos e cacheados pelo Service Worker; worker singleton com progresso e encerramento após cinco minutos ocioso. A imagem não é enviada nem salva.
4. **Imagem/câmera:** solicitação até 1920×1080; orientação EXIF, redução a cerca de 1800 px, escala de cinza/contraste; opções separadas de câmera e galeria, prévia processada e fechamento da webcam após captura.
5. **NFC-e:** BarcodeDetector com reserva jsQR local; validação de chave de 44 dígitos e DV módulo 11; extrai série, número e mês; parser OCR aceita variações e pontuação. Número NFC-e mantém zeros conforme lido. A interface pede conferência antes do registro.
6. **Testes:** `node:test`, jsdom, parser, chave/DV e comparação de duplicidade; nenhum comprovante real foi usado.
7. **Limpeza:** versão única 13.66.2; cache SW só grava resposta OK de mesma origem; CSP adicionada; mascote removido do precache por ausência de uso detectada. Nenhuma migração IndexedDB foi feita.

## Arquivos relevantes alterados ou adicionados

`receipt-capture.js`, `views.js`, `coupon-utils.js`, `nfce-key.js`, `sw.js`, `index.html`, `manifest.webmanifest`, `package.json`, `package-lock.json`, `VERSION.txt`, `README.md`, `TODO.md`, `AUDITORIA_SEGURANCA_PRIVACIDADE.md`, `vendor/tesseract/`, `vendor/jsqr/jsQR.js`, `tests/receipt-form.integration.test.js`, `tests/nfce-key.test.js`, `tests/receipt-capture.test.js`, `tests/project-integrity.test.js`. O escopo não alterou a lógica de Supabase, entregas, SLA, financeiro, ciclos, KM, relatórios, auditoria operacional, lixeira ou backups.

## Validação

`npm ci --ignore-scripts --no-audit --no-fund`: concluído. `npm run check:syntax`: passou. `npm test`: 40 testes passaram, 0 falharam. Testes físicos de webcam, foto real com EXIF, navegação offline em aparelho e avaliação da CSP em navegadores não puderam ser executados neste ambiente.

## Ativos vendorizados: SHA-256

Versões e fontes detalhadas estão em `vendor/tesseract/VERSIONS.md`. jsQR é a versão 1.4.0; o pacote upstream informa **Apache-2.0** (não MIT), e sua licença original foi preservada. Arquivos no pacote vendorizado:

- `vendor/jsqr/LICENSE` — SHA-256 `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08`, 11358 bytes
- `vendor/jsqr/jsQR.js` — SHA-256 `bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859`, 256885 bytes
- `vendor/tesseract/LICENSE-tesseract-core.txt` — SHA-256 `c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08`, 11358 bytes
- `vendor/tesseract/LICENSE-tesseract.js.md` — SHA-256 `b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1`, 11357 bytes
- `vendor/tesseract/VERSIONS.md` — SHA-256 `cd64401070f547ad8028f985229baf06ac18f221896bf895ba759f3b97bdd840`, 2872 bytes
- `vendor/tesseract/lang/por.traineddata` — SHA-256 `42fab1f017aedab69b92bdecc01bbb11166cd3b177575612ee860f8e2825ece0`, 2422444 bytes
- `vendor/tesseract/tesseract-core-lstm.wasm` — SHA-256 `5db58ea4d1bd4256be81e8ae3b4fa226c4625dfba1850b1b3308dbf3700e9929`, 2859424 bytes
- `vendor/tesseract/tesseract-core-lstm.wasm.js` — SHA-256 `8f04aa0cc81e7bde33f80e92fa01a7a665f0b4884d098acf5de9c7104a11dfaa`, 3938277 bytes
- `vendor/tesseract/tesseract-core-simd-lstm.wasm` — SHA-256 `66b601224a0c4a8977bc9d92dd39841189f9ca22cc4122fcd7208cdb0961eeef`, 2859709 bytes
- `vendor/tesseract/tesseract-core-simd-lstm.wasm.js` — SHA-256 `ce20eda9533cbed1e6c2b4276fbae1e0adc61b6754b5513084be601787b457cf`, 3938657 bytes
- `vendor/tesseract/tesseract-core-simd.wasm` — SHA-256 `baa2f54ef5af43ada4605fd7ae999bde3c6ecc96bfe0d0410b0b4f4a5f9c8b91`, 3457317 bytes
- `vendor/tesseract/tesseract-core-simd.wasm.js` — SHA-256 `63f232c4f7a97b04e52eb940202700b2c6239783a75d0ff0553274fac530cd5c`, 4735153 bytes
- `vendor/tesseract/tesseract-core.wasm` — SHA-256 `b47a852b19181ae0999f9d970c368cd351135a320ea978b35bd38602d8bcc0bc`, 3457035 bytes
- `vendor/tesseract/tesseract-core.wasm.js` — SHA-256 `2b8c8c92b8788807061fb4bb16c5acdf000c149e100255f879f78d2c58ca9969`, 4734777 bytes
- `vendor/tesseract/tesseract.esm.min.js` — SHA-256 `2537be686335e4b2637e933cdc85a52dd80267a592689c1bd63235c8591540ae`, 67175 bytes
- `vendor/tesseract/worker.min.js` — SHA-256 `aca1229639fc9907d86f96e825955a2b7c5716d17f3bc3acd71f9c7ab66181fc`, 123724 bytes

## Decisões pendentes e itens não executados

- **Confirmar fuso:** a interpretação continua convertendo `America/Cuiaba` para `America/Sao_Paulo`, sem alteração de regra. O dono deve confirmar se é o comportamento desejado. O formulário interpreta valores como hora local do aparelho; aparelho em MT pode produzir diferença de uma hora.
- Validar fisicamente webcam/foco, importar foto celular e orientação EXIF, confirmar instalação/cache offline e leitura de QR em dispositivo real.
- `Deliveries.active()` não foi alterado porque índice implicaria migração de IndexedDB; mudança considerada não conservadora.
- Sem backend, Supabase, serviço de OCR em nuvem ou persistência/envio de imagens. Nenhum arquivo foi removido do projeto, exceto exclusão do asset não utilizado da lista de precache.

## Teste manual curto

1. Abra o app online e aguarde a instalação/cache dos arquivos offline. Abra Lançamento por foto e permita a webcam; posicione o comprovante, capture e confirme que a câmera fecha. Verifique a miniatura e confira/corrija todos os campos.
2. Escolha uma imagem pela galeria, incluindo uma foto celular com EXIF. Confirme orientação, preenchimento e mensagem de revisão. Teste uma NFC-e com QR para preencher número/série/mês.
3. Após abrir o app e carregar assets enquanto online, ative modo avião, reabra a PWA e teste OCR/QR. A primeira instalação/cache requer conexão; a imagem permanece local.


## Ajuste de desempenho após publicação

A leitura agora limita cada chamada OCR ao orçamento restante de 25 s, interrompe e encerra o worker ao exceder o limite, evita variantes quando a primeira leitura é suficiente e só tenta recortes/passadas extras quando ainda há tempo. Em aparelhos lentos, pode encerrar sem resultado completo; nesse caso orienta o usuário a tentar imagem melhor ou QR. Sintaxe e 40 testes passaram novamente.


## Ajuste de interface 13.66.2

No formulário de registro, o rótulo obrigatório DOC foi renomeado para COO. Os dois controles visíveis duplicados de Série NFC-e foram removidos; uma única entrada oculta preserva a série obtida por QR/OCR para a checagem interna de duplicidade. O cache do Service Worker foi atualizado para garantir a troca dos arquivos após atualização. Sintaxe e 41 testes passaram.


## Ajuste de interface 13.66.2

O modal do registro de entrega foi ampliado para até 1120 px de largura e quase toda a altura útil da janela; em celular, mantém margens pequenas e rolagem interna. A versão e o cache offline foram atualizados. Sintaxe e 42 testes passaram.
