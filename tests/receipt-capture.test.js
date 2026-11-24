import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeReceiptFrame, assessFrameQuality, buildCameraTrackConstraints, configureReceiptWorker, findReceiptPaperBounds, findReceiptTraceBoxes, getCameraFocusOptions, getCameraResolutionPreference, getReceiptProcessingScale, getTesseractApi, mergeOcrCandidates, mergeOcrLinesWithVerticalOffset, normalizeNeighborhood, parseDeliveryReceiptText, parseCouponText } from '../receipt-capture.js';

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
    pdv: '002', doc: '35174', clientName: 'Exemplo', phone: '(66) 3000-0000',
    street: 'Av. Getulio Vargas', houseNumber: 's/n', neighborhood: 'Centro',
    operationDate: '2026-11-23', entryTimeOnly: '08:13',
  });
});

test('lê o número da NFC-e como cupom preservando zeros à esquerda', () => {
  assert.deepEqual(parseCouponText('NFC-e n. 000015693 Serie 302'), { coupon: '000015693' });
});

test('lê COO como DOC junto com o número NFC-e quando os dois estão no cupom', () => {
  assert.deepEqual(parseCouponText('NFC-e n. 000015693 Série 302 COO: 35174'), { coupon: '000015693', doc: '35174' });
});

test('consenso OCR usa leituras repetidas e mantém divergência para confirmação em vez de adivinhar', () => {
  const base = '23/11/26 07:13:47 PDV 002\nFone(s): 66992354592\nLogradouro: Av Amazonas 374\nBairro: Centro\nCOO: 35174';
  const decision = mergeOcrCandidates('delivery', [
    { text: `Cliente: Maria Silva\n${base}`, confidence: 70 },
    { text: `Cliente: Maria Silva\n${base}`, confidence: 66 },
    { text: `Cliente: Marina Silva\n${base.replace('35174', '35179')}`, confidence: 69 },
  ]);
  assert.equal(decision.fields.clientName, 'Maria Silva');
  assert.equal(decision.fields.doc, '35174');
  assert.equal(decision.uncertain.length, 0);
  assert.equal(decision.attempts, 3);

  const conflict = mergeOcrCandidates('delivery', [
    { text: `Cliente: Maria Silva\n${base}`, confidence: 70 },
    { text: `Cliente: Marina Silva\n${base}`, confidence: 70 },
  ]);
  assert.equal('clientName' in conflict.fields, false);
  assert.deepEqual(conflict.uncertain.find(({ field }) => field === 'clientName')?.candidates, ['Maria Silva', 'Marina Silva']);
});

test('localiza visualmente as linhas da NFC-e e do COO no cupom', () => {
  const boxes = findReceiptTraceBoxes('coupon', [
    { text: 'NFC-e n. 000015693', bbox: { x0: 10, y0: 20, x1: 230, y1: 48 } },
    { text: 'COO: 35174', bbox: { x0: 15, y0: 70, x1: 180, y1: 96 } },
  ], { coupon: '000015693', doc: '35174' });
  assert.deepEqual(boxes.map(({ key }) => key), ['coupon', 'doc']);
  assert.deepEqual(boxes[1], { key: 'doc', label: 'COO → DOC', color: '#9333ea', x0: 15, y0: 70, x1: 180, y1: 96 });
});

test('não marca como correto um rótulo cujo valor diverge do consenso OCR', () => {
  assert.deepEqual(findReceiptTraceBoxes('coupon', [
    { text: 'COO: 35179', bbox: { x0: 15, y0: 70, x1: 180, y1: 96 } },
  ], { doc: '35174' }), []);
});

test('localiza PDV, COO e cliente no relatório de entrega', () => {
  const boxes = findReceiptTraceBoxes('delivery', [
    { text: 'PDV: 002 COO: 35174', bbox: { x0: 8, y0: 12, x1: 240, y1: 42 } },
    { text: 'Cliente: Maria Silva', bbox: { x0: 8, y0: 50, x1: 210, y1: 80 } },
  ], { pdv: '002', doc: '35174', clientName: 'Maria Silva' });
  assert.deepEqual(boxes.map(({ key }) => key), ['pdv', 'doc', 'clientName']);
});

test('combina o COO encontrado no recorte inferior preservando a posição na imagem inteira', () => {
  const merged = mergeOcrLinesWithVerticalOffset(
    { text: 'PDV 002 DOC 35180', lines: [{ text: 'DOC 35180', bbox: { x0: 5, y0: 10, x1: 100, y1: 30 } }] },
    { text: 'CO0: 35174', lines: [{ text: 'CO0: 35174', bbox: { x0: 8, y0: 20, x1: 120, y1: 45 } }] },
    600,
  );
  assert.deepEqual(merged.lines[1].bbox, { x0: 8, y0: 620, x1: 120, y1: 645 });
  assert.equal(parseDeliveryReceiptText(`${merged.text}\nCO0: 35174`).doc, '35174');
});

test('usa createWorker quando o bundle Tesseract publica a API em default', () => {
  const createWorker = () => {};
  assert.equal(getTesseractApi({ default: { createWorker } }).createWorker, createWorker);
  assert.equal(getTesseractApi({ createWorker }).createWorker, createWorker);
});

test('lê DOC quando o OCR confunde COO com C0O', () => {
  assert.equal(parseDeliveryReceiptText('C0O: 35174').doc, '35174');
  assert.equal(parseDeliveryReceiptText('COD: 35174 POU: 002').doc, '35174');
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
  assert.equal(result.clientName, 'Alzira');
  assert.equal(result.phone, undefined);
  assert.equal(result.street, 'Av. Getulio Vargas');
  assert.equal(result.houseNumber, 's/n');
  assert.equal(normalizeNeighborhood(result.neighborhood), normalizeNeighborhood('Vermelho'));
  assert.equal(normalizeNeighborhood('Arro Vermelho'), normalizeNeighborhood('Vermelho'));
  assert.equal(result.operationDate, '2026-11-23');
  assert.equal(result.entryTimeOnly, '08:13');
});

test('prioriza o COO do comprovante e normaliza “Bairro Vermelho” como “Vermelho”', () => {
  const result = parseDeliveryReceiptText(['23/11/26 07:13:47 PDV 002 DOC 35180', 'Bairro: bairro vermelho', 'COO: 35174 PDV: 002'].join('\n'));
  assert.equal(result.doc, '35174');
  assert.equal(normalizeNeighborhood(result.neighborhood), normalizeNeighborhood('Vermelho'));
});

test('recupera o COO pelo contexto do operador quando a sigla não foi reconhecida', () => {
  assert.equal(parseDeliveryReceiptText('D0: 35174 POU: 002 Operador(a): Regina Chaves').doc, '35174');
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

test('analisa cupom vertical no guia e orienta quando falta foco ou posição', () => {
  const width = 320; const height = 180;
  const makeFrame = (left = 108, top = 9, paperWidth = 104, paperHeight = 162, addText = true) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = 35; data[i + 1] = 35; data[i + 2] = 35; data[i + 3] = 255; }
    for (let y = top; y < Math.min(height, top + paperHeight); y += 1) {
      for (let x = left; x < Math.min(width, left + paperWidth); x += 1) {
        const offset = (y * width + x) * 4;
        const ink = addText && y % 11 < 2 && x > left + 10 && x < left + paperWidth - 10;
        const value = ink ? 24 : 244;
        data[offset] = value; data[offset + 1] = value; data[offset + 2] = value;
      }
    }
    return { data, width, height };
  };
  assert.equal(analyzeReceiptFrame(makeFrame()).state, 'good');
  assert.match(analyzeReceiptFrame(makeFrame(24)).message, /Mova para a direita/);
  assert.match(analyzeReceiptFrame(makeFrame(108, 9, 50, 70)).message, /Aproxime o cupom/);
  assert.match(analyzeReceiptFrame(makeFrame(108, 9, 104, 162, false)).message, /Fora de foco/);
});

test('solicita até 1920×1080 sem exceder a resolução máxima anunciada pela câmera', () => {
  assert.deepEqual(getCameraResolutionPreference({ width: { max: 1280 }, height: { max: 720 } }), { width: 1280, height: 720 });
  assert.deepEqual(getCameraResolutionPreference({ width: { max: 3840 }, height: { max: 2160 } }), { width: 1920, height: 1080 });
  assert.deepEqual(getCameraResolutionPreference({}), { width: 1920, height: 1080 });
});

test('amplia cupons pequenos sem ultrapassar o orçamento de pixels que permite nitidez', () => {
  assert.equal(getReceiptProcessingScale(1000, 500), 2);
  const scale = getReceiptProcessingScale(4000, 4000);
  assert.ok(scale < 1);
  assert.ok(Math.round(4000 * scale) ** 2 <= 2_500_000);
  assert.equal(getReceiptProcessingScale(0, 0), 1);
});

test('oferece foco manual somente quando a câmera expõe modo e faixa ajustável', () => {
  assert.deepEqual(getCameraFocusOptions({ focusMode: ['continuous', 'manual'], focusDistance: { min: 0.1, max: 1, step: 0.05 } }), {
    autoMode: 'continuous', manualAvailable: true, min: 0.1, max: 1, step: 0.05,
  });
  assert.equal(getCameraFocusOptions({ focusMode: ['continuous'] }).manualAvailable, false);
  assert.equal(getCameraFocusOptions({ focusMode: ['manual'], focusDistance: { min: 0.5, max: 0.5 } }).manualAvailable, false);
  assert.equal(getCameraFocusOptions({}).autoMode, null);
});

test('envia foco como constraint exata para que a câmera não ignore o pedido em silêncio', () => {
  assert.deepEqual(buildCameraTrackConstraints({ width: 1280, height: 720 }, { focusMode: 'manual', focusDistance: 0.55 }), {
    width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
    focusMode: { exact: 'manual' }, focusDistance: { exact: 0.55 },
  });
  assert.deepEqual(buildCameraTrackConstraints({ width: 1920, height: 1080 }, { focusMode: 'continuous' }), {
    width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }, focusMode: { exact: 'continuous' },
  });
  assert.equal('focusDistance' in buildCameraTrackConstraints({ width: 1920, height: 1080 }, { focusMode: 'manual' }), false);
  assert.equal('focusMode' in buildCameraTrackConstraints({ width: 1920, height: 1080 }, { focusMode: null }), false);
});

test('não confunde o próximo rótulo com telefone quando Fone(s) está vazio', () => {
  const result = parseDeliveryReceiptText('Fone(s):\nLogradouro: Av Central 10\nBairro: Centro');
  assert.equal(result.phone, undefined);
  assert.equal(result.street, 'Av. Central');
  assert.equal(result.houseNumber, '10');
});

test('não sugere dados quando os rótulos esperados não aparecem', () => {
  assert.deepEqual(parseDeliveryReceiptText('texto sem campos reconhecíveis'), {});
  assert.deepEqual(parseCouponText('documento sem NFC-e'), {});
});

test('detecta a folha contra o fundo e mantém margem ao recortá-la', () => {
  const width = 160; const height = 320;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 140; pixels[i + 1] = 100; pixels[i + 2] = 70; pixels[i + 3] = 255;
  }
  for (let y = 60; y < 260; y += 1) {
    for (let x = 20; x < 140; x += 1) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 230; pixels[offset + 1] = 228; pixels[offset + 2] = 220;
    }
  }
  const bounds = findReceiptPaperBounds(pixels, width, height);
  assert.ok(bounds);
  assert.ok(bounds.x < 20 && bounds.y < 60);
  assert.ok(bounds.x + bounds.width > 139 && bounds.y + bounds.height > 259);
  assert.equal(findReceiptPaperBounds(new Uint8ClampedArray(width * height * 4), width, height), null);
});

test('padroniza nomes e logradouro sem alterar os identificadores numéricos', () => {
  const result = parseDeliveryReceiptText('PDV: 002\nCliente: maria da silva\nLogradouro: avenida brasil 45\nBairro: centro\nCOO: 35174');
  assert.equal(result.clientName, 'Maria da Silva');
  assert.equal(result.street, 'Av. Brasil');
  assert.equal(result.houseNumber, '45');
  assert.equal(result.neighborhood, 'Centro');
  assert.equal(result.pdv, '002');
  assert.equal(result.doc, '35174');
  assert.equal(parseDeliveryReceiptText('Logradouro: Bv getulio vargas sn').street, 'Av. Getulio Vargas');
});
