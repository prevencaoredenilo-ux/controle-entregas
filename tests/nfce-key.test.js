import test from 'node:test';
import assert from 'node:assert/strict';
import { couponFromQrText, extractAccessKey, parseAccessKey, validateAccessKey } from '../nfce-key.js';

function makeAccessKey() {
  const base = ['35', '2401', '12345678000195', '65', '001', '000001234', '1', '12345678'].join('');
  assert.equal(base.length, 43);
  let sum = 0;
  let weight = 2;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += Number(base[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const digit = remainder < 2 ? 0 : 11 - remainder;
  return `${base}${digit}`;
}

test('valida chave de acesso de 44 dígitos e rejeita dígito verificador incorreto', () => {
  const key = makeAccessKey();
  assert.equal(key.length, 44);
  assert.equal(validateAccessKey(key), true);
  assert.equal(validateAccessKey(`${key.slice(0, 43)}${(Number(key[43]) + 1) % 10}`), false);
  assert.equal(validateAccessKey('123'), false);
});

test('extrai chave direta e parâmetro p= da URL do QR', () => {
  const key = makeAccessKey();
  assert.equal(extractAccessKey(`chave: ${key}`), key);
  assert.equal(extractAccessKey(`https://nfce.exemplo/consulta?p=${key}%7C2%7C1&x=1`), key);
  assert.equal(extractAccessKey('sem chave válida'), null);
});

test('interpreta série, número NFC-e com zeros, mês, CNPJ e modelo da chave validada', () => {
  const parsed = parseAccessKey(makeAccessKey());
  assert.deepEqual(parsed, {
    series: '001', number: '000001234', issueMonth: '2024-01', cnpj: '12345678000195', model: '65',
  });
  assert.equal(couponFromQrText(`https://nfce.exemplo/?p=${makeAccessKey()}|2|1`)?.coupon, '000001234');
  assert.equal(parseAccessKey('000'), null);
});
