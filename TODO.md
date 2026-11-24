# TODO — melhorias da captura de comprovantes

## Concluído nesta rodada (13.66.0)
- [x] Corrigir aplicação e origem dos campos, proteção de edição real, substituição de valores padrão/OCR, data e hora, preview, contagem, alertas, parsing cliente/telefone, bairro único aproximado, ambiguidade de horário, `toBlob(null)` e bloqueio de leitura concorrente.
- [x] Normalizar cupom somente na comparação de duplicidade; considerar série e número quando informada; mostrar entrega existente e preservar valor confirmado.
- [x] OCR Tesseract.js local/offline, assets e checksums/licenças; singleton com encerramento ocioso e progresso.
- [x] Pré-processar imagem com EXIF, redução, escala de cinza/contraste, modos PSM; controles separados câmera/galeria e encerramento da webcam após foto.
- [x] Ler QR NFC-e com BarcodeDetector/jsQR local; validar chave/DV e obter série, número/mês; OCR de chave e parser rotulado; exigir conferência antes de salvar.
- [x] Testes node:test, jsdom, duplicidade e parser sem fotos reais.
- [x] Alinhar versão, CSP e cache seguro; não migrar IndexedDB.

## Verificação manual pendente
- [ ] Testar câmera/foco e permissões em aparelho/navegador reais; testar foto com EXIF de celular.
- [ ] Instalar/abrir online, completar o cache e repetir OCR/QR com aparelho offline.
- [ ] Confirmar com o responsável a regra de conversão do fuso Cuiabá → Brasília.

- [x] Ajuste de desempenho: limitar chamadas OCR ao tempo total máximo de 25 s e pular leituras extras quando a primeira for suficiente.
