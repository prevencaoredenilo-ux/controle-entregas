import test from 'node:test';
import assert from 'node:assert/strict';
import { getTesseractApi, normalizeNeighborhood, parseDeliveryReceiptText, parseCouponText } from '../receipt-capture.js';

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

test('usa createWorker quando o bundle Tesseract publica a API em default', () => {
  const createWorker = () => {};
  assert.equal(getTesseractApi({ default: { createWorker } }).createWorker, createWorker);
  assert.equal(getTesseractApi({ createWorker }).createWorker, createWorker);
});

test('lê DOC quando o OCR confunde COO com C0O', () => {
  assert.equal(parseDeliveryReceiptText('C0O: 35174').doc, '35174');
});

test('prioriza o COO do comprovante e normaliza “Bairro Vermelho” como “Vermelho”', () => {
  const result = parseDeliveryReceiptText(['23/11/26 07:13:47 PDV 002 DOC 35180', 'Bairro: bairro vermelho', 'COO: 35174 PDV: 002'].join('\n'));
  assert.equal(result.doc, '35174');
  assert.equal(normalizeNeighborhood(result.neighborhood), normalizeNeighborhood('Vermelho'));
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
