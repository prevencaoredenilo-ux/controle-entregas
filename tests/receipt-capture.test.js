import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFrameQuality, configureReceiptWorker, findReceiptTraceBoxes, getTesseractApi, normalizeNeighborhood, parseDeliveryReceiptText, parseCouponText } from '../receipt-capture.js';

test('lê os campos do relatório e converte o horário de Cuiabá para Brasília', () => {
  const result = parseDeliveryReceiptText([
    '23/11/26 07:13:47 PDV 002',
    'Cliente: exemplo',
    'Fone(s): (66) 3000-0000',
    'Logradouro: Av Getulio Vargas s/n',
    'Bairro: Centro',
    'COO: 35174 PDV: 002',
  ].join('\n'));
  assert.deepEqual(result, {
    pdv: '002', doc: '35174', clientName: 'exemplo', phone: '(66) 3000-0000',
    street: 'Av Getulio Vargas', houseNumber: 's/n', neighborhood: 'Centro',
    operationDate: '2026-11-23', entryTimeOnly: '08:13',
  });
});

test('lê o número da NFC-e como cupom preservando zeros à esquerda', () => {
  assert.deepEqual(parseCouponText('NFC-e n. 000015693 Serie 302'), { coupon: '000015693' });
});

test('lê COO como DOC junto com o número NFC-e quando os dois estão no cupom', () => {
  assert.deepEqual(parseCouponText('NFC-e n. 000015693 Série 302 COO: 35174'), { coupon: '000015693', doc: '35174' });
});

test('localiza visualmente as linhas da NFC-e e do COO no cupom', () => {
  const boxes = findReceiptTraceBoxes('coupon', [
    { text: 'NFC-e n. 000015693', bbox: { x0: 10, y0: 20, x1: 230, y1: 48 } },
    { text: 'COO: 35174', bbox: { x0: 15, y0: 70, x1: 180, y1: 96 } },
  ], { coupon: '000015693', doc: '35174' });
  assert.deepEqual(boxes.map(({ key }) => key), ['coupon', 'doc']);
  assert.deepEqual(boxes[1], { key: 'doc', label: 'COO → DOC', color: '#9333ea', x0: 15, y0: 70, x1: 180, y1: 96 });
});

test('localiza PDV, COO e cliente no relatório de entrega', () => {
  const boxes = findReceiptTraceBoxes('delivery', [
    { text: 'PDV: 002 COO: 35174', bbox: { x0: 8, y0: 12, x1: 240, y1: 42 } },
    { text: 'Cliente: Maria Silva', bbox: { x0: 8, y0: 50, x1: 210, y1: 80 } },
  ], { pdv: '002', doc: '35174', clientName: 'Maria Silva' });
  assert.deepEqual(boxes.map(({ key }) => key), ['pdv', 'doc', 'clientName']);
});

test('usa createWorker quando o bundle Tesseract publica a API em default', () => {
  const createWorker = () => {};
  assert.equal(getTesseractApi({ default: { createWorker } }).createWorker, createWorker);
  assert.equal(getTesseractApi({ createWorker }).createWorker, createWorker);
});

test('lê DOC quando o OCR confunde COO com C0O', () => {
  assert.equal(parseDeliveryReceiptText('C0O: 35174').doc, '35174');
});

test('configura o Tesseract para ler o comprovante como um bloco de texto', async () => {
  const calls = [];
  const worker = { async setParameters(parameters) { calls.push(parameters); } };
  assert.equal(await configureReceiptWorker(worker), worker);
  assert.deepEqual(calls, [{ tessedit_pageseg_mode: '6' }]);
});

test('corrige artefatos vistos no OCR da foto sem inventar telefone', () => {
  const result = parseDeliveryReceiptText([
    'NOVA XAVANTINA-MT, FONE (66)34015516',
    '23/11/26 07:13:47 PDV 002 DOC 35180',
    'Cliente: alzira —',
    'Fone(s) e!',
    'Logradouro: av getulio vargas sn — k',
    'Bairro: barro vermelho —',
    'CO0: 35174 PDV: 002',
  ].join('\n'));
  assert.equal(result.doc, '35174');
  assert.equal(result.clientName, 'alzira');
  assert.equal(result.phone, undefined);
  assert.equal(result.street, 'av getulio vargas');
  assert.equal(result.houseNumber, 's/n');
  assert.equal(normalizeNeighborhood(result.neighborhood), normalizeNeighborhood('Vermelho'));
  assert.equal(result.operationDate, '2026-11-23');
  assert.equal(result.entryTimeOnly, '08:13');
});

test('prioriza o COO do comprovante e normaliza “Bairro Vermelho” como “Vermelho”', () => {
  const result = parseDeliveryReceiptText(['23/11/26 07:13:47 PDV 002 DOC 35180', 'Bairro: bairro vermelho', 'COO: 35174 PDV: 002'].join('\n'));
  assert.equal(result.doc, '35174');
  assert.equal(normalizeNeighborhood(result.neighborhood), normalizeNeighborhood('Vermelho'));
});

test('moldura fica vermelha para imagem escura e verde para texto claro, contrastado e nítido', () => {
  const width = 160; const height = 90;
  const dark = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < dark.length; i += 4) { dark[i] = 20; dark[i + 1] = 20; dark[i + 2] = 20; dark[i + 3] = 255; }
  assert.equal(assessFrameQuality({ data: dark, width, height }).readable, false);

  const blank = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < blank.length; i += 4) { blank[i] = 225; blank[i + 1] = 225; blank[i + 2] = 225; blank[i + 3] = 255; }
  assert.equal(assessFrameQuality({ data: blank, width, height }).readable, false);

  const sharpText = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < sharpText.length; i += 4) { sharpText[i] = 225; sharpText[i + 1] = 225; sharpText[i + 2] = 225; sharpText[i + 3] = 255; }
  for (let y = 14; y < 75; y += 6) {
    for (let x = 48; x < 112; x += 1) {
      const offset = (y * width + x) * 4;
      sharpText[offset] = 25; sharpText[offset + 1] = 25; sharpText[offset + 2] = 25;
    }
  }
  assert.equal(assessFrameQuality({ data: sharpText, width, height }).readable, true);
});

test('não confunde o próximo rótulo com telefone quando Fone(s) está vazio', () => {
  const result = parseDeliveryReceiptText('Fone(s):\nLogradouro: Av Central 10\nBairro: Centro');
  assert.equal(result.phone, undefined);
  assert.equal(result.street, 'Av Central');
  assert.equal(result.houseNumber, '10');
});

test('não sugere dados quando os rótulos esperados não aparecem', () => {
  assert.deepEqual(parseDeliveryReceiptText('texto sem campos reconhecíveis'), {});
  assert.deepEqual(parseCouponText('documento sem NFC-e'), {});
});
