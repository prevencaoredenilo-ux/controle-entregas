import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBackupData, MAX_DELIVERY_TRIPS, normalizeTripCount, buildDeliveryTrips } from '../db.js';
import { couponsMatch, normalizeCouponNumber } from '../coupon-utils.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const localPath = (value) => value.split(/[?#]/, 1)[0].replace(/^\.\//, '');
const isExternal = (value) => /^(?:[a-z][a-z\d+.-]*:|\/\/|#|data:)/i.test(value);

function localImports(source) {
  const matches = [];
  const patterns = [
    /\bimport\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) matches.push(match[1]);
  }
  return matches.filter((value) => value.startsWith('.'));
}

test('todos os imports locais do JavaScript apontam para arquivos existentes', () => {
  const files = fs.readdirSync(root).filter((file) => file.endsWith('.js'));
  const missing = [];
  for (const file of files) {
    for (const imported of localImports(read(file))) {
      const target = localPath(imported);
      if (!exists(target)) missing.push(`${file} -> ${imported}`);
    }
  }
  assert.deepEqual(missing, [], `imports locais inexistentes: ${missing.join(', ')}`);
});

test('referências locais do index.html existem', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map((match) => match[1]).filter((value) => !isExternal(value));
  const missing = refs.filter((value) => value && !exists(localPath(value)));
  assert.deepEqual(missing, [], `referências locais inexistentes: ${missing.join(', ')}`);
});

test('ícones declarados pelo manifesto existem', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifesto sem ícones');
  const missing = manifest.icons.map((icon) => icon.src).filter((src) => !exists(localPath(src)));
  assert.deepEqual(missing, [], `ícones inexistentes: ${missing.join(', ')}`);
});

test('arquivos ASSETS do service worker existem', () => {
  const source = read('sw.js');
  const block = source.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(block, 'lista ASSETS não encontrada no service worker');
  const assets = [...block[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  assert.ok(assets.length > 0, 'lista ASSETS vazia');
  const missing = assets.map(localPath).filter((asset) => !exists(asset));
  assert.deepEqual(missing, [], `assets inexistentes: ${missing.join(', ')}`);
});

test('validador de backup rejeita coleções ausentes, registros sem ID e duplicidades', () => {
  const base = { version: 4, schema: 'orbita-v2' };
  assert.throws(() => validateBackupData(base), /coleções de dados obrigatórias/);
  const collections = ['deliveries','vehicles','drivers','collaborators','neighborhoods','costCategories','returnReasons','cycles','odometerLogs','costs','dayClosures'];
  const valid = Object.fromEntries(collections.map((key) => [key, []]));
  valid.deliveries = [{ id: 'delivery_1' }];
  assert.deepEqual(validateBackupData({ ...base, ...valid }), collections);
  assert.throws(() => validateBackupData({ ...base, ...valid, deliveries: [{},] }), /ID ausente/);
  assert.throws(() => validateBackupData({ ...base, ...valid, deliveries: [{ id: 'same' }, { id: 'same' }] }), /repetido/);
});

test('Entrega Grande limita viagens e preserva viagens já existentes', () => {
  assert.equal(normalizeTripCount('3', 'grande'), 3);
  assert.equal(normalizeTripCount('3', 'normal'), 0);
  assert.throws(() => normalizeTripCount('0', 'grande'), /pelo menos uma/);
  assert.throws(() => normalizeTripCount(String(MAX_DELIVERY_TRIPS + 1), 'grande'), /limite seguro/);
  const prior = [{ tripIndex: 1, status: 'concluida' }, { tripIndex: 2, status: 'pendente' }];
  const next = buildDeliveryTrips(prior, 3);
  assert.equal(next[0].status, 'concluida');
  assert.equal(next[1].status, 'pendente');
  assert.equal(next[2].tripIndex, 3);
});

test('normaliza zeros à esquerda apenas para comparar duplicidade de cupom', () => {
  assert.equal(normalizeCouponNumber('000.015.693'), '15693');
  assert.equal(couponsMatch({ coupon: '000015693' }, { coupon: '15693' }), true);
  assert.equal(couponsMatch({ coupon: '15693', couponSeries: '002' }, { coupon: '00015693', couponSeries: '2' }), true);
  assert.equal(couponsMatch({ coupon: '15693', couponSeries: '2' }, { coupon: '15693', couponSeries: '3' }), false);
  assert.equal(couponsMatch({ coupon: '15693', couponSeries: '2' }, { coupon: '15693' }), false);
});
