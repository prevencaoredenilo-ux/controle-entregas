import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyReceiptFields, attachReceiptFieldTracking } from '../receipt-capture.js';

test('jsdom: OCR substitui default, protege edição real, aceita correção da segunda leitura e conta somente campos aplicados', () => {
  const dom = new JSDOM('<form id="delivery"><input name="clientName" value="Nome padrão"><input name="phone" value=""><input name="street" value=""></form>');
  const form = dom.window.document.querySelector('form');
  attachReceiptFieldTracking(form);
  const first = applyReceiptFields(form, { clientName: 'Maria Silva', phone: '66999990000' });
  assert.deepEqual(first.appliedFields, ['Cliente', 'Telefone']);
  assert.equal(form.elements.namedItem('clientName').value, 'Maria Silva');
  assert.equal(first.appliedFields.length, 2);

  const phone = form.elements.namedItem('phone');
  phone.value = '66123456789';
  attachReceiptFieldTracking(form).markUserEdit(phone); // representa o evento input confiável que o navegador origina

  const second = applyReceiptFields(form, { clientName: 'Maria S. Silva', phone: '66988887777', street: 'Av. Brasil' });
  assert.equal(form.elements.namedItem('clientName').value, 'Maria S. Silva');
  assert.equal(phone.value, '66123456789');
  assert.equal(form.elements.namedItem('street').value, 'Av. Brasil');
  assert.deepEqual(second.appliedFields, ['Cliente', 'Logradouro']);
  assert.equal(second.appliedFields.length, 2);
  assert.match(second.ignored[0], /Telefone protegido/);
  dom.window.close();
});
