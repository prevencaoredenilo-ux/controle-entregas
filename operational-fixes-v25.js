/* ================================================================
   NILO ENTREGAS • V25
   Correções operacionais consolidadas
   - retorno libera nova tentativa sem apagar histórico
   - entrega grande com múltiplas viagens / carga parcial
   - marcadores visíveis nos gráficos, inclusive em período de 1 dia
   ================================================================ */
(() => {
  'use strict';

  const DB_NAME = 'controle_entregas_nx';
  const DB_VERSION = 1;
  const STORE_NAME = 'app_state';
  const STATE_KEY = 'main';
  const FLAG = 'nilo_v25_continuation_created';
  let db = null;
  let returnProcessing = false;

  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];

  function uid(prefix = 'id') {
    if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }
  function nowISO() { return new Date().toISOString(); }

  function openDB() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  async function readState() {
    await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function writeState(value) {
    await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function buildContinuation(source, partial = false) {
    const at = nowISO();
    const nextAttempt = Number(source.attemptNo || 1) + 1;
    const child = {
      ...source,
      id: uid('del'),
      rootId: source.rootId || source.id,
      parentId: source.id,
      attemptNo: nextAttempt,
      purchaseTime: '',
      driverId: '',
      vehicleId: '',
      cycleId: '',
      departureTime: '',
      finalizationTime: '',
      returnTime: '',
      status: 'Na loja',
      scheduledDate: '',
      scheduledTime: '',
      scheduleNotes: '',
      scheduleKind: '',
      reasonId: '',
      reasonText: '',
      nextAction: partial ? 'Realizar próxima viagem da mesma entrega' : 'Realizar nova tentativa de entrega',
      returnedUndelivered: false,
      returnReasonId: '',
      returnReasonText: '',
      withdrawalDate: '',
      withdrawalTime: '',
      createdAt: at,
      updatedAt: at,
      multiTrip: partial || Boolean(source.multiTrip),
      tripNo: partial ? Number(source.tripNo || source.attemptNo || 1) + 1 : Number(source.tripNo || 1),
      tripType: partial ? 'Viagem adicional planejada' : 'Nova tentativa após retorno',
      continuationReason: partial ? 'partial_load' : 'returned_undelivered',
      notes: partial
        ? `Viagem adicional criada automaticamente. A viagem anterior entregou parte da carga e retornou à loja para buscar o restante.${source.notes ? `\n${source.notes}` : ''}`
        : `Nova tentativa criada automaticamente após retorno sem conclusão.${source.notes ? `\n${source.notes}` : ''}`,
      history: [{
        id: uid('evt'),
        type: partial ? 'continued_after_partial_load' : 'continued_after_return',
        fromId: source.id,
        fromAttempt: Number(source.attemptNo || 1),
        at
      }]
    };
    return child;
  }

  async function applyContinuations({ afterMs = 0, partialIds = new Set(), selectedIds = new Set() } = {}) {
    if (returnProcessing) return false;
    returnProcessing = true;
    try {
      const s = await readState();
      if (!s || !Array.isArray(s.deliveries)) return false;
      const deliveries = s.deliveries;
      const threshold = afterMs ? afterMs - 3500 : 0;
      let changed = false;
      let created = 0;
      let partialCount = 0;

      for (const source of deliveries.slice()) {
        const updated = Date.parse(source.updatedAt || 0) || 0;
        const selected = selectedIds.size ? selectedIds.has(source.id) : true;
        const recent = !threshold || updated >= threshold;
        const isPartial = partialIds.has(source.id);
        const isNormalReturn = source.status === 'Devolvida' && source.returnedUndelivered === true;
        const eligible = selected && recent && (isPartial || isNormalReturn);
        if (!eligible) continue;
        if (source.scheduledDate || source.status === 'Reagendada' || source.status === 'Programada') continue;

        const alreadyHasChild = deliveries.some(d => d.parentId === source.id);

        if (isPartial) {
          source.status = 'Parcial';
          source.returnedUndelivered = false;
          source.reasonId = '';
          source.reasonText = '';
          source.returnReasonId = '';
          source.returnReasonText = '';
          source.multiTrip = true;
          source.tripNo = Number(source.tripNo || source.attemptNo || 1);
          source.tripType = 'Carga parcial entregue';
          source.nextAction = 'Voltar à loja, buscar o restante e realizar nova viagem';
          source.notes = `${source.notes || ''}${source.notes ? '\n' : ''}Entrega grande: carga parcial entregue; retorno à loja planejado para buscar o restante.`;
          source.history = Array.isArray(source.history) ? source.history : [];
          source.history.push({
            id: uid('evt'),
            type: 'partial_delivery_returned_for_remaining_load',
            at: nowISO(),
            cycleId: source.cycleId || '',
            time: source.returnTime || ''
          });
          source.updatedAt = nowISO();
          changed = true;
          partialCount++;
        } else {
          source.nextAction = 'Disponível para nova tentativa de entrega';
          source.updatedAt = nowISO();
          source.history = Array.isArray(source.history) ? source.history : [];
          if (!source.history.some(h => h?.type === 'v25_retry_released')) {
            source.history.push({ id: uid('evt'), type: 'v25_retry_released', at: nowISO(), cycleId: source.cycleId || '' });
          }
          changed = true;
        }

        if (!alreadyHasChild) {
          deliveries.push(buildContinuation(source, isPartial));
          created++;
          changed = true;
        }
      }

      if (!changed) return false;
      s.meta = s.meta || {};
      s.meta.updatedAt = nowISO();
      s.meta.v25OperationalFix = true;
      await writeState(s);
      try {
        sessionStorage.setItem(FLAG, JSON.stringify({ created, partialCount, at: Date.now() }));
      } catch {}
      return true;
    } finally {
      returnProcessing = false;
    }
  }

  function injectMultiTripChoice() {
    const title = q('#modalTitle')?.textContent || '';
    const panel = q('#returnedDeliveriesPanel');
    if (!panel || !/RETORNO|CICLO/i.test(title)) return;

    qa('.cycle-return-delivery', panel).forEach(card => {
      if (card.querySelector('.v25-multitrip-choice')) return;
      const mainToggle = card.querySelector('[data-return-toggle]');
      const id = mainToggle?.dataset?.returnToggle || mainToggle?.value;
      if (!id) return;
      const box = document.createElement('label');
      box.className = 'v25-multitrip-choice';
      box.innerHTML = `<input type="checkbox" data-v25-partial="${id}" />
        <span><strong>Entrega grande / carga parcial</strong><small>Marque quando parte da compra foi entregue e será preciso voltar à loja para buscar o restante. Isso não será contado como ocorrência de retorno.</small></span>`;
      const fields = card.querySelector('.return-resolution-fields');
      if (fields) card.insertBefore(box, fields);
      else card.appendChild(box);

      const partialToggle = box.querySelector('input');
      partialToggle.addEventListener('change', () => {
        if (partialToggle.checked && mainToggle && !mainToggle.checked) {
          mainToggle.checked = true;
          mainToggle.dispatchEvent(new Event('change', { bubbles: true }));
        }
        card.classList.toggle('v25-partial-selected', partialToggle.checked);
      });
    });

    const note = panel.querySelector('.v25-multitrip-note');
    if (!note) {
      const info = document.createElement('div');
      info.className = 'v25-multitrip-note';
      info.innerHTML = '<strong>Como usar:</strong> retorno sem entregar = nova tentativa; carga parcial = nova viagem da mesma entrega, sem registrar ocorrência.';
      panel.prepend(info);
    }
  }

  function addStatusOptionForPartial() {
    const title = q('#modalTitle')?.textContent || '';
    if (!/Editar entrega/i.test(title)) return;
    qa('select').forEach(select => {
      if (select.name !== 'status' || [...select.options].some(o => o.value === 'Parcial')) return;
      const opt = document.createElement('option');
      opt.value = 'Parcial';
      opt.textContent = 'Parcial • carga incompleta';
      select.appendChild(opt);
    });
  }

  function enhanceCharts() {
    qa('svg[aria-label="Desempenho diário"]').forEach(svg => {
      if (svg.dataset.v25Markers === '1') return;
      const lines = qa('polyline.v16-line', svg);
      if (!lines.length) return;
      const series = [
        { cls: 'green', label: 'Entregues', r: 7.5 },
        { cls: 'orange', label: 'Retornadas', r: 5.5 },
        { cls: 'purple', label: 'Tentativas', r: 3.6 }
      ];
      let maxPoints = 0;
      lines.forEach(line => {
        const pts = String(line.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean);
        maxPoints = Math.max(maxPoints, pts.length);
      });

      series.forEach(meta => {
        const line = lines.find(x => x.classList.contains(meta.cls));
        if (!line) return;
        const pts = String(line.getAttribute('points') || '').trim().split(/\s+/).filter(Boolean);
        pts.forEach((p, idx) => {
          const [cx, cy] = p.split(',').map(Number);
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('cx', String(cx));
          circle.setAttribute('cy', String(cy));
          circle.setAttribute('r', String(maxPoints === 1 ? meta.r + 1 : meta.r));
          circle.setAttribute('class', `v25-chart-point ${meta.cls}`);
          circle.setAttribute('data-series', meta.label);
          const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
          title.textContent = meta.label;
          circle.appendChild(title);
          svg.appendChild(circle);
        });
      });

      if (maxPoints === 1) {
        const wrap = svg.closest('.v16-chart-wrap');
        if (wrap && !wrap.querySelector('.v25-single-day-note')) {
          const note = document.createElement('div');
          note.className = 'v25-single-day-note';
          note.textContent = 'Período de 1 dia: os círculos mostram os valores mesmo sem existir uma segunda data para formar a linha.';
          svg.insertAdjacentElement('afterend', note);
        }
      }
      svg.dataset.v25Markers = '1';
    });
  }

  function showContinuationNotice() {
    let payload = null;
    try {
      const raw = sessionStorage.getItem(FLAG);
      if (!raw) return;
      payload = JSON.parse(raw);
      sessionStorage.removeItem(FLAG);
    } catch { return; }
    if (!payload || !payload.created) return;
    const banner = document.createElement('div');
    banner.className = 'v25-continuation-banner';
    banner.innerHTML = `<strong>✓ Nova saída liberada</strong><span>${payload.partialCount ? `${payload.partialCount} entrega(s) com carga parcial e ` : ''}${payload.created} continuação(ões) pronta(s) para entrar em outro ciclo.</span>`;
    document.body.appendChild(banner);
    setTimeout(() => banner.classList.add('show'), 60);
    setTimeout(() => { banner.classList.remove('show'); setTimeout(() => banner.remove(), 300); }, 5200);
  }

  async function afterReturnSubmit(captured) {
    const start = Date.now();
    for (let i = 0; i < 16; i++) {
      await new Promise(r => setTimeout(r, 250));
      try {
        const changed = await applyContinuations({
          afterMs: start,
          partialIds: captured.partialIds,
          selectedIds: captured.selectedIds
        });
        if (changed) {
          // O app principal guarda o estado em memória; recarrega uma única vez
          // para que a nova tentativa apareça imediatamente em "disponíveis".
          setTimeout(() => location.reload(), 450);
          return;
        }
      } catch (err) {
        console.warn('[NILO V25] continuação pendente', err);
      }
    }
  }

  document.addEventListener('submit', event => {
    const title = q('#modalTitle')?.textContent || '';
    if (!/RETORNO À LOJA|DEVOLUÇÃO/i.test(title)) return;
    const selectedIds = new Set(qa('input[name="returnedDeliveryIds"]:checked').map(x => x.value));
    const partialIds = new Set(qa('[data-v25-partial]:checked').map(x => x.dataset.v25Partial));
    // Na devolução rápida não existe lista de IDs; o filtro por updatedAt identifica apenas o registro recém-salvo.
    afterReturnSubmit({ selectedIds, partialIds });
  }, true);

  const observer = new MutationObserver(() => {
    injectMultiTripChoice();
    addStatusOptionForPartial();
    enhanceCharts();
  });

  function init() {
    injectMultiTripChoice();
    addStatusOptionForPartial();
    enhanceCharts();
    showContinuationNotice();
    const modalBody = q('#modalBody');
    const view = q('#view');
    if (modalBody) observer.observe(modalBody, { childList: true, subtree: true });
    if (view) observer.observe(view, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
