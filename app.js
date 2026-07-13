(() => {
  'use strict';

  const APP_VERSION = '6.0.0';
  const DB_NAME = 'controle_entregas_nx';
  const DB_VERSION = 1;
  const STORE_NAME = 'app_state';
  const STATE_KEY = 'main';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const statusOptions = ['Na loja','Em rota','Finalizada','Programada','Reagendada','Devolvida','Retirada na loja','Cancelada'];

  let state = null;
  let dbHandle = null;
  let currentView = 'dashboard';
  let configTab = 'vehicles';
  let deferredInstallPrompt = null;

  const pageMeta = {
    dashboard: ['Dashboard', 'Visão geral da operação, custos, faturamento e produtividade.'],
    today: ['Operação do dia', 'Entregas do dia, programadas, pendências e ciclos em andamento.'],
    deliveries: ['Entregas', 'Cadastro completo e histórico anual de todas as entregas.'],
    scheduled: ['Programadas e Reagendadas', 'Agenda automática pela data programada, sem perder o histórico da origem.'],
    pending: ['Central de Pendências', 'Tudo que exige ação antes de encerrar a operação.'],
    cycles: ['Ciclos de entrega', 'Cada saída da loja até o retorno ao mercado é exatamente um ciclo.'],
    odometer: ['Quilometragem da frota', 'KM inicial e final do dia por veículo, com médias por dia, semana, mês, entrega e ciclo.'],
    costs: ['Custos da frota', 'Combustível, manutenção e outros gastos registrados individualmente.'],
    neighborhoods: ['Análise por bairro', 'Entregas, faturamento, endereço errado, reagendamentos, devoluções e problemas por bairro.'],
    trace: ['Rastrear cupom', 'Histórico completo da compra até a conclusão, incluindo reagendamentos.'],
    reports: ['Relatórios e Exportação', 'Baixe dados por dia, semana, mês, ano ou período personalizado.'],
    settings: ['Cadastros e Configurações', 'Adicione, edite, desative e reative veículos, bairros e colaboradores.'],
    trash: ['Lixeira', 'Restaure registros apagados por engano ou exclua definitivamente.']
  };

  function uid(prefix = 'id') {
    if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  function nowISO() { return new Date().toISOString(); }
  function todayISO() {
    const d = new Date();
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }
  function localDateISO(date) {
    const d = new Date(date);
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }
  function attr(value) { return esc(value); }
  function money(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  }
  function number(value, digits = 0) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value || 0));
  }
  function dateBR(value) {
    if (!value) return '—';
    const v = String(value).slice(0, 10);
    const [y,m,d] = v.split('-');
    return y && m && d ? `${d}/${m}/${y}` : value;
  }
  function dateTimeBR(value) {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(new Date(value)); }
    catch { return value; }
  }
  function sum(values) { return values.reduce((acc, v) => acc + Number(v || 0), 0); }
  function avg(values) {
    const valid = values.filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)));
    return valid.length ? sum(valid) / valid.length : 0;
  }
  function unique(values) { return [...new Set(values)]; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function currentMode() { return state?.settings?.appMode === 'training' ? 'training' : 'production'; }
  function modeLabel() { return currentMode() === 'training' ? 'Treinamento' : 'Operação real'; }
  function recordInCurrentMode(item) { return (item?.mode || 'production') === currentMode(); }
  function scoped(list) { return (list || []).filter(recordInCurrentMode); }
  function cloneData(value) { return JSON.parse(JSON.stringify(value)); }

  function defaultState() {
    const now = nowISO();
    return {
      meta: { version: APP_VERSION, createdAt: now, updatedAt: now },
      settings: {
        workStart: '09:00', lunchStart: '13:00', lunchEnd: '14:00', workEnd: '20:00', delayMinutes: 120,
        companyName: 'Controle de Entregas', locationName: 'Nova Xavantina • MT', appMode: 'production'
      },
      vehicles: [
        { id: uid('veh'), name: 'Veículo 1', plate: '', type: 'Utilitário', active: true, createdAt: now },
        { id: uid('veh'), name: 'Veículo 2', plate: '', type: 'Moto', active: true, createdAt: now },
        { id: uid('veh'), name: 'Veículo 3', plate: '', type: 'Moto', active: true, createdAt: now }
      ],
      neighborhoods: [
        { id: uid('nei'), name: 'Centro', region: '', active: true, createdAt: now },
        { id: uid('nei'), name: 'Henry I', region: '', active: true, createdAt: now },
        { id: uid('nei'), name: 'Henry II', region: '', active: true, createdAt: now },
        { id: uid('nei'), name: 'Tonetto', region: '', active: true, createdAt: now }
      ],
      employees: [
        { id: uid('emp'), name: 'Entregador 1', role: 'Entregador', active: true, createdAt: now }
      ],
      costCategories: [
        { id: uid('cat'), name: 'Combustível', active: true },
        { id: uid('cat'), name: 'Manutenção preventiva', active: true },
        { id: uid('cat'), name: 'Manutenção corretiva', active: true },
        { id: uid('cat'), name: 'Pneus', active: true },
        { id: uid('cat'), name: 'Óleo e lubrificantes', active: true },
        { id: uid('cat'), name: 'Lavagem', active: true },
        { id: uid('cat'), name: 'Documentação', active: true },
        { id: uid('cat'), name: 'Outros', active: true }
      ],
      reasons: [
        { id: 'CLIENTE_AUSENTE', name: 'Cliente ausente', active: true },
        { id: 'ENDERECO_ERRADO', name: 'Endereço errado', active: true },
        { id: 'CLIENTE_RECUSOU', name: 'Cliente recusou', active: true },
        { id: 'CLIENTE_OUTRO_DIA', name: 'Cliente solicitou outro dia', active: true },
        { id: 'PRODUTO_INCORRETO', name: 'Produto incorreto', active: true },
        { id: 'PRODUTO_AVARIADO', name: 'Produto avariado', active: true },
        { id: 'SEM_TEMPO', name: 'Não foi possível concluir a rota', active: true },
        { id: 'VEICULO_PROBLEMA', name: 'Veículo apresentou problema', active: true },
        { id: 'OUTRO', name: 'Outros', active: true }
      ],
      deliveries: [],
      cycles: [],
      odometerLogs: [],
      costs: [],
      audit: [],
      trash: []
    };
  }

  function migrateState(data) {
    const base = defaultState();
    const merged = Object.assign(base, data || {});
    merged.meta = Object.assign(base.meta, data?.meta || {});
    merged.settings = Object.assign(base.settings, data?.settings || {});
    for (const key of ['vehicles','neighborhoods','employees','costCategories','reasons','deliveries','cycles','odometerLogs','costs','audit','trash']) {
      if (!Array.isArray(merged[key])) merged[key] = base[key];
    }
    merged.settings.appMode = merged.settings.appMode === 'training' ? 'training' : 'production';
    for (const key of ['deliveries','cycles','odometerLogs','costs']) {
      merged[key].forEach(item => { if (!item.mode) item.mode = 'production'; });
    }
    // Migração automática da V2: se existirem ciclos antigos com KM inicial/final,
    // cria um fechamento diário por veículo usando o menor KM inicial e o maior KM final do dia.
    const existingDailyKm = new Set(merged.odometerLogs.map(o => `${o.date}|${o.vehicleId}`));
    const legacyGroups = new Map();
    merged.cycles.forEach(c => {
      const start = Number(c.kmStart || 0), end = Number(c.kmEnd || 0);
      if (!c.date || !c.vehicleId || start <= 0 || end < start) return;
      const key = `${c.date}|${c.vehicleId}`;
      const prev = legacyGroups.get(key) || { date:c.date, vehicleId:c.vehicleId, starts:[], ends:[] };
      prev.starts.push(start); prev.ends.push(end); legacyGroups.set(key, prev);
    });
    legacyGroups.forEach((g,key) => {
      if (existingDailyKm.has(key)) return;
      merged.odometerLogs.push({
        id:uid('odo'), date:g.date, vehicleId:g.vehicleId,
        kmStart:Math.min(...g.starts), kmEnd:Math.max(...g.ends),
        notes:'Migrado automaticamente dos ciclos da versão anterior.',
        createdAt:nowISO(), updatedAt:nowISO(), migratedFromLegacyCycles:true
      });
    });
    return merged;
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => { dbHandle = request.result; resolve(dbHandle); };
      request.onerror = () => reject(request.error);
    });
  }

  function idbGet(key) {
    return new Promise((resolve, reject) => {
      const tx = dbHandle.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbSet(key, value) {
    return new Promise((resolve, reject) => {
      const tx = dbHandle.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function saveState(action = '') {
    state.meta.updatedAt = nowISO();
    if (action) state.audit.unshift({ id: uid('aud'), at: nowISO(), action });
    if (state.audit.length > 2000) state.audit = state.audit.slice(0, 2000);
    await idbSet(STATE_KEY, state);
    updateBadges();
  }

  async function initialize() {
    try {
      await openDB();
      const stored = await idbGet(STATE_KEY);
      state = migrateState(stored || defaultState());
      if (!stored) await saveState('Sistema inicializado');
      bindStaticEvents();
      initPWA();
      updateConnectionStatus();
      window.addEventListener('online', updateConnectionStatus);
      window.addEventListener('offline', updateConnectionStatus);
      refreshYearOptions();
      refreshWeekOptions();
      render();
      updateBadges();
      await sleep(250);
      $('#bootScreen').style.opacity = '0';
      setTimeout(() => $('#bootScreen').remove(), 260);
      $('#appShell').removeAttribute('aria-hidden');
    } catch (err) {
      console.error(err);
      $('#bootScreen').innerHTML = `<div class="boot-card"><div class="brand-mark large">!</div><h1>Não foi possível iniciar</h1><p>${esc(err.message || err)}</p></div>`;
    }
  }

  function initPWA() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(console.warn);
    }
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      $('#installBtn').hidden = false;
    });
    $('#installBtn').addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $('#installBtn').hidden = true;
    });
  }

  function updateConnectionStatus() {
    const online = navigator.onLine;
    $('#connectionDot').className = `connection-dot ${online ? 'online' : 'offline'}`;
    $('#connectionTitle').textContent = online ? `Online • ${modeLabel()}` : `Offline • ${modeLabel()}`;
    $('#connectionSubtitle').textContent = online ? 'Dados salvos neste dispositivo' : 'Continue trabalhando normalmente';
  }

  async function switchMode(mode) {
    if (!['production','training'].includes(mode)) return;
    state.settings.appMode = mode;
    await saveState(`Ambiente alterado para ${mode === 'training' ? 'treinamento' : 'operação real'}`);
    updateConnectionStatus(); updateModeUI(); render();
    toast(mode === 'training' ? 'Modo treinamento ativado. Nada daqui afeta a operação real.' : 'Operação real ativada.', mode === 'training' ? 'warning' : 'success');
  }

  function updateModeUI() {
    const mode = currentMode();
    document.body.classList.toggle('training-mode', mode === 'training');
    $$('.mode-choice').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    const top = $('#topModeBadge');
    if (top) { top.className = `top-mode-badge ${mode}`; top.textContent = mode === 'training' ? '🧪 Treinamento' : '● Operação real'; }
    const desktop = $('#desktopModeChip'); if (desktop) desktop.textContent = mode === 'training' ? '🧪 Ambiente de treinamento' : '● Ambiente real';
    const hint = $('#modeHint'); if (hint) hint.textContent = mode === 'training' ? 'Dados isolados para testes e capacitação.' : 'Dados oficiais da operação.';
  }

  function injectModeBanner() {
    if (currentMode() !== 'training') return;
    const view = $('#view'); if (!view || view.querySelector('.training-banner')) return;
    view.insertAdjacentHTML('afterbegin', `<section class="training-banner"><div class="training-banner-icon">🧪</div><div><strong>Modo treinamento ativo</strong><p>Teste entregas, ciclos, KM, custos, programações e exclusões sem afetar os dados reais.</p></div><div class="training-banner-actions"><button class="btn training-light small" data-training-action="seed">Criar dados de exemplo</button><button class="btn training-danger small" data-training-action="clear">Limpar treinamento</button></div></section>`);
    view.querySelector('[data-training-action="seed"]')?.addEventListener('click', seedTrainingData);
    view.querySelector('[data-training-action="clear"]')?.addEventListener('click', clearTrainingData);
  }

  function bindStaticEvents() {
    $('#mainNav').addEventListener('click', e => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      navigate(btn.dataset.view);
    });
    $('#menuBtn').addEventListener('click', () => toggleSidebar(true));
    $('#sidebarOverlay').addEventListener('click', () => toggleSidebar(false));
    $('#quickNewDeliveryBtn').addEventListener('click', () => openDeliveryModal());
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalWrap').addEventListener('click', e => { if (e.target === $('#modalWrap')) closeModal(); });
    $('#applyFiltersBtn').addEventListener('click', render);
    $('#clearFiltersBtn').addEventListener('click', () => {
      $('#filterMonth').value = '';
      $('#filterWeek').value = '';
      $('#filterStart').value = '';
      $('#filterEnd').value = '';
      render();
    });
    $('#filterYear').addEventListener('change', refreshWeekOptions);
    $('#filterMonth').addEventListener('change', refreshWeekOptions);
    $('#backupBtn').addEventListener('click', downloadBackup);
    $('#restoreInput').addEventListener('change', e => { if (e.target.files?.[0]) restoreBackup(e.target.files[0]); e.target.value = ''; });
    $$('.mode-choice').forEach(btn => btn.addEventListener('click', () => switchMode(btn.dataset.mode)));
  }

  function toggleSidebar(open) {
    $('#sidebar').classList.toggle('open', open);
    $('#sidebarOverlay').classList.toggle('open', open);
  }

  function navigate(view) {
    currentView = view;
    $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    const [title, subtitle] = pageMeta[view];
    $('#pageTitle').textContent = title;
    $('#pageSubtitle').textContent = subtitle;
    toggleSidebar(false);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function refreshYearOptions() {
    const years = new Set([new Date().getFullYear(), new Date().getFullYear() + 1]);
    [...scoped(state.deliveries), ...scoped(state.cycles), ...scoped(state.odometerLogs), ...scoped(state.costs)].forEach(item => {
      if (item.date) years.add(Number(item.date.slice(0, 4)));
    });
    const select = $('#filterYear');
    const previous = select.value || String(new Date().getFullYear());
    select.innerHTML = [...years].sort((a,b) => b-a).map(y => `<option value="${y}">${y}</option>`).join('');
    select.value = [...years].includes(Number(previous)) ? previous : String(new Date().getFullYear());
  }

  function refreshWeekOptions() {
    const year = Number($('#filterYear').value || new Date().getFullYear());
    const month = $('#filterMonth').value;
    const select = $('#filterWeek');
    const prev = select.value;
    const weeks = [];
    const start = month ? new Date(year, Number(month)-1, 1) : new Date(year,0,1);
    const end = month ? new Date(year, Number(month), 0) : new Date(year,11,31);
    let cursor = new Date(start);
    while (cursor <= end) {
      const iso = localDateISO(cursor);
      const monday = startOfWeek(iso);
      if (!weeks.includes(monday)) weeks.push(monday);
      cursor.setDate(cursor.getDate() + 1);
    }
    select.innerHTML = `<option value="">Todas</option>` + weeks.map((monday, i) => `<option value="${monday}">Semana ${i+1} • ${dateBR(monday)}</option>`).join('');
    if (weeks.includes(prev)) select.value = prev;
  }

  function selectedRange() {
    const year = $('#filterYear').value;
    const month = $('#filterMonth').value;
    const week = $('#filterWeek').value;
    const customStart = $('#filterStart').value;
    const customEnd = $('#filterEnd').value;
    if (customStart || customEnd) return { start: customStart || '0000-01-01', end: customEnd || '9999-12-31', label: `${dateBR(customStart)} a ${dateBR(customEnd)}` };
    if (week) return { start: week, end: endOfWeek(week), label: `Semana de ${dateBR(week)}` };
    if (month) {
      const last = new Date(Number(year), Number(month), 0).getDate();
      return { start: `${year}-${month}-01`, end: `${year}-${month}-${String(last).padStart(2,'0')}`, label: `${monthNames[Number(month)-1]} de ${year}` };
    }
    return { start: `${year}-01-01`, end: `${year}-12-31`, label: `Ano ${year}` };
  }

  function inRange(date, range = selectedRange()) {
    return Boolean(date) && date >= range.start && date <= range.end;
  }
  function filteredDeliveries() { const r = selectedRange(); return scoped(state.deliveries).filter(d => inRange(d.date, r)); }
  function filteredCycles() { const r = selectedRange(); return scoped(state.cycles).filter(d => inRange(d.date, r)); }
  function filteredOdometers() { const r = selectedRange(); return scoped(state.odometerLogs).filter(d => inRange(d.date, r)); }
  function filteredCosts() { const r = selectedRange(); return scoped(state.costs).filter(d => inRange(d.date, r)); }

  function startOfWeek(dateStr) {
    const date = new Date(`${dateStr}T12:00:00`);
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    return localDateISO(date);
  }
  function endOfWeek(dateStr) {
    const date = new Date(`${startOfWeek(dateStr)}T12:00:00`);
    date.setDate(date.getDate() + 6);
    return localDateISO(date);
  }

  function timeToMinutes(time) {
    if (!time) return null;
    const [h,m] = String(time).split(':').map(Number);
    return h*60 + m;
  }
  function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  function toDateTime(date, time) {
    if (!date || !time) return null;
    return new Date(`${date}T${time}:00`);
  }
  function durationMinutes(startDate, startTime, endDate, endTime) {
    const a = toDateTime(startDate,startTime), b = toDateTime(endDate,endTime);
    if (!a || !b || b < a) return null;
    return Math.round((b-a)/60000);
  }
  function workingMinutesBetween(startDate,startTime,endDate,endTime) {
    const start = toDateTime(startDate,startTime), end = toDateTime(endDate,endTime);
    if (!start || !end || end < start) return null;
    const s = state.settings;
    const windows = [[s.workStart,s.lunchStart],[s.lunchEnd,s.workEnd]];
    let total = 0;
    const cursor = new Date(start.getFullYear(),start.getMonth(),start.getDate());
    const last = new Date(end.getFullYear(),end.getMonth(),end.getDate());
    while (cursor <= last) {
      const day = localDateISO(cursor);
      for (const [a,b] of windows) {
        const ws = toDateTime(day,a), we = toDateTime(day,b);
        const actualStart = new Date(Math.max(start, ws));
        const actualEnd = new Date(Math.min(end, we));
        if (actualEnd > actualStart) total += (actualEnd-actualStart)/60000;
      }
      cursor.setDate(cursor.getDate()+1);
    }
    return Math.round(total);
  }
  function fmtMinutes(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    const mins = Math.max(0, Math.round(Number(value)));
    const h = Math.floor(mins/60), m = mins%60;
    return h ? `${h}h ${String(m).padStart(2,'0')}min` : `${m}min`;
  }

  function vehicle(id) { return state.vehicles.find(v => v.id === id); }
  function neighborhood(id) { return state.neighborhoods.find(v => v.id === id); }
  function employee(id) { return state.employees.find(v => v.id === id); }
  function category(id) { return state.costCategories.find(v => v.id === id); }
  function reason(id) { return state.reasons.find(v => v.id === id); }
  function cycle(id) { return state.cycles.find(v => v.id === id); }


  function currentTimeHM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function isRootPurchase(d) { return !d.parentId; }
  function rootDelivery(d) {
    const rootId = d?.rootId || d?.id;
    return scoped(state.deliveries).find(x => x.id === rootId) || d;
  }
  function financialsForRange(range) {
    const purchases = scoped(state.deliveries).filter(d => isRootPurchase(d) && inRange(d.date, range));
    const refunds = scoped(state.deliveries).filter(d => isRootPurchase(d) && Number(d.refundAmount || 0) > 0 && d.refundDate && inRange(d.refundDate, range));
    const gross = sum(purchases.map(d => d.fee));
    const refundTotal = sum(refunds.map(d => d.refundAmount));
    return { purchases, refunds, gross, refundTotal, net: gross - refundTotal };
  }
  function netRevenueOfRoot(d) {
    const root = rootDelivery(d);
    return Math.max(0, Number(root?.fee || 0) - Number(root?.refundAmount || 0));
  }
  function revenueAttributedTo(records) {
    const roots = unique(records.map(d => d.rootId || d.id));
    return sum(roots.map(id => {
      const root = scoped(state.deliveries).find(x => x.id === id);
      return root ? netRevenueOfRoot(root) : 0;
    }));
  }
  function currentWaitMinutes(d) {
    if (!d.purchaseTime || isFinal(d)) return null;
    if (d.departureTime) return deliveryCalc(d).wait;
    const endDate = todayISO();
    const endTime = currentTimeHM();
    if (d.date > endDate) return null;
    return workingMinutesBetween(d.date, d.purchaseTime, endDate, endTime);
  }

  function deliveryCalc(d) {
    const wait = d.purchaseTime && d.departureTime ? workingMinutesBetween(d.date,d.purchaseTime,d.date,d.departureTime) : null;
    const toClient = d.departureTime && d.finalizationTime ? durationMinutes(d.date,d.departureTime,d.date,d.finalizationTime) : null;
    const route = d.departureTime && d.returnTime ? durationMinutes(d.date,d.departureTime,d.date,d.returnTime) : null;
    return {
      wait, toClient, route,
      delayed: wait !== null && wait > Number(state.settings.delayMinutes || 120)
    };
  }
  function cycleCalc(c) {
    // CICLO = uma saída da loja até o retorno ao mercado.
    // Todas as entregas levadas naquela mesma saída compartilham o mesmo cycleId.
    const carriedDeliveries = scoped(state.deliveries).filter(d => d.cycleId === c.id);
    const delivered = carriedDeliveries.filter(d => d.status === 'Finalizada');
    const minutes = c.departureTime && c.returnTime ? durationMinutes(c.date,c.departureTime,c.date,c.returnTime) : null;
    const revenue = revenueAttributedTo(carriedDeliveries);
    const sameDayVehicleCycles = scoped(state.cycles).filter(x => x.date === c.date && x.vehicleId === c.vehicleId);
    const dayKm = dailyKmForVehicle(c.date, c.vehicleId);
    const avgKm = sameDayVehicleCycles.length ? dayKm / sameDayVehicleCycles.length : 0;
    return {
      deliveries: carriedDeliveries.length,
      delivered: delivered.length,
      km: avgKm,
      minutes,
      revenue,
      open: !c.returnTime
    };
  }
  function odometerCalc(log) {
    const start = Number(log?.kmStart || 0);
    const end = Number(log?.kmEnd || 0);
    const complete = start > 0 && end > 0 && end >= start;
    return { km: complete ? end - start : 0, complete, invalid: end > 0 && start > 0 && end < start };
  }
  function dailyKmForVehicle(date, vehicleId) {
    return sum(scoped(state.odometerLogs).filter(x => x.date === date && x.vehicleId === vehicleId).map(x => odometerCalc(x).km));
  }
  function totalKmFromOdometers(logs = filteredOdometers()) { return sum(logs.map(x => odometerCalc(x).km)); }
  function vehicleDayStats(date, vehicleId) {
    const log = scoped(state.odometerLogs).find(x => x.date === date && x.vehicleId === vehicleId);
    const km = odometerCalc(log).km;
    const cycles = scoped(state.cycles).filter(x => x.date === date && x.vehicleId === vehicleId);
    const carried = scoped(state.deliveries).filter(x => x.date === date && x.vehicleId === vehicleId && x.cycleId);
    const completed = carried.filter(x => x.status === 'Finalizada');
    return {
      log, km, cycles: cycles.length, deliveries: carried.length, completed: completed.length,
      deliveriesPerCycle: cycles.length ? carried.length / cycles.length : 0,
      kmPerCycle: cycles.length ? km / cycles.length : 0,
      kmPerDelivery: carried.length ? km / carried.length : 0
    };
  }
  function isFinal(d) { return d.status === 'Finalizada' || d.status === 'Retirada na loja' || d.status === 'Cancelada'; }
  function childDeliveries(id) { return scoped(state.deliveries).filter(d => d.parentId === id); }
  function openScheduled(d) {
    if (!d.scheduledDate || isFinal(d)) return false;
    const children = childDeliveries(d.id);
    return children.length === 0;
  }
  function pendingReasons(d) {
    const list = [];
    const calc = deliveryCalc(d);
    if (openScheduled(d)) list.push(`${d.scheduleKind || 'Programada'} para ${dateBR(d.scheduledDate)}`);
    if (d.status === 'Em rota' && !d.returnTime) list.push('Em rota sem retorno');
    if (d.parentId && !isFinal(d) && !d.scheduledDate && d.status !== 'Em rota') list.push('Atendimento programado iniciado e não concluído');
    if (d.status === 'Devolvida' && !d.scheduledDate && !d.nextAction) list.push('Devolvida sem próxima ação');
    if (calc.delayed && !isFinal(d)) list.push('Atrasada acima de 2h úteis');
    if (d.departureTime && !d.vehicleId) list.push('Saiu sem veículo');
    if (d.departureTime && !d.driverId) list.push('Saiu sem entregador');
    if (d.scheduledDate && d.scheduledDate < todayISO() && openScheduled(d)) list.push('Programação vencida');
    return unique(list);
  }
  function allPending() { return scoped(state.deliveries).filter(d => pendingReasons(d).length); }
  function scheduledOpen() { return scoped(state.deliveries).filter(openScheduled); }
  function scheduledForDate(date) { return scheduledOpen().filter(d => d.scheduledDate === date); }

  function updateBadges() {
    if (!state) return;
    const pending = allPending();
    const sched = scheduledOpen();
    const todayPending = pending.filter(d => d.date === todayISO() || d.scheduledDate === todayISO());
    $('#pendingBadge').textContent = pending.length;
    $('#scheduledBadge').textContent = sched.length;
    $('#todayPendingBadge').textContent = todayPending.length;
    const trashBadge = $('#trashBadge');
    if (trashBadge) trashBadge.textContent = state.trash.filter(x => (x.mode || 'production') === currentMode()).length;
  }

  function render() {
    refreshYearOptions();
    updateBadges();
    const view = $('#view');
    view.innerHTML = '';
    if (currentView === 'dashboard') renderDashboard();
    else if (currentView === 'today') renderToday();
    else if (currentView === 'deliveries') renderDeliveries();
    else if (currentView === 'scheduled') renderScheduled();
    else if (currentView === 'pending') renderPending();
    else if (currentView === 'cycles') renderCycles();
    else if (currentView === 'odometer') renderOdometer();
    else if (currentView === 'costs') renderCosts();
    else if (currentView === 'neighborhoods') renderNeighborhoods();
    else if (currentView === 'trace') renderTrace();
    else if (currentView === 'reports') renderReports();
    else if (currentView === 'settings') renderSettings();
    else if (currentView === 'trash') renderTrash();
    injectModeBanner();
    updateModeUI();
  }

  function cardMetric(label, value, sub = '', icon = '•', tone = 'blue') {
    return `<article class="card metric-card"><div class="metric-top"><span class="metric-label">${esc(label)}</span><span class="metric-icon ${tone}">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-sub">${esc(sub)}</div></article>`;
  }
  function sectionHeader(icon,title,subtitle,actions='') {
    return `<div class="section-head"><div class="section-title"><span class="section-badge">${icon}</span><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div></div>${actions ? `<div class="section-actions">${actions}</div>` : ''}</div>`;
  }
  function statusBadge(status) {
    const tone = status === 'Finalizada' ? 'green' : status === 'Em rota' ? 'yellow' : status === 'Devolvida' ? 'red' : ['Programada','Reagendada'].includes(status) ? 'purple' : status === 'Cancelada' ? 'gray' : 'blue';
    return `<span class="badge ${tone}">${esc(status || 'Na loja')}</span>`;
  }
  function emptyState(icon,title,text) { return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`; }

  function renderDashboard() {
    const deliveries = filteredDeliveries();
    const costs = filteredCosts();
    const cycles = filteredCycles();
    const odometers = filteredOdometers();
    const final = deliveries.filter(d => d.status === 'Finalizada');
    const range = selectedRange();
    const fin = financialsForRange(range);
    const totalCosts = sum(costs.map(c => c.value));
    const totalKm = totalKmFromOdometers(odometers);
    const activeDays = unique([...deliveries.map(d => d.date),...cycles.map(c => c.date),...odometers.map(o => o.date),...costs.map(c => c.date)]).length || 1;
    const carriedInCycles = sum(cycles.map(c => cycleCalc(c).deliveries));
    const deliveriesPerCycle = cycles.length ? carriedInCycles / cycles.length : 0;
    const costPerDelivery = final.length ? totalCosts / final.length : 0;
    const fuel = sum(costs.filter(c => category(c.categoryId)?.name === 'Combustível').map(c => c.value));
    const avgWait = avg(deliveries.map(d => deliveryCalc(d).wait));
    const avgRoute = avg(deliveries.map(d => deliveryCalc(d).route));
    const delayed = deliveries.filter(d => deliveryCalc(d).delayed).length;
    const openSched = deliveries.filter(openScheduled).length;
    const weeklyRows = buildWeeklyRows(deliveries,costs,cycles,odometers);
    const nbRows = buildNeighborhoodRows(deliveries);
    const topDelivery = nbRows[0];
    const topWrong = [...nbRows].sort((a,b) => b.wrongAddress-a.wrongAddress)[0];
    const topReschedule = [...nbRows].sort((a,b) => b.rescheduled-a.rescheduled)[0];

    $('#view').innerHTML = `
      <section class="hero-strip">
        <div><span class="hero-mode-label">${currentMode()==='training'?'🧪 TREINAMENTO':'OPERAÇÃO REAL'}</span><h2>Visão executiva • ${esc(range.label)}</h2><p>O faturamento entra no momento em que a compra é registrada. Reagendamentos não duplicam receita.</p></div>
        <div class="hero-meta"><span class="hero-chip">${fin.purchases.length} compras</span><span class="hero-chip">${final.length} entregas finalizadas</span><span class="hero-chip">${number(totalKm,1)} km</span></div>
      </section>

      <section class="metrics-grid">
        ${cardMetric('Faturamento bruto', money(fin.gross), `${fin.purchases.length} compras registradas`, 'R$', 'green')}
        ${cardMetric('Reembolsos de taxa', money(fin.refundTotal), `${fin.refunds.length} reembolsos`, '↩', fin.refundTotal ? 'yellow':'blue')}
        ${cardMetric('Faturamento líquido', money(fin.net), 'Bruto menos reembolsos', '+', 'green')}
        ${cardMetric('Custos totais', money(totalCosts), `Combustível: ${money(fuel)}`, '−', 'red')}
        ${cardMetric('Saldo operacional', money(fin.net-totalCosts), 'Líquido menos custos registrados', '+', fin.net-totalCosts >= 0 ? 'green':'red')}
        ${cardMetric('Custo por entrega', money(costPerDelivery), 'Custos ÷ entregas finalizadas', 'CE', 'yellow')}
        ${cardMetric('Entregas por ciclo', number(deliveriesPerCycle,2), `${cycles.length} ciclos registrados`, '↻', 'purple')}
        ${cardMetric('KM total', `${number(totalKm,1)} km`, `${odometers.filter(o=>odometerCalc(o).complete).length} fechamentos de KM`, 'KM', 'blue')}
        ${cardMetric('KM médio por dia', `${number(totalKm/activeDays,1)} km`, `${activeDays} dias com movimento`, '↗', 'blue')}
        ${cardMetric('KM médio por ciclo', `${number(cycles.length?totalKm/cycles.length:0,2)} km`, 'KM diário ÷ ciclos', '↻', 'green')}
        ${cardMetric('KM por entrega', `${number(final.length?totalKm/final.length:0,2)} km`, 'Média das finalizadas', '▣', 'blue')}
        ${cardMetric('Tempo médio de espera', fmtMinutes(avgWait), 'Compra → saída', '⌛', 'yellow')}
        ${cardMetric('Tempo médio de rota', fmtMinutes(avgRoute), 'Saída → retorno à loja', '◷', 'purple')}
        ${cardMetric('Pendências críticas', allPending().filter(d => inRange(d.date)).length, `${delayed} atrasadas • ${openSched} programadas`, '!', 'red')}
      </section>

      <section class="dashboard-grid">
        <article class="card section-card">
          ${sectionHeader('▥','Entregas por dia','Evolução das entregas finalizadas no período.')}
          <div class="chart-box">${lineChartHTML(groupCountByDate(final), '#2E73B9')}</div>
        </article>
        <article class="card section-card">
          ${sectionHeader('★','Destaques dos bairros','Principais concentrações de volume e problemas.')}
          <div class="stat-list">
            ${statRow('Mais entregas', topDelivery?.name || '—', topDelivery ? `${topDelivery.deliveries} entregas` : 'Sem dados')}
            ${statRow('Mais endereço errado', topWrong?.name || '—', topWrong ? `${topWrong.wrongAddress} ocorrências` : 'Sem dados')}
            ${statRow('Mais reagendamentos', topReschedule?.name || '—', topReschedule ? `${topReschedule.rescheduled} reagendamentos` : 'Sem dados')}
          </div>
        </article>
      </section>

      <section class="dashboard-grid equal">
        <article class="card section-card">
          ${sectionHeader('R$','Faturamento líquido x custos por semana','Receita registrada, reembolsos e gastos da operação.')}
          <div class="chart-box small">${groupedBarChartHTML(weeklyRows.map(r => ({label:r.label,a:r.netRevenue,b:r.costs})), 'Faturamento líquido','Custos')}</div>
        </article>
        <article class="card section-card">
          ${sectionHeader('◎','Top bairros por entregas','Quantidade de entregas finalizadas por bairro.')}
          <div class="chart-box small">${horizontalBarChartHTML(nbRows.slice(0,8).map(r=>({label:r.name,value:r.deliveries})),'#2E73B9')}</div>
        </article>
      </section>

      <section class="dashboard-grid equal">
        <article class="card section-card">
          ${sectionHeader('◉','Custos por categoria','Combustível, manutenção e demais gastos.')}
          <div class="chart-box small">${donutChartHTML(buildCostCategoryRows(costs))}</div>
        </article>
        <article class="card section-card">
          ${sectionHeader('!','Problemas por bairro','Endereço errado, devolução, agendamento e reagendamento.')}
          <div class="chart-box small">${problemNeighborhoodChartHTML(nbRows.slice().sort((a,b)=>b.problemCount-a.problemCount).slice(0,8))}</div>
        </article>
      </section>

      <section class="card section-card" style="margin-top:12px">
        ${sectionHeader('▤','Resultados semanais','Entregas, faturamento bruto/líquido, reembolsos, custos, KM e eficiência por ciclo.')}
        ${weeklyTable(weeklyRows)}
      </section>
    `;
  }

  function statRow(label,value,sub) { return `<div class="stat-row"><div><strong>${esc(label)}</strong><small>${esc(sub)}</small></div><div class="stat-number">${esc(value)}</div></div>`; }

  function groupCountByDate(items) {
    const map = {};
    items.forEach(item => map[item.date] = (map[item.date] || 0) + 1);
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([date,value]) => ({ label: dateBR(date).slice(0,5), value }));
  }

  function buildWeeklyRows(deliveries = filteredDeliveries(), costs = filteredCosts(), cycles = filteredCycles(), odometers = filteredOdometers()) {
    const selected = selectedRange();
    const refundDates = scoped(state.deliveries).filter(d=>d.refundDate && inRange(d.refundDate, selected)).map(d=>startOfWeek(d.refundDate));
    const weeks = unique([...deliveries.map(d=>startOfWeek(d.date)),...costs.map(c=>startOfWeek(c.date)),...cycles.map(c=>startOfWeek(c.date)),...odometers.map(o=>startOfWeek(o.date)),...refundDates]).sort();
    return weeks.map((week, index) => {
      const weekRange = {start:week,end:endOfWeek(week)};
      const d = deliveries.filter(x => inRange(x.date, weekRange));
      const final = d.filter(x => x.status === 'Finalizada');
      const c = costs.filter(x => inRange(x.date, weekRange));
      const cy = cycles.filter(x => inRange(x.date, weekRange));
      const odo = odometers.filter(x => inRange(x.date, weekRange));
      const km = totalKmFromOdometers(odo);
      const fin = financialsForRange(weekRange);
      return {
        week, label:`Sem. ${index+1}`,
        deliveries:final.length,
        grossRevenue:fin.gross,
        refunds:fin.refundTotal,
        netRevenue:fin.net,
        costs:sum(c.map(x=>x.value)),
        km,
        cycles:cy.length,
        deliveriesPerCycle:cy.length ? sum(cy.map(c=>cycleCalc(c).deliveries))/cy.length : 0,
        kmPerCycle:cy.length ? km/cy.length : 0
      };
    });
  }

  function weeklyTable(rows) {
    if (!rows.length) return emptyState('▤','Sem dados semanais','Registre entregas, custos ou ciclos para gerar esta análise.');
    return `<div class="table-wrap"><table><thead><tr><th>Semana</th><th>Entregas</th><th>Bruto</th><th>Reembolsos</th><th>Líquido</th><th>Custos</th><th>Saldo</th><th>KM</th><th>Ciclos</th><th>Ent./ciclo</th><th>KM/ciclo</th></tr></thead><tbody>${rows.map(r => `<tr><td><div class="cell-title">${esc(r.label)}</div><div class="cell-sub">${dateBR(r.week)} a ${dateBR(endOfWeek(r.week))}</div></td><td>${r.deliveries}</td><td>${money(r.grossRevenue)}</td><td>${money(r.refunds)}</td><td>${money(r.netRevenue)}</td><td>${money(r.costs)}</td><td>${money(r.netRevenue-r.costs)}</td><td>${number(r.km,1)} km</td><td>${r.cycles}</td><td>${number(r.deliveriesPerCycle,2)}</td><td>${number(r.kmPerCycle,2)} km</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderToday() {
    const date = todayISO();
    const deliveries = scoped(state.deliveries).filter(d => d.date === date);
    const purchases = deliveries.filter(isRootPurchase);
    const scheduled = scheduledForDate(date);
    const pending = allPending().filter(d => d.date === date || d.scheduledDate === date);
    const final = deliveries.filter(d => d.status === 'Finalizada');
    const costs = scoped(state.costs).filter(c => c.date === date);
    const cycles = scoped(state.cycles).filter(c => c.date === date);
    const openCycles = cycles.filter(c => !c.returnTime);
    const odometers = scoped(state.odometerLogs).filter(o => o.date === date);
    const totalDayKm = totalKmFromOdometers(odometers);
    const carriedToday = sum(cycles.map(c => cycleCalc(c).deliveries));
    const fin = financialsForRange({start:date,end:date});
    $('#view').innerHTML = `
      <section class="today-hero premium-flow-hero">
        <div><span class="eyebrow">OPERAÇÃO GUIADA</span><h2>Operação de hoje</h2><p>O fluxo foi simplificado: registre a compra, abra o KM inicial, monte a saída, dê baixa nas entregas, registre o retorno e feche o KM final.</p></div>
        <div class="today-date-chip">${dateBR(date)}</div>
      </section>

      <section class="workflow-strip">
        ${workflowStep('1','Registrar compra','A taxa já entra no faturamento','new-delivery')}
        ${workflowStep('2','KM inicial','Uma vez por veículo no início do expediente','new-odometer')}
        ${workflowStep('3','Montar saída','Selecione uma ou várias entregas e abra 1 ciclo','start-cycle')}
        ${workflowStep('4','Entregar','Marque cada entrega quando chegar ao cliente','scroll-deliveries')}
        ${workflowStep('5','Retornar','Feche o ciclo quando o entregador voltar','scroll-cycles')}
        ${workflowStep('6','KM final','Feche o odômetro no fim do expediente','scroll-odometer')}
      </section>

      <section class="quick-kpis">
        ${quickKpi('Compras registradas', purchases.length, 'Faturam no registro')}
        ${quickKpi('Finalizadas', final.length, 'Concluídas')}
        ${quickKpi('Em rota', deliveries.filter(d=>d.status==='Em rota').length, `${openCycles.length} ciclo(s) aberto(s)`)}
        ${quickKpi('Entregas levadas', carriedToday, `${cycles.length} ciclos no dia`)}
        ${quickKpi('Entregas por ciclo', number(cycles.length?carriedToday/cycles.length:0,2), 'Média do dia')}
        ${quickKpi('Faturamento bruto', money(fin.gross), 'No registro da compra')}
        ${quickKpi('Faturamento líquido', money(fin.net), `Reembolsos ${money(fin.refundTotal)}`)}
        ${quickKpi('KM rodado hoje', `${number(totalDayKm,1)} km`, `${cycles.length} ciclos • ${number(cycles.length?totalDayKm/cycles.length:0,2)} km/ciclo`)}
      </section>

      <section class="card section-card odometer-today-panel" id="todayOdometerSection">
        ${sectionHeader('KM','1. Quilometragem diária dos veículos','Registre o KM inicial antes do veículo começar a trabalhar e o KM final ao encerrar o expediente. Nunca informe KM em cada ciclo.', `<button class="btn primary small" data-action="new-odometer">＋ Registrar KM inicial/final</button>`)}
        ${odometerDayCards(date)}
      </section>

      <section class="card section-card active-cycle-panel" id="todayCyclesSection">
        ${sectionHeader('↻','2. Saídas e ciclos do dia','Cada saída da loja até o retorno ao mercado é exatamente 1 ciclo. Se levar 5 entregas na mesma saída, são 5 entregas dentro de 1 ciclo.', `<button class="btn primary small" data-action="start-cycle">🚚 Montar nova saída</button>`)}
        ${activeCycleCards(cycles)}
      </section>

      <section class="two-column">
        <article class="card section-card">
          ${sectionHeader('◷','Programadas para hoje','Puxadas automaticamente pela Data Programada.', `<button class="btn primary small" data-action="new-delivery">＋ Registrar compra</button>`)}
          ${scheduledTable(scheduled, true)}
        </article>
        <article class="card section-card">
          ${sectionHeader('!','Atenções do dia','Pendências e alertas que precisam de ação.')}
          ${pendingAlertList(pending)}
        </article>
      </section>

      <section class="dashboard-grid equal">
        <article class="card section-card">
          ${sectionHeader('↻','Resumo de ciclos','Quantidade de saídas, entregas levadas e duração.', `<button class="btn secondary small" data-action="start-cycle">🚚 Nova saída</button>`)}
          ${cycleMiniTable(cycles)}
        </article>
        <article class="card section-card">
          ${sectionHeader('R$','Custos de hoje','Combustível, manutenção e outros gastos.', `<button class="btn secondary small" data-action="new-cost">＋ Registrar custo</button>`)}
          ${costMiniTable(costs)}
        </article>
      </section>

      <article class="card section-card" style="margin-top:12px" id="todayDeliveriesSection">
        ${sectionHeader('▣','Entregas de hoje','Use Saiu para iniciar uma saída com uma ou mais entregas; depois marque Entregue/Devolvida e feche o ciclo no retorno.', `<button class="btn primary small" data-action="new-delivery">＋ Registrar compra</button>`)}
        ${operationCards(deliveries)}
      </article>
    `;
    bindViewActions();
  }
  function quickKpi(label,value,sub) { return `<article class="card quick-kpi"><span>${esc(label)}</span><strong>${value}</strong><small>${esc(sub)}</small></article>`; }

  function workflowStep(n,title,sub,action) {
    return `<button class="workflow-step" data-action="${action}"><span class="workflow-number">${n}</span><span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span></button>`;
  }

  function activeCycleCards(cycles) {
    if (!cycles.length) return emptyState('↻','Nenhuma saída registrada hoje','Selecione uma ou mais entregas e clique em Montar nova saída.');
    const ordered = cycles.slice().sort((a,b)=>(b.departureTime||'').localeCompare(a.departureTime||''));
    return `<div class="active-cycle-grid">${ordered.map(c=>{
      const x=cycleCalc(c); const linked=scoped(state.deliveries).filter(d=>d.cycleId===c.id);
      const names=linked.slice(0,4).map(d=>d.coupon||'—').join(', ') + (linked.length>4?` +${linked.length-4}`:'');
      return `<article class="cycle-status-card ${c.returnTime?'closed':'open'}">
        <div class="cycle-status-head"><div><span>${c.returnTime?'CICLO FECHADO':'EM ROTA'}</span><strong>${esc(c.code)}</strong></div>${c.returnTime?'<span class="badge green">Retornou</span>':'<span class="badge yellow">Em andamento</span>'}</div>
        <div class="cycle-status-route"><div><small>Saída</small><strong>${c.departureTime||'—'}</strong></div><span>→</span><div><small>Retorno</small><strong>${c.returnTime||'—'}</strong></div></div>
        <div class="cycle-status-meta"><span><b>${x.deliveries}</b> entregas levadas</span><span><b>${esc(vehicle(c.vehicleId)?.name||'—')}</b></span><span><b>${esc(employee(c.driverId)?.name||'—')}</b></span></div>
        <div class="cycle-coupons">Cupons: ${esc(names||'—')}</div>
        <div class="cycle-status-actions">${!c.returnTime?`<button class="btn primary small" data-action="close-cycle" data-id="${c.id}">🏪 Registrar retorno</button>`:''}<button class="btn secondary small" data-action="manage-cycle-deliveries" data-id="${c.id}">▣ Gerenciar entregas</button><button class="btn secondary small" data-action="edit-cycle" data-id="${c.id}">Ajustar</button><button class="btn danger small" data-action="delete-record" data-type="cycle" data-id="${c.id}">Apagar</button></div>
      </article>`;
    }).join('')}</div>`;
  }


  function operationCards(deliveries) {
    if (!deliveries.length) return emptyState('▣','Nenhuma compra registrada hoje','Clique em Registrar compra para começar.');
    const sorted = deliveries.slice().sort((a,b) => {
      const af = isFinal(a) ? 1 : 0, bf = isFinal(b) ? 1 : 0;
      return af-bf || `${a.purchaseTime||''}`.localeCompare(`${b.purchaseTime||''}`);
    });
    return `<div class="operation-card-grid">${sorted.map(d => {
      const calc = deliveryCalc(d);
      const liveWait = currentWaitMinutes(d);
      const liveDelayed = liveWait !== null && liveWait > Number(state.settings.delayMinutes || 120);
      const root = rootDelivery(d);
      const refund = Number(root?.refundAmount || 0);
      const isFutureScheduled = d.scheduledDate && d.scheduledDate > todayISO() && openScheduled(d);
      const cyc = d.cycleId ? cycle(d.cycleId) : null;
      let actions = '';
      if (!isFinal(d) && !isFutureScheduled) {
        if (!d.departureTime) actions += `<button class="action-btn primary" data-action="quick-departure" data-id="${d.id}"><span>🚚</span>Incluir em saída</button>`;
        if (d.departureTime && !d.finalizationTime && d.status!=='Devolvida') actions += `<button class="action-btn success" data-action="quick-delivered" data-id="${d.id}"><span>✅</span>Entregue</button>`;
        if (d.departureTime && !d.returnTime && cyc && !cyc.returnTime) actions += `<button class="action-btn navy" data-action="close-cycle" data-id="${cyc.id}"><span>🏪</span>Retorno do ciclo</button>`;
        actions += `<button class="action-btn warning" data-action="quick-reschedule" data-id="${d.id}"><span>📅</span>Reagendar</button>`;
        actions += `<button class="action-btn soft" data-action="quick-pickup" data-id="${d.id}"><span>📦</span>Retirada</button>`;
        actions += `<button class="action-btn danger" data-action="quick-devolution" data-id="${d.id}"><span>↩</span>Devolvida</button>`;
      }
      actions += `<button class="action-btn ghost" data-action="edit-delivery" data-id="${d.id}"><span>✏️</span>Avançado</button>`;
      return `<article class="delivery-action-card ${liveDelayed && !d.departureTime ? 'late':''}">
        <div class="delivery-card-head">
          <div><span class="delivery-card-kicker">CUPOM</span><strong>${esc(d.coupon || '—')}</strong><small>Compra ${esc(d.orderNo || '—')} • ${esc(neighborhood(d.neighborhoodId)?.name || 'Sem bairro')}</small></div>
          <div>${statusBadge(d.status)}</div>
        </div>
        <div class="delivery-card-finance"><span>Taxa registrada <strong>${money(root?.fee || d.fee)}</strong></span>${refund ? `<span class="refund-chip">Reembolso ${money(refund)}</span>`:''}</div>
        ${cyc ? `<div class="delivery-cycle-chip">↻ ${esc(cyc.code)} • saída ${cyc.departureTime||'—'} • ${cycleCalc(cyc).deliveries} entrega(s) levada(s)</div>`:''}
        <div class="delivery-card-times">
          <div><small>Entrada</small><strong>${d.purchaseTime || '—'}</strong></div>
          <div><small>Espera</small><strong class="${liveDelayed?'text-danger':''}">${fmtMinutes(liveWait)}</strong></div>
          <div><small>Até cliente</small><strong>${fmtMinutes(calc.toClient)}</strong></div>
          <div><small>Rota/ciclo</small><strong>${fmtMinutes(calc.route)}</strong></div>
        </div>
        ${isFutureScheduled ? `<div class="scheduled-note">📅 Programada para ${dateBR(d.scheduledDate)} • o faturamento já foi contado no registro original.</div>`:''}
        <div class="action-grid">${actions}</div>
      </article>`;
    }).join('')}</div>`;
  }
  function renderDeliveries() {
    const deliveries = filteredDeliveries().slice().sort((a,b) => `${b.date}${b.purchaseTime||''}`.localeCompare(`${a.date}${a.purchaseTime||''}`));
    $('#view').innerHTML = `<article class="card section-card">${sectionHeader('▣','Histórico de entregas',`${deliveries.length} registros no recorte atual.`, `<button class="btn primary small" data-action="new-delivery">＋ Nova entrega</button>`)}${deliveryTable(deliveries)}</article>`;
    bindViewActions();
  }

  function deliveryTable(deliveries) {
    if (!deliveries.length) return emptyState('▣','Nenhuma entrega encontrada','Registre uma nova entrega ou altere o recorte de análise.');
    return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Cupom</th><th>Bairro</th><th>Status</th><th>Taxa registrada</th><th>Reembolso</th><th>Espera</th><th>Até cliente</th><th>Rota total</th><th>Atraso</th><th>Ações</th></tr></thead><tbody>${deliveries.map(d => {
      const calc = deliveryCalc(d);
      return `<tr>
        <td><div class="cell-title mono">${dateBR(d.date)}</div><div class="cell-sub">Entrada ${d.purchaseTime || '—'}</div></td>
        <td><div class="cell-title">${esc(d.coupon || '—')}</div><div class="cell-sub">Compra ${esc(d.orderNo || '—')}</div></td>
        <td>${esc(neighborhood(d.neighborhoodId)?.name || '—')}</td>
        <td>${statusBadge(d.status)}</td>
        <td>${money(rootDelivery(d)?.fee || d.fee)}</td>
        <td>${money(rootDelivery(d)?.refundAmount || 0)}</td>
        <td>${fmtMinutes(calc.wait)}</td>
        <td>${fmtMinutes(calc.toClient)}</td>
        <td>${fmtMinutes(calc.route)}</td>
        <td>${calc.delayed ? '<span class="badge red">Atrasada</span>' : '<span class="badge green">OK</span>'}</td>
        <td><div class="actions"><button class="btn secondary small" data-action="edit-delivery" data-id="${d.id}">Editar</button><button class="btn secondary small" data-action="trace-delivery" data-coupon="${attr(d.coupon)}">Rastrear</button><button class="btn danger small" data-action="delete-record" data-type="delivery" data-id="${d.id}">Apagar</button></div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderScheduled() {
    const list = scheduledOpen().slice().sort((a,b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate)));
    const overdue = list.filter(d => d.scheduledDate < todayISO()).length;
    const today = list.filter(d => d.scheduledDate === todayISO()).length;
    const future = list.filter(d => d.scheduledDate > todayISO()).length;
    $('#view').innerHTML = `
      <section class="metrics-grid">
        ${cardMetric('Programadas abertas', list.length, 'Ainda não concluídas', '◷', 'purple')}
        ${cardMetric('Para hoje', today, dateBR(todayISO()), '⌂', 'blue')}
        ${cardMetric('Vencidas', overdue, 'Exigem ação imediata', '!', overdue ? 'red':'green')}
        ${cardMetric('Futuras', future, 'Próximas datas', '→', 'green')}
        ${cardMetric('Reagendamentos', list.filter(d=>d.scheduleKind==='Reagendada').length, 'Abertos', '↻', 'yellow')}
      </section>
      <article class="card section-card" style="margin-top:12px">${sectionHeader('◷','Programadas e reagendadas em aberto','Aparecem automaticamente pela Data Programada e somem da lista quando o atendimento é iniciado.')}${scheduledTable(list,true)}</article>
    `;
    bindViewActions();
  }

  function scheduledTable(list, actions = false) {
    if (!list.length) return emptyState('◷','Nenhuma entrega programada aberta','Quando uma Data Programada for informada, a entrega aparecerá automaticamente aqui e no dia correto.');
    return `<div class="table-wrap"><table><thead><tr><th>Data programada</th><th>Tipo</th><th>Cupom</th><th>Origem</th><th>Bairro</th><th>Motivo</th><th>Próxima ação</th>${actions?'<th>Ações</th>':''}</tr></thead><tbody>${list.map(d => `<tr>
      <td><div class="cell-title mono">${dateBR(d.scheduledDate)}</div>${d.scheduledDate < todayISO() ? '<div class="cell-sub" style="color:#B54141">Vencida</div>':''}</td>
      <td>${statusBadge(d.scheduleKind || 'Programada')}</td>
      <td><div class="cell-title">${esc(d.coupon || '—')}</div></td>
      <td>${dateBR(d.date)}</td>
      <td>${esc(neighborhood(d.neighborhoodId)?.name || '—')}</td>
      <td>${esc(reason(d.reasonId)?.name || d.reasonText || '—')}</td>
      <td>${esc(d.nextAction || '—')}</td>
      ${actions ? `<td><div class="actions"><button class="btn primary small" data-action="start-scheduled" data-id="${d.id}">Iniciar atendimento</button><button class="btn secondary small" data-action="edit-delivery" data-id="${d.id}">Editar</button></div></td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
  }

  function renderPending() {
    const list = allPending().slice().sort((a,b) => (a.scheduledDate || a.date).localeCompare(b.scheduledDate || b.date));
    $('#view').innerHTML = `<article class="card section-card">${sectionHeader('!','Central automática de pendências','Você não digita aqui: clique em Resolver para abrir o registro correto.')}${pendingTable(list)}</article>`;
    bindViewActions();
  }

  function pendingTable(list) {
    if (!list.length) return emptyState('✓','Nenhuma pendência aberta','A operação está sem pendências registradas.');
    return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Cupom</th><th>Status</th><th>Pendências</th><th>Bairro</th><th>Ação</th></tr></thead><tbody>${list.map(d => `<tr>
      <td><div class="cell-title">${dateBR(d.date)}</div>${d.scheduledDate ? `<div class="cell-sub">Prog. ${dateBR(d.scheduledDate)}</div>`:''}</td>
      <td><div class="cell-title">${esc(d.coupon || '—')}</div></td>
      <td>${statusBadge(d.status)}</td>
      <td>${pendingReasons(d).map(x => `<span class="badge ${x.includes('vencida') || x.includes('Atrasada') ? 'red':'yellow'}">${esc(x)}</span>`).join(' ')}</td>
      <td>${esc(neighborhood(d.neighborhoodId)?.name || '—')}</td>
      <td><button class="btn primary small" data-action="edit-delivery" data-id="${d.id}">Resolver</button></td>
    </tr>`).join('')}</tbody></table></div>`;
  }

  function pendingAlertList(list) {
    if (!list.length) return emptyState('✓','Nenhuma atenção aberta','A operação de hoje não tem pendências registradas.');
    return `<div class="alert-list">${list.slice(0,12).map(d => `<div class="alert-item ${pendingReasons(d).some(x=>x.includes('Atrasada')||x.includes('vencida'))?'red':'blue'}"><strong>Cupom ${esc(d.coupon || '—')}</strong><p>${esc(pendingReasons(d).join(' • '))}</p></div>`).join('')}</div>`;
  }

  function renderCycles() {
    const list = filteredCycles().slice().sort((a,b) => `${b.date}${b.departureTime||''}`.localeCompare(`${a.date}${a.departureTime||''}`));
    const odometers = filteredOdometers();
    const totalKm = totalKmFromOdometers(odometers);
    const carried = sum(list.map(c=>cycleCalc(c).deliveries));
    $('#view').innerHTML = `
      <section class="hero-strip cycle-hero">
        <div><span class="eyebrow">PRODUTIVIDADE DAS SAÍDAS</span><h2>Ciclos de entrega</h2><p>Regra oficial do sistema: 1 ciclo começa quando o entregador sai da loja e termina quando ele retorna ao mercado. Uma saída pode levar uma ou várias entregas.</p></div>
        <div class="hero-meta"><span class="hero-chip">${list.length} ciclos</span><span class="hero-chip">${carried} entregas levadas</span></div>
      </section>
      <section class="metrics-grid">
        ${cardMetric('Ciclos',list.length,'Saídas no recorte','↻','purple')}
        ${cardMetric('Entregas levadas / ciclo',number(list.length?carried/list.length:0,2),'Média de volumes por saída','▣','blue')}
        ${cardMetric('KM médio / ciclo',`${number(list.length?totalKm/list.length:0,2)} km`,'KM diário total ÷ ciclos','KM','green')}
        ${cardMetric('Tempo médio do ciclo',fmtMinutes(avg(list.map(c=>cycleCalc(c).minutes))),'Saída → retorno','◷','yellow')}
        ${cardMetric('KM total',`${number(totalKm,1)} km`,'A partir dos odômetros diários','↗','blue')}
      </section>
      <article class="card section-card" style="margin-top:12px">${sectionHeader('↻','Histórico de ciclos','Não há KM inicial/final dentro do ciclo. O odômetro é diário e separado.', `<button class="btn primary small" data-action="start-cycle">🚚 Montar nova saída</button>`)}${cycleTable(list)}</article>
    `;
    bindViewActions();
  }
  function cycleTable(list) {
    if (!list.length) return emptyState('↻','Nenhum ciclo registrado','Monte uma saída selecionando uma ou mais entregas.');
    return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Ciclo</th><th>Veículo</th><th>Entregador</th><th>Saída</th><th>Retorno</th><th>Entregas levadas</th><th>Média KM/ciclo do dia</th><th>Tempo</th><th>Ações</th></tr></thead><tbody>${list.map(c => { const x=cycleCalc(c); return `<tr>
      <td>${dateBR(c.date)}</td><td><div class="cell-title">${esc(c.code)}</div>${c.returnTime?'<div class="cell-sub">Fechado</div>':'<div class="cell-sub" style="color:#A66A00">Em rota</div>'}</td><td>${esc(vehicle(c.vehicleId)?.name || '—')}</td><td>${esc(employee(c.driverId)?.name || '—')}</td><td>${c.departureTime || '—'}</td><td>${c.returnTime || '—'}</td><td><strong>${x.deliveries}</strong></td><td>${number(x.km,2)} km</td><td>${fmtMinutes(x.minutes)}</td><td><div class="actions">${!c.returnTime?`<button class="btn primary small" data-action="close-cycle" data-id="${c.id}">Registrar retorno</button>`:''}<button class="btn secondary small" data-action="manage-cycle-deliveries" data-id="${c.id}">Gerenciar entregas</button><button class="btn secondary small" data-action="edit-cycle" data-id="${c.id}">Ajustar</button><button class="btn danger small" data-action="delete-record" data-type="cycle" data-id="${c.id}">Apagar</button></div></td>
    </tr>`; }).join('')}</tbody></table></div>`;
  }
  function cycleMiniTable(list) {
    if (!list.length) return emptyState('↻','Nenhum ciclo hoje','Monte a primeira saída selecionando as entregas que irão juntas.');
    return `<div class="stat-list">${list.slice(0,6).map(c => { const x=cycleCalc(c); return statRow(c.code, `${x.deliveries} entrega(s) levada(s)`, `${c.returnTime?'Fechado':'Em rota'} • ${number(x.km,2)} km médios/ciclo • ${fmtMinutes(x.minutes)}`); }).join('')}</div>`;
  }
  function renderOdometer() {
    const logs = filteredOdometers().slice().sort((a,b) => `${b.date}${vehicle(b.vehicleId)?.name||''}`.localeCompare(`${a.date}${vehicle(a.vehicleId)?.name||''}`));
    const cycles = filteredCycles();
    const deliveries = filteredDeliveries().filter(d=>d.status==='Finalizada');
    const totalKm = totalKmFromOdometers(logs);
    const days = unique(logs.filter(o=>odometerCalc(o).complete).map(o=>o.date)).length || 1;
    $('#view').innerHTML = `
      <section class="hero-strip mileage-hero">
        <div><h2>Quilometragem real da frota</h2><p>Informe somente KM inicial e final de cada veículo por dia. O sistema calcula dia, semana, mês, ano e médias automaticamente.</p></div>
        <div class="hero-meta"><span class="hero-chip">${number(totalKm,1)} km no período</span><span class="hero-chip">${logs.filter(o=>odometerCalc(o).complete).length} fechamentos</span></div>
      </section>
      <section class="metrics-grid">
        ${cardMetric('KM total',`${number(totalKm,1)} km`,'Soma dos fechamentos diários','KM','blue')}
        ${cardMetric('KM médio por dia',`${number(totalKm/days,1)} km`,`${days} dias fechados`,'↗','green')}
        ${cardMetric('KM médio por ciclo',`${number(cycles.length?totalKm/cycles.length:0,2)} km`,`${cycles.length} ciclos`,'↻','purple')}
        ${cardMetric('KM por entrega',`${number(deliveries.length?totalKm/deliveries.length:0,2)} km`,`${deliveries.length} finalizadas`,'▣','yellow')}
        ${cardMetric('Fechamentos pendentes',logs.filter(o=>!odometerCalc(o).complete).length,'KM final ainda não informado','!','red')}
      </section>
      <section class="dashboard-grid equal">
        <article class="card section-card">${sectionHeader('▥','KM por dia','Evolução da quilometragem no período.')}<div class="chart-box small">${lineChartHTML(groupOdometerKmByDate(logs),'#2E73B9')}</div></article>
        <article class="card section-card">${sectionHeader('KM','KM por veículo','Comparação da quilometragem total por veículo.')}<div class="chart-box small">${horizontalBarChartHTML(groupOdometerKmByVehicle(logs),'#2EA8A1')}</div></article>
      </section>
      <article class="card section-card" style="margin-top:12px">${sectionHeader('KM','Histórico de KM diário','Um registro por veículo e por dia. Nunca é necessário informar KM em cada ciclo.', `<button class="btn primary small" data-action="new-odometer">＋ Registrar KM do dia</button>`)}${odometerTable(logs)}</article>
    `;
    bindViewActions();
  }

  function groupOdometerKmByDate(logs) {
    const map = {};
    logs.forEach(o => map[o.date] = (map[o.date] || 0) + odometerCalc(o).km);
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({label:dateBR(date).slice(0,5),value}));
  }
  function groupOdometerKmByVehicle(logs) {
    const map = {};
    logs.forEach(o => { const name=vehicle(o.vehicleId)?.name||'Sem veículo'; map[name]=(map[name]||0)+odometerCalc(o).km; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));
  }
  function odometerTable(logs) {
    if (!logs.length) return emptyState('KM','Nenhum KM diário registrado','Comece informando o KM inicial de um veículo no início do dia.');
    return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Veículo</th><th>KM inicial</th><th>KM final</th><th>KM rodado</th><th>Ciclos</th><th>Entregas</th><th>Ent./ciclo</th><th>KM/ciclo</th><th>Status</th><th>Ação</th></tr></thead><tbody>${logs.map(o=>{const s=vehicleDayStats(o.date,o.vehicleId);const calc=odometerCalc(o);return `<tr>
      <td>${dateBR(o.date)}</td><td><div class="cell-title">${esc(vehicle(o.vehicleId)?.name||'—')}</div></td><td>${number(o.kmStart,1)}</td><td>${o.kmEnd?number(o.kmEnd,1):'—'}</td><td><strong>${number(calc.km,1)} km</strong></td><td>${s.cycles}</td><td>${s.deliveries}</td><td>${number(s.deliveriesPerCycle,2)}</td><td>${number(s.kmPerCycle,2)} km</td><td>${calc.invalid?'<span class="badge red">KM inválido</span>':calc.complete?'<span class="badge green">Fechado</span>':'<span class="badge yellow">Aberto</span>'}</td><td><button class="btn secondary small" data-action="edit-odometer" data-id="${o.id}">Editar</button><button class="btn danger small" data-action="delete-record" data-type="odometer" data-id="${o.id}">Apagar</button></td>
    </tr>`}).join('')}</tbody></table></div>`;
  }

  function odometerDayCards(date) {
    const activeVehicles=state.vehicles.filter(v=>v.active);
    if(!activeVehicles.length) return emptyState('KM','Nenhum veículo ativo','Cadastre um veículo em Cadastros.');
    return `<div class="odometer-card-grid">${activeVehicles.map(v=>{const s=vehicleDayStats(date,v.id),o=s.log,calc=odometerCalc(o),hasMovement=s.cycles>0||s.deliveries>0;let actionLabel='Abrir expediente • KM inicial';if(o&&!calc.complete)actionLabel='Fechar expediente • KM final';if(calc.complete)actionLabel='Editar fechamento';return `<article class="odometer-vehicle-card ${calc.complete?'closed':hasMovement?'needs-close':''}">
      <div class="odometer-card-head"><div><span>VEÍCULO</span><strong>${esc(v.name)}</strong><small>${esc([v.plate,v.type].filter(Boolean).join(' • ')||'Quilometragem diária')}</small></div>${calc.complete?'<span class="badge green">Expediente fechado</span>':o?'<span class="badge yellow">KM final pendente</span>':hasMovement?'<span class="badge red">KM inicial ausente</span>':'<span class="badge blue">Aguardando início</span>'}</div>
      <div class="odometer-main"><div><small>KM inicial do expediente</small><strong>${o?.kmStart?number(o.kmStart,1):'—'}</strong></div><div class="odometer-arrow">→</div><div><small>KM final do expediente</small><strong>${o?.kmEnd?number(o.kmEnd,1):'—'}</strong></div><div class="odometer-total"><small>TOTAL RODADO NO DIA</small><strong>${number(s.km,1)} km</strong></div></div>
      <div class="odometer-stats"><div><span>Ciclos</span><strong>${s.cycles}</strong></div><div><span>Entregas levadas</span><strong>${s.deliveries}</strong></div><div><span>Ent./ciclo</span><strong>${number(s.deliveriesPerCycle,2)}</strong></div><div><span>KM/ciclo</span><strong>${number(s.kmPerCycle,2)}</strong></div><div><span>KM/entrega</span><strong>${number(s.kmPerDelivery,2)}</strong></div></div>
      <button class="btn ${o?'secondary':'primary'} small odometer-card-action" data-action="${o?'edit-odometer':'new-odometer'}" ${o?`data-id="${o.id}"`:`data-vehicle-id="${v.id}"`}>${actionLabel}</button>
    </article>`}).join('')}</div>`;
  }
  function renderCosts() {
    const list = filteredCosts().slice().sort((a,b) => `${b.date}${b.time||''}`.localeCompare(`${a.date}${a.time||''}`));
    const deliveries = filteredDeliveries().filter(d=>d.status==='Finalizada');
    const cycles = filteredCycles();
    const odometers = filteredOdometers();
    const total = sum(list.map(c=>c.value));
    const fuel = sum(list.filter(c=>category(c.categoryId)?.name==='Combustível').map(c=>c.value));
    const maintenance = sum(list.filter(c=>/Manutenção/i.test(category(c.categoryId)?.name||'')).map(c=>c.value));
    const totalKm = totalKmFromOdometers(odometers);
    $('#view').innerHTML = `
      <section class="metrics-grid">
        ${cardMetric('Custos totais',money(total),`${list.length} registros`,'R$','red')}
        ${cardMetric('Combustível',money(fuel),`${money(deliveries.length?fuel/deliveries.length:0)} por entrega`,'⛽','yellow')}
        ${cardMetric('Manutenção',money(maintenance),'Preventiva + corretiva','M','purple')}
        ${cardMetric('Custo por entrega',money(deliveries.length?total/deliveries.length:0),'Média do período','CE','blue')}
        ${cardMetric('Custo por KM',money(totalKm?total/totalKm:0),`${number(totalKm,1)} km registrados`,'KM','green')}
      </section>
      <section class="dashboard-grid equal">
        <article class="card section-card">${sectionHeader('◉','Custos por categoria','Distribuição de todos os gastos registrados.')}<div class="chart-box small">${donutChartHTML(buildCostCategoryRows(list))}</div></article>
        <article class="card section-card">${sectionHeader('▥','Custos por dia','Evolução dos gastos no período.')}<div class="chart-box small">${lineChartHTML(groupSumByDate(list,'value'),'#D95C5C')}</div></article>
      </section>
      <article class="card section-card" style="margin-top:12px">${sectionHeader('R$','Histórico detalhado de custos','Cada gasto fica registrado com data, veículo, categoria, descrição, valor e responsável.', `<button class="btn primary small" data-action="new-cost">＋ Registrar custo</button>`)}${costTable(list)}</article>
    `;
    bindViewActions();
  }

  function costTable(list) {
    if (!list.length) return emptyState('R$','Nenhum custo registrado','Registre combustível, manutenção ou outro gasto da frota.');
    return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Veículo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>KM atual</th><th>Fornecedor</th><th>Ação</th></tr></thead><tbody>${list.map(c => `<tr>
      <td><div class="cell-title">${dateBR(c.date)}</div><div class="cell-sub">${c.time || ''}</div></td>
      <td>${esc(vehicle(c.vehicleId)?.name || '—')}</td>
      <td><span class="badge blue">${esc(category(c.categoryId)?.name || '—')}</span></td>
      <td><div class="cell-title">${esc(c.description || '—')}</div><div class="cell-sub">${esc(c.receiptNo ? `Comprovante ${c.receiptNo}`:'')}</div></td>
      <td><div class="cell-title">${money(c.value)}</div></td>
      <td>${c.km ? `${number(c.km,0)} km`:'—'}</td>
      <td>${esc(c.supplier || '—')}</td>
      <td><button class="btn secondary small" data-action="edit-cost" data-id="${c.id}">Editar</button><button class="btn danger small" data-action="delete-record" data-type="cost" data-id="${c.id}">Apagar</button></td>
    </tr>`).join('')}</tbody></table></div>`;
  }

  function costMiniTable(list) {
    if (!list.length) return emptyState('R$','Nenhum custo hoje','Registre combustível, manutenção ou outros gastos.');
    return `<div class="stat-list">${list.slice(0,6).map(c => statRow(category(c.categoryId)?.name || 'Custo', money(c.value), `${vehicle(c.vehicleId)?.name || 'Sem veículo'} • ${c.description || ''}`)).join('')}</div>`;
  }

  function renderNeighborhoods() {
    const deliveries = filteredDeliveries();
    const rows = buildNeighborhoodRows(deliveries);
    const topDelivery = rows[0];
    const topRevenue = [...rows].sort((a,b)=>b.revenue-a.revenue)[0];
    const topWrong = [...rows].sort((a,b)=>b.wrongAddress-a.wrongAddress)[0];
    const topScheduled = [...rows].sort((a,b)=>b.scheduled-a.scheduled)[0];
    const topRescheduled = [...rows].sort((a,b)=>b.rescheduled-a.rescheduled)[0];
    $('#view').innerHTML = `
      <section class="metrics-grid">
        ${cardMetric('Mais entregas',topDelivery?.name || '—',topDelivery ? `${topDelivery.deliveries} entregas`:'Sem dados','1º','blue')}
        ${cardMetric('Maior faturamento',topRevenue?.name || '—',topRevenue ? money(topRevenue.revenue):'Sem dados','R$','green')}
        ${cardMetric('Mais endereço errado',topWrong?.name || '—',topWrong ? `${topWrong.wrongAddress} ocorrências`:'Sem dados','!','red')}
        ${cardMetric('Mais agendamentos',topScheduled?.name || '—',topScheduled ? `${topScheduled.scheduled} agendadas`:'Sem dados','◷','purple')}
        ${cardMetric('Mais reagendamentos',topRescheduled?.name || '—',topRescheduled ? `${topRescheduled.rescheduled} reagendadas`:'Sem dados','↻','yellow')}
      </section>
      <section class="dashboard-grid equal">
        <article class="card section-card">${sectionHeader('◎','Top bairros por entregas','Quantidade de entregas finalizadas.')}<div class="chart-box">${horizontalBarChartHTML(rows.slice(0,10).map(r=>({label:r.name,value:r.deliveries})),'#2E73B9')}</div></article>
        <article class="card section-card">${sectionHeader('!','Problemas por bairro','Endereço errado, devolução, agendamento e reagendamento.')}<div class="chart-box">${problemNeighborhoodChartHTML(rows.slice().sort((a,b)=>b.problemCount-a.problemCount).slice(0,8))}</div></article>
      </section>
      <article class="card section-card" style="margin-top:12px">${sectionHeader('▤','Tabela completa por bairro','Compare volume, faturamento, qualidade e taxa de problemas.')}${neighborhoodTable(rows)}</article>
    `;
  }

  function buildNeighborhoodRows(deliveries) {
    return state.neighborhoods.map(n => {
      const all = deliveries.filter(d => d.neighborhoodId === n.id);
      const final = all.filter(d => d.status === 'Finalizada');
      const purchases = all.filter(isRootPurchase);
      const devolutions = all.filter(d => d.status === 'Devolvida').length;
      const wrongAddress = all.filter(d => d.reasonId === 'ENDERECO_ERRADO').length;
      const scheduled = all.filter(d => d.scheduledDate && (d.scheduleKind || 'Programada') === 'Programada').length;
      const rescheduled = all.filter(d => d.scheduledDate && d.scheduleKind === 'Reagendada').length;
      const delayed = all.filter(d => deliveryCalc(d).delayed).length;
      const problemCount = devolutions + wrongAddress + rescheduled + delayed;
      return {
        id:n.id,name:n.name,
        deliveries:final.length,
        revenue:sum(purchases.map(d=>Number(d.fee||0)-Number(d.refundAmount||0))),
        devolutions, wrongAddress, scheduled, rescheduled, delayed, problemCount,
        totalRecords:all.length,
        returnRate:all.length ? devolutions/all.length*100 : 0,
        problemRate:all.length ? problemCount/all.length*100 : 0,
        avgWait:avg(all.map(d=>deliveryCalc(d).wait)),
        avgRoute:avg(all.map(d=>deliveryCalc(d).route))
      };
    }).filter(r => r.totalRecords > 0).sort((a,b)=>b.deliveries-a.deliveries);
  }

  function neighborhoodTable(rows) {
    if (!rows.length) return emptyState('◎','Sem dados de bairros','As análises serão criadas automaticamente a partir das entregas.');
    return `<div class="table-wrap"><table><thead><tr><th>Bairro</th><th>Entregas</th><th>Faturamento</th><th>End. errado</th><th>Agendadas</th><th>Reagendadas</th><th>Devoluções</th><th>Atrasadas</th><th>Taxa devolução</th><th>Taxa problemas</th></tr></thead><tbody>${rows.map(r=>`<tr>
      <td><div class="cell-title">${esc(r.name)}</div></td><td>${r.deliveries}</td><td>${money(r.revenue)}</td><td>${r.wrongAddress}</td><td>${r.scheduled}</td><td>${r.rescheduled}</td><td>${r.devolutions}</td><td>${r.delayed}</td><td>${number(r.returnRate,1)}%</td><td>${number(r.problemRate,1)}%</td>
    </tr>`).join('')}</tbody></table></div>`;
  }

  function renderTrace() {
    $('#view').innerHTML = `<article class="card section-card">${sectionHeader('⌕','Rastrear cupom','Digite o número do cupom para visualizar a linha do tempo completa.')}
      <div class="trace-search"><input id="traceInput" placeholder="Ex.: 45879" inputmode="numeric" /><button class="btn primary" id="traceButton">Pesquisar</button></div>
      <div id="traceResult"></div>
    </article>`;
    $('#traceButton').addEventListener('click', () => showTrace($('#traceInput').value.trim()));
    $('#traceInput').addEventListener('keydown', e => { if(e.key==='Enter') showTrace(e.target.value.trim()); });
  }

  function showTrace(coupon) {
    const box = $('#traceResult');
    const list = scoped(state.deliveries).filter(d => String(d.coupon || '').trim() === coupon).sort((a,b)=>`${a.date}${a.purchaseTime||''}`.localeCompare(`${b.date}${b.purchaseTime||''}`));
    if (!coupon || !list.length) { box.innerHTML = emptyState('⌕','Cupom não encontrado','Verifique o número informado e tente novamente.'); return; }
    const rootIds = unique(list.map(d=>d.rootId || d.id));
    const chain = scoped(state.deliveries).filter(d => rootIds.includes(d.rootId || d.id) || list.some(x=>x.id===d.id)).sort((a,b)=>`${a.date}${a.purchaseTime||''}`.localeCompare(`${b.date}${b.purchaseTime||''}`));
    const final = chain.filter(d=>d.status==='Finalizada');
    const reSchedules = chain.filter(d=>d.scheduleKind==='Reagendada' && d.scheduledDate).length;
    box.innerHTML = `
      <section class="metrics-grid" style="margin-top:16px">
        ${cardMetric('Registros',chain.length,'Histórico completo','▣','blue')}
        ${cardMetric('Reagendamentos',reSchedules,'Mudanças de data','↻','yellow')}
        ${cardMetric('Situação atual',chain.at(-1)?.status || '—','Último registro','•','purple')}
        ${cardMetric('Faturamento líquido',money(netRevenueOfRoot(chain[0])),'Registrado na compra original','R$','green')}
        ${cardMetric('Bairro',neighborhood(chain[0]?.neighborhoodId)?.name || '—','Origem','◎','blue')}
      </section>
      <div class="trace-timeline">${chain.map(d=>{const c=deliveryCalc(d); return `<div class="trace-event"><strong>${dateBR(d.date)} • ${esc(d.status)}</strong><p>Entrada ${d.purchaseTime||'—'} • Saída ${d.departureTime||'—'} • Finalização ${d.finalizationTime||'—'} • Retorno ${d.returnTime||'—'}<br>Espera ${fmtMinutes(c.wait)} • Até cliente ${fmtMinutes(c.toClient)} • Rota ${fmtMinutes(c.route)}${d.scheduledDate?`<br>${esc(d.scheduleKind||'Programada')} para ${dateBR(d.scheduledDate)} • ${esc(reason(d.reasonId)?.name || d.reasonText || '')}`:''}</p></div>`}).join('')}</div>`;
  }

  function renderReports() {
    const years = availableYears();
    $('#view').innerHTML = `
      <section class="two-column">
        <article class="card section-card">
          ${sectionHeader('⇩','Gerar relatório em Excel','Escolha o recorte e baixe um arquivo compatível com Excel, com várias abas.')}
          <div class="form-grid" id="reportForm">
            <label>Tipo de período<select id="reportType"><option value="day">Dia</option><option value="week">Semana</option><option value="month">Mês</option><option value="year">Ano</option><option value="custom">Período personalizado</option></select></label>
            <label>Data de referência<input id="reportRef" type="date" value="${todayISO()}" /></label>
            <label>Ano<select id="reportYear">${years.map(y=>`<option value="${y}">${y}</option>`).join('')}</select></label>
            <label>Mês<select id="reportMonth">${monthNames.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('')}</select></label>
            <label>De<input id="reportStart" type="date" /></label>
            <label>Até<input id="reportEnd" type="date" /></label>
            <div class="full form-note">O relatório traz resumo executivo, entregas, custos, ciclos, veículos, colaboradores, bairros, programadas, pendências e histórico.</div>
            <div class="full form-actions"><button class="btn secondary" id="printReportBtn">Imprimir / PDF</button><button class="btn primary" id="exportExcelBtn">⇩ Baixar Excel</button></div>
          </div>
        </article>
        <article class="card section-card">
          ${sectionHeader('▤','Abas do relatório','Estrutura pronta para análise e auditoria.')}
          <div class="stat-list">
            ${['RESUMO_EXECUTIVO','ENTREGAS','CUSTOS','CICLOS','ODOMETRO_DIARIO','VEICULOS','COLABORADORES','BAIRROS','PROGRAMADAS','PENDENCIAS','HISTORICO'].map(name=>statRow(name,'Incluída','Gerada automaticamente')).join('')}
          </div>
        </article>
      </section>
    `;
    $('#reportMonth').value = String(new Date().getMonth()+1).padStart(2,'0');
    $('#reportYear').value = String(new Date().getFullYear());
    $('#exportExcelBtn').addEventListener('click', exportExcelReport);
    $('#printReportBtn').addEventListener('click', printReport);
  }

  function availableYears() {
    const years = new Set([new Date().getFullYear(), new Date().getFullYear()+1]);
    [...scoped(state.deliveries),...scoped(state.costs),...scoped(state.cycles),...scoped(state.odometerLogs)].forEach(x=>x.date && years.add(Number(x.date.slice(0,4))));
    return [...years].sort((a,b)=>b-a);
  }

  function reportRangeFromForm() {
    const type = $('#reportType').value;
    const ref = $('#reportRef').value || todayISO();
    const year = $('#reportYear').value;
    const month = $('#reportMonth').value;
    if (type === 'day') return {start:ref,end:ref,label:ref};
    if (type === 'week') return {start:startOfWeek(ref),end:endOfWeek(ref),label:`semana_${startOfWeek(ref)}`};
    if (type === 'month') { const last=new Date(Number(year),Number(month),0).getDate(); return {start:`${year}-${month}-01`,end:`${year}-${month}-${String(last).padStart(2,'0')}`,label:`${year}_${month}`}; }
    if (type === 'year') return {start:`${year}-01-01`,end:`${year}-12-31`,label:year};
    return {start:$('#reportStart').value || '0000-01-01',end:$('#reportEnd').value || '9999-12-31',label:'personalizado'};
  }


  function renderTrash() {
    const items = state.trash.filter(x => (x.mode || 'production') === currentMode()).slice().sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)));
    $('#view').innerHTML = `<section class="trash-hero"><div><span class="eyebrow">SEGURANÇA E CORREÇÃO</span><h2>Lixeira de registros</h2><p>Apagou algo por engano? Restaure aqui. Entregas, ciclos, custos e KM vão primeiro para a lixeira.</p></div><div class="hero-meta"><span class="hero-chip">${items.length} item(ns)</span><span class="hero-chip">${esc(modeLabel())}</span></div></section><article class="card section-card" style="margin-top:14px">${sectionHeader('⌫','Itens apagados','A lixeira é separada entre operação real e treinamento.', items.length ? `<button class="btn danger small" data-trash-action="empty">Esvaziar lixeira deste ambiente</button>` : '')}${trashTable(items)}</article>`;
    $$('[data-trash-action="restore"]').forEach(b=>b.addEventListener('click',()=>restoreTrashItem(b.dataset.id)));
    $$('[data-trash-action="permanent"]').forEach(b=>b.addEventListener('click',()=>permanentDeleteTrashItem(b.dataset.id)));
    $('[data-trash-action="empty"]')?.addEventListener('click',emptyTrashCurrentMode);
  }
  function trashTable(items) {
    if (!items.length) return emptyState('✓','Lixeira vazia','Nenhum registro apagado neste ambiente.');
    return `<div class="trash-list">${items.map(item=>`<article class="trash-item"><div class="trash-type">${trashTypeLabel(item.recordType)}</div><div class="trash-copy"><strong>${esc(item.label||'Registro')}</strong><small>Apagado em ${dateTimeBR(item.deletedAt)} • ${item.mode==='training'?'Treinamento':'Operação real'}</small></div><div class="actions"><button class="btn secondary small" data-trash-action="restore" data-id="${item.id}">Restaurar</button><button class="btn danger small" data-trash-action="permanent" data-id="${item.id}">Excluir definitivamente</button></div></article>`).join('')}</div>`;
  }
  function trashTypeLabel(type) { return ({delivery_bundle:'ENTREGA',cycle:'CICLO',cost:'CUSTO',odometer:'KM'})[type] || 'REGISTRO'; }
  async function moveToTrash(recordType, payload, label, context={}) {
    state.trash.unshift({id:uid('trash'),recordType,label,deletedAt:nowISO(),mode:currentMode(),payload:cloneData(payload),context:cloneData(context)});
    if(state.trash.length>1500) state.trash=state.trash.slice(0,1500);
  }
  async function deleteRecord(type,id) {
    if(type==='delivery') return deleteDelivery(id);
    if(type==='cost') {
      const item=scoped(state.costs).find(x=>x.id===id); if(!item)return;
      if(!confirm(`Apagar o custo “${item.description||'sem descrição'}” de ${money(item.value)}?`)) return;
      await moveToTrash('cost',item,`Custo • ${item.description||money(item.value)}`); state.costs=state.costs.filter(x=>x.id!==id);
    } else if(type==='odometer') {
      const item=scoped(state.odometerLogs).find(x=>x.id===id); if(!item)return;
      if(!confirm(`Apagar o registro de KM de ${vehicle(item.vehicleId)?.name||'veículo'} em ${dateBR(item.date)}?`)) return;
      await moveToTrash('odometer',item,`KM • ${vehicle(item.vehicleId)?.name||'Veículo'} • ${dateBR(item.date)}`); state.odometerLogs=state.odometerLogs.filter(x=>x.id!==id);
    } else if(type==='cycle') {
      const item=scoped(state.cycles).find(x=>x.id===id); if(!item)return;
      const linked=scoped(state.deliveries).filter(d=>d.cycleId===id);
      if(!confirm(`Apagar o ciclo ${item.code} e devolver ${linked.length} entrega(s) para fora do ciclo?`)) return;
      await moveToTrash('cycle',item,`Ciclo • ${item.code}`,{linkedDeliveries:linked});
      linked.forEach(d=>{ d.cycleId=''; if(d.departureTime===item.departureTime)d.departureTime=''; if(d.returnTime===item.returnTime)d.returnTime=''; if(d.vehicleId===item.vehicleId)d.vehicleId=''; if(d.driverId===item.driverId)d.driverId=''; if(d.status==='Em rota')d.status='Na loja'; d.updatedAt=nowISO(); });
      state.cycles=state.cycles.filter(x=>x.id!==id);
    }
    await saveState(`${type} apagado e enviado para lixeira`); toast('Registro apagado. Você pode restaurá-lo na Lixeira.','success'); render();
  }
  async function restoreTrashItem(trashId) {
    const item=state.trash.find(x=>x.id===trashId); if(!item)return;
    if(item.recordType==='cost' && !state.costs.some(x=>x.id===item.payload.id)) state.costs.push(item.payload);
    if(item.recordType==='odometer' && !state.odometerLogs.some(x=>x.id===item.payload.id)) state.odometerLogs.push(item.payload);
    if(item.recordType==='delivery_bundle') for(const d of item.payload){ if(!state.deliveries.some(x=>x.id===d.id)) state.deliveries.push(d); }
    if(item.recordType==='cycle') { if(!state.cycles.some(x=>x.id===item.payload.id)) state.cycles.push(item.payload); for(const saved of (item.context?.linkedDeliveries||[])){ const d=state.deliveries.find(x=>x.id===saved.id); if(d) Object.assign(d,saved); } }
    state.trash=state.trash.filter(x=>x.id!==trashId); await saveState(`${item.label} restaurado da lixeira`); toast('Registro restaurado.','success'); render();
  }
  async function permanentDeleteTrashItem(trashId) { const item=state.trash.find(x=>x.id===trashId); if(!item)return; if(!confirm(`Excluir definitivamente “${item.label}”? Esta ação não pode ser desfeita.`))return; state.trash=state.trash.filter(x=>x.id!==trashId); await saveState(`${item.label} excluído definitivamente`); render(); }
  async function emptyTrashCurrentMode() { if(!confirm(`Esvaziar definitivamente a lixeira de ${modeLabel()}?`))return; state.trash=state.trash.filter(x=>(x.mode||'production')!==currentMode()); await saveState(`Lixeira de ${modeLabel()} esvaziada`); render(); }
  async function seedTrainingData() {
    if(currentMode()!=='training')return;
    const existing=scoped(state.deliveries).length+scoped(state.cycles).length+scoped(state.costs).length;
    if(existing && !confirm('Já existem dados de treinamento. Adicionar mais exemplos?'))return;
    const veh=state.vehicles.find(v=>v.active), emp=state.employees.find(e=>e.active), nbs=state.neighborhoods.filter(n=>n.active);
    if(!veh || !emp || !nbs.length){toast('Cadastre ao menos 1 veículo, 1 colaborador e 1 bairro.','warning');return;}
    const dates=[0,1,2,3].map(back=>{const d=new Date();d.setDate(d.getDate()-back);return localDateISO(d)}), created=[];
    for(let i=0;i<10;i++){ const date=dates[i%dates.length], fee=i%3===0?9.99:6.99, nb=nbs[i%nbs.length]; const d={id:uid('del'),rootId:'',parentId:'',attemptNo:1,date,orderNo:String(i+1),coupon:`TREINO-${String(i+1).padStart(3,'0')}`,purchaseTime:`${String(9+(i%7)).padStart(2,'0')}:${i%2?'20':'05'}`,neighborhoodId:nb.id,fee,driverId:'',vehicleId:'',cycleId:'',departureTime:'',finalizationTime:'',returnTime:'',status:'Na loja',scheduledDate:'',scheduleKind:'',reasonId:'',reasonText:'',nextAction:'',notes:'Registro criado automaticamente para treinamento.',refundAmount:0,refundDate:'',withdrawalDate:'',withdrawalTime:'',createdAt:nowISO(),updatedAt:nowISO(),mode:'training',history:[]}; d.rootId=d.id; if(i===7){d.status='Programada';d.scheduledDate=dates[0];d.scheduleKind='Programada';} if(i===8){d.status='Devolvida';d.reasonId='ENDERECO_ERRADO';} state.deliveries.push(d);created.push(d); }
    const cycleDeliveries=created.slice(0,3), c={id:uid('cyc'),code:'CIC-TREINO-001',date:dates[0],vehicleId:veh.id,driverId:emp.id,departureTime:'09:30',returnTime:'10:40',notes:'Ciclo de treinamento.',createdAt:nowISO(),updatedAt:nowISO(),mode:'training'}; state.cycles.push(c); cycleDeliveries.forEach((d,idx)=>{d.cycleId=c.id;d.vehicleId=veh.id;d.driverId=emp.id;d.departureTime='09:30';d.finalizationTime=`10:${String(5+idx*8).padStart(2,'0')}`;d.returnTime='10:40';d.status='Finalizada';});
    state.odometerLogs.push({id:uid('odo'),date:dates[0],vehicleId:veh.id,kmStart:10000,kmEnd:10038,notes:'Treinamento',createdAt:nowISO(),updatedAt:nowISO(),mode:'training'});
    const fuel=state.costCategories.find(x=>x.name==='Combustível'); state.costs.push({id:uid('cost'),date:dates[0],time:'11:00',vehicleId:veh.id,categoryId:fuel?.id||'',description:'Abastecimento de treinamento',value:80,km:10038,supplier:'Posto Exemplo',receiptNo:'TREINO',responsibleId:emp.id,notes:'Dado de treinamento.',createdAt:nowISO(),updatedAt:nowISO(),mode:'training'});
    await saveState('Dados de treinamento de exemplo criados'); toast('Dados de treinamento criados.','success'); render();
  }
  async function clearTrainingData() { if(currentMode()!=='training')return; if(!confirm('Apagar TODOS os dados de treinamento? A operação real não será afetada.'))return; for(const key of ['deliveries','cycles','odometerLogs','costs']) state[key]=state[key].filter(x=>(x.mode||'production')!=='training'); state.trash=state.trash.filter(x=>(x.mode||'production')!=='training'); await saveState('Dados de treinamento limpos'); toast('Treinamento limpo.','success'); render(); }

  function renderSettings() {
    const tabs = [
      ['vehicles','Veículos'],['neighborhoods','Bairros'],['employees','Colaboradores'],['costCategories','Categorias de custo'],['reasons','Motivos'],['rules','Regras'],['data','Dados']
    ];
    $('#view').innerHTML = `
      <div class="settings-tabs">${tabs.map(([id,label])=>`<button class="tab-btn ${configTab===id?'active':''}" data-config-tab="${id}">${label}</button>`).join('')}</div>
      <section class="settings-grid">
        <aside class="card settings-side">
          <h3>Cadastros mestres</h3><p>Itens desativados deixam de aparecer em novos lançamentos, mas continuam nos relatórios e no histórico.</p>
          <div class="settings-stat"><span>Veículos ativos</span><strong>${state.vehicles.filter(x=>x.active).length}</strong></div>
          <div class="settings-stat"><span>Bairros ativos</span><strong>${state.neighborhoods.filter(x=>x.active).length}</strong></div>
          <div class="settings-stat"><span>Colaboradores ativos</span><strong>${state.employees.filter(x=>x.active).length}</strong></div>
          <div class="settings-stat"><span>Entregas registradas</span><strong>${scoped(state.deliveries).length}</strong></div>
        </aside>
        <article class="card section-card" id="settingsContent">${settingsContent()}</article>
      </section>
    `;
    $$('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{configTab=btn.dataset.configTab;renderSettings();}));
    bindSettingsActions();
  }

  function settingsContent() {
    if (configTab === 'rules') {
      return `${sectionHeader('⚙','Regras operacionais','Defina o expediente e o limite máximo de espera.')}
        <div class="form-grid">
          <label>Início expediente<input id="ruleWorkStart" type="time" value="${state.settings.workStart}" /></label>
          <label>Início almoço<input id="ruleLunchStart" type="time" value="${state.settings.lunchStart}" /></label>
          <label>Fim almoço<input id="ruleLunchEnd" type="time" value="${state.settings.lunchEnd}" /></label>
          <label>Fim expediente<input id="ruleWorkEnd" type="time" value="${state.settings.workEnd}" /></label>
          <label>Limite de atraso em minutos<input id="ruleDelay" type="number" min="1" value="${state.settings.delayMinutes}" /></label>
          <div class="full form-note">O atraso é calculado da hora da compra até a saída, contando apenas o expediente. O almoço não entra na conta.</div>
          <div class="full form-actions"><button class="btn primary" data-action="save-rules">Salvar regras</button></div>
        </div>`;
    }
    if (configTab === 'data') {
      return `${sectionHeader('⇩','Backup e restauração','Faça backup antes de trocar de aparelho ou limpar o navegador.')}
        <div class="form-note">Nesta versão, os dados ficam no IndexedDB do aparelho. O aplicativo funciona offline. Para compartilhar os mesmos dados entre vários dispositivos, será necessário conectar um banco central em uma próxima etapa.</div>
        <div class="form-actions" style="justify-content:flex-start"><button class="btn primary" data-action="backup-data">↓ Baixar backup JSON</button><label class="btn secondary">↑ Restaurar backup<input id="settingsRestoreInput" type="file" accept=".json" hidden /></label></div>`;
    }
    const map = {
      vehicles:{title:'Veículos',subtitle:'Adicione, edite, desative ou reative veículos sem perder histórico.',label:'veículo',arr:state.vehicles},
      neighborhoods:{title:'Bairros',subtitle:'Cadastre os bairros usados na operação e nos rankings.',label:'bairro',arr:state.neighborhoods},
      employees:{title:'Colaboradores',subtitle:'Entregadores, conferentes, gestores e outros responsáveis.',label:'colaborador',arr:state.employees},
      costCategories:{title:'Categorias de custo',subtitle:'Combustível, manutenção, pneus e outros tipos de gasto.',label:'categoria',arr:state.costCategories},
      reasons:{title:'Motivos padronizados',subtitle:'Padronize endereço errado, cliente ausente, recusa e outros problemas.',label:'motivo',arr:state.reasons}
    };
    const cfg = map[configTab];
    return `${sectionHeader('＋',cfg.title,cfg.subtitle,`<button class="btn primary small" data-action="new-config">＋ Adicionar ${cfg.label}</button>`)}${configTable(cfg.arr)}`;
  }

  function configTable(list) {
    return `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Detalhes</th><th>Status</th><th>Ações</th></tr></thead><tbody>${list.map(item=>`<tr>
      <td><div class="cell-title">${esc(item.name)}</div></td>
      <td>${configDetails(item)}</td>
      <td>${item.active ? '<span class="badge green">Ativo</span>':'<span class="badge gray">Inativo</span>'}</td>
      <td><div class="actions"><button class="btn secondary small" data-action="edit-config" data-id="${item.id}">Editar</button><button class="btn ${item.active?'danger':'secondary'} small" data-action="toggle-config" data-id="${item.id}">${item.active?'Desativar':'Reativar'}</button></div></td>
    </tr>`).join('')}</tbody></table></div>`;
  }
  function configDetails(item) {
    if (configTab==='vehicles') return esc([item.plate,item.type].filter(Boolean).join(' • ') || '—');
    if (configTab==='neighborhoods') return esc(item.region || '—');
    if (configTab==='employees') return esc(item.role || '—');
    return '—';
  }

  function bindViewActions() {
    $$('[data-action="new-delivery"]').forEach(b=>b.addEventListener('click',()=>openQuickDeliveryModal()));
    $$('[data-action="edit-delivery"]').forEach(b=>b.addEventListener('click',()=>openDeliveryModal(b.dataset.id)));

    $$('[data-action="quick-departure"]').forEach(b=>b.addEventListener('click',()=>quickDeparture(b.dataset.id)));
    $$('[data-action="quick-delivered"]').forEach(b=>b.addEventListener('click',()=>quickDelivered(b.dataset.id)));
    $$('[data-action="quick-return"]').forEach(b=>b.addEventListener('click',()=>quickReturn(b.dataset.id)));
    $$('[data-action="quick-reschedule"]').forEach(b=>b.addEventListener('click',()=>quickReschedule(b.dataset.id)));
    $$('[data-action="quick-pickup"]').forEach(b=>b.addEventListener('click',()=>quickPickup(b.dataset.id)));
    $$('[data-action="quick-devolution"]').forEach(b=>b.addEventListener('click',()=>quickDevolution(b.dataset.id)));
    $$('[data-action="trace-delivery"]').forEach(b=>b.addEventListener('click',()=>{navigate('trace');setTimeout(()=>{$('#traceInput').value=b.dataset.coupon;showTrace(b.dataset.coupon);},0);}));
    $$('[data-action="start-scheduled"]').forEach(b=>b.addEventListener('click',()=>startScheduledDelivery(b.dataset.id)));
    $$('[data-action="start-cycle"]').forEach(b=>b.addEventListener('click',()=>openCycleDepartureModal()));
    $$('[data-action="close-cycle"]').forEach(b=>b.addEventListener('click',()=>openCloseCycleModal(b.dataset.id)));
    $$('[data-action="new-cycle"]').forEach(b=>b.addEventListener('click',()=>openCycleDepartureModal()));
    $$('[data-action="edit-cycle"]').forEach(b=>b.addEventListener('click',()=>openCycleModal(b.dataset.id)));
    $$('[data-action="manage-cycle-deliveries"]').forEach(b=>b.addEventListener('click',()=>openManageCycleDeliveriesModal(b.dataset.id)));
    $$('[data-action="new-odometer"]').forEach(b=>b.addEventListener('click',()=>openOdometerModal('', b.dataset.vehicleId || '')));
    $$('[data-action="edit-odometer"]').forEach(b=>b.addEventListener('click',()=>openOdometerModal(b.dataset.id)));
    $$('[data-action="new-cost"]').forEach(b=>b.addEventListener('click',()=>openCostModal()));
    $$('[data-action="edit-cost"]').forEach(b=>b.addEventListener('click',()=>openCostModal(b.dataset.id)));
    $$('[data-action="delete-record"]').forEach(b=>b.addEventListener('click',()=>deleteRecord(b.dataset.type,b.dataset.id)));
    $$('[data-action="scroll-deliveries"]').forEach(b=>b.addEventListener('click',()=>$('#todayDeliveriesSection')?.scrollIntoView({behavior:'smooth',block:'start'})));
    $$('[data-action="scroll-cycles"]').forEach(b=>b.addEventListener('click',()=>$('#todayCyclesSection')?.scrollIntoView({behavior:'smooth',block:'start'})));
    $$('[data-action="scroll-odometer"]').forEach(b=>b.addEventListener('click',()=>$('#todayOdometerSection')?.scrollIntoView({behavior:'smooth',block:'start'})));
  }
  function bindSettingsActions() {
    $$('[data-action="new-config"]').forEach(b=>b.addEventListener('click',()=>openConfigModal()));
    $$('[data-action="edit-config"]').forEach(b=>b.addEventListener('click',()=>openConfigModal(b.dataset.id)));
    $$('[data-action="toggle-config"]').forEach(b=>b.addEventListener('click',()=>toggleConfig(b.dataset.id)));
    $$('[data-action="save-rules"]').forEach(b=>b.addEventListener('click',saveRules));
    $$('[data-action="backup-data"]').forEach(b=>b.addEventListener('click',downloadBackup));
    const input=$('#settingsRestoreInput'); if(input) input.addEventListener('change',e=>{if(e.target.files?.[0]) restoreBackup(e.target.files[0]);});
  }

  function openModal(title,subtitle,body,kicker='CADASTRO OPERACIONAL') {
    $('#modalKicker').textContent = kicker;
    $('#modalTitle').textContent = title;
    $('#modalSubtitle').textContent = subtitle || '';
    $('#modalBody').innerHTML = `<div class="modal-body">${body}</div>`;
    $('#modalWrap').classList.remove('hidden');
    document.body.style.overflow='hidden';
  }
  function closeModal() { $('#modalWrap').classList.add('hidden'); document.body.style.overflow=''; }

  function options(list, selected='', label='name') {
    return `<option value="">Selecione...</option>` + list.filter(x=>x.active || x.id===selected).map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(x[label])}</option>`).join('');
  }


  function openQuickDeliveryModal() {
    const today = todayISO();
    const time = currentTimeHM();
    openModal('Registrar compra','Só o essencial agora. Os demais dados são atualizados depois com botões rápidos.',`
      <form id="quickDeliveryForm" class="quick-entry-form">
        <div class="quick-entry-hero">
          <div><span>1</span><strong>Identifique a compra</strong><small>Faturamento da taxa entra no momento em que você salvar.</small></div>
        </div>
        <div class="quick-entry-grid">
          <label>Data da compra<input name="date" type="date" value="${today}" required /></label>
          <label>Nº da compra<input name="orderNo" placeholder="Ordem de chegada" /></label>
          <label>Cupom PDV<input name="coupon" inputmode="numeric" autofocus required placeholder="Ex.: 45879" /></label>
          <label>Hora da compra<input name="purchaseTime" type="time" value="${time}" required /></label>
          <label class="span-2">Bairro<select name="neighborhoodId" required>${options(state.neighborhoods,'')}</select></label>
        </div>

        <div class="quick-entry-block">
          <div class="quick-entry-title"><span>2</span><div><strong>Qual foi a taxa cobrada?</strong><small>Escolha uma opção.</small></div></div>
          <input type="hidden" name="fee" id="quickFee" value="" />
          <div class="choice-buttons" id="feeChoices">
            <button type="button" class="choice-btn" data-value="6.99">R$ 6,99</button>
            <button type="button" class="choice-btn" data-value="9.99">R$ 9,99</button>
            <button type="button" class="choice-btn" data-value="0">Sem taxa</button>
          </div>
        </div>

        <div class="quick-entry-block">
          <div class="quick-entry-title"><span>3</span><div><strong>Quando será entregue?</strong><small>Hoje ou em uma data específica.</small></div></div>
          <input type="hidden" name="deliveryMode" id="quickDeliveryMode" value="today" />
          <div class="choice-buttons" id="deliveryModeChoices">
            <button type="button" class="choice-btn selected" data-value="today">🚚 Entregar hoje</button>
            <button type="button" class="choice-btn" data-value="schedule">📅 Agendar outro dia</button>
          </div>
          <label id="quickScheduledDateWrap" class="quick-schedule-date hidden">Data programada<input name="scheduledDate" type="date" min="${today}" /></label>
        </div>

        <div class="finance-rule-note">💡 <strong>Regra financeira:</strong> a taxa entra no faturamento agora, ao registrar a compra. Se houver retirada na loja com reembolso, o app registra o reembolso separadamente.</div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelQuickDeliveryBtn">Cancelar</button><button type="submit" class="btn primary large-action">Registrar compra</button></div>
      </form>
    `,'LANÇAMENTO RÁPIDO');

    const feeButtons = $$('#feeChoices .choice-btn');
    feeButtons.forEach(btn=>btn.addEventListener('click',()=>{
      feeButtons.forEach(x=>x.classList.remove('selected')); btn.classList.add('selected'); $('#quickFee').value=btn.dataset.value;
    }));
    const modeButtons = $$('#deliveryModeChoices .choice-btn');
    modeButtons.forEach(btn=>btn.addEventListener('click',()=>{
      modeButtons.forEach(x=>x.classList.remove('selected')); btn.classList.add('selected'); $('#quickDeliveryMode').value=btn.dataset.value;
      $('#quickScheduledDateWrap').classList.toggle('hidden',btn.dataset.value!=='schedule');
    }));
    $('#cancelQuickDeliveryBtn').addEventListener('click',closeModal);
    $('#quickDeliveryForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const data=Object.fromEntries(new FormData(e.target).entries());
      if(data.fee===''){toast('Escolha a taxa de entrega.','warning');return;}
      if(data.deliveryMode==='schedule' && !data.scheduledDate){toast('Informe a data programada.','warning');return;}
      const id=uid('del');
      const scheduled=data.deliveryMode==='schedule';
      const d={
        id,rootId:id,parentId:'',attemptNo:1,date:data.date,orderNo:data.orderNo||'',coupon:data.coupon,purchaseTime:data.purchaseTime,
        neighborhoodId:data.neighborhoodId,fee:Number(data.fee||0),driverId:'',vehicleId:'',cycleId:'',departureTime:'',finalizationTime:'',returnTime:'',
        status:scheduled?'Programada':'Na loja',scheduledDate:scheduled?data.scheduledDate:'',scheduleKind:'Programada',reasonId:scheduled?'CLIENTE_OUTRO_DIA':'',reasonText:'',nextAction:scheduled?'Entregar na data programada':'',notes:'',
        refundAmount:0,refundDate:'',withdrawalDate:'',withdrawalTime:'',createdAt:nowISO(),updatedAt:nowISO(),mode:currentMode(),
        history:[{id:uid('evt'),type:'purchase_registered',at:nowISO(),fee:Number(data.fee||0)}]
      };
      if(scheduled)d.history.push({id:uid('evt'),type:'scheduled',from:d.date,to:d.scheduledDate,kind:'Programada',at:nowISO(),reasonId:d.reasonId});
      state.deliveries.push(d);
      await saveState(`Compra ${d.coupon} registrada`);
      closeModal();toast('Compra registrada. A taxa já entrou no faturamento.','success');render();
    });
  }

  function openDeliveryModal(id='') {
    if (!id) { openQuickDeliveryModal(); return; }
    const existing = id ? scoped(state.deliveries).find(d=>d.id===id) : null;
    const d = existing ? {...existing} : {
      id:uid('del'), rootId:'', parentId:'', attemptNo:1,
      date:todayISO(), orderNo:'', coupon:'', purchaseTime:'', neighborhoodId:'', fee:0,
      driverId:'', vehicleId:'', cycleId:'', departureTime:'', finalizationTime:'', returnTime:'',
      status:'Na loja', scheduledDate:'', scheduleKind:'Programada', reasonId:'', reasonText:'', nextAction:'', notes:'', refundAmount:0, refundDate:'', withdrawalDate:'', withdrawalTime:'', createdAt:nowISO(), updatedAt:nowISO(), mode:currentMode(), history:[]
    };
    if (!d.rootId) d.rootId = d.id;
    const calc = deliveryCalc(d);
    openModal(existing?'Editar entrega':'Nova entrega','Registre os horários reais para calcular espera, atraso, tempo até o cliente e tempo total de rota.',`
      <form id="deliveryForm">
        <input type="hidden" name="id" value="${d.id}" />
        <div class="form-section-title">Identificação da entrega</div>
        <div class="form-grid">
          <label>Data<input name="date" type="date" value="${d.date}" required /></label>
          <label>Nº da compra<input name="orderNo" value="${attr(d.orderNo)}" placeholder="Ordem de chegada" /></label>
          <label>Cupom PDV<input name="coupon" value="${attr(d.coupon)}" required /></label>
          <label>Hora da compra / entrada<input name="purchaseTime" type="time" value="${d.purchaseTime || ''}" /></label>
          <label>Bairro<select name="neighborhoodId">${options(state.neighborhoods,d.neighborhoodId)}</select></label>
          <label>Taxa de entrega<input name="fee" type="number" step="0.01" min="0" value="${Number(d.fee||0) || ''}" /></label>
          <label>Entregador<select name="driverId">${options(state.employees.filter(x=>x.role==='Entregador'||x.role==='Colaborador'),d.driverId)}</select></label>
          <label>Veículo<select name="vehicleId">${options(state.vehicles,d.vehicleId)}</select></label>
          <label>Ciclo<select name="cycleId">${options(scoped(state.cycles),d.cycleId,'code')}</select></label>
          <label>Status<select name="status">${statusOptions.map(s=>`<option value="${s}" ${d.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
        </div>

        <div class="form-section"><div class="form-section-title">Tempos da operação</div>
          <div class="form-grid">
            <label>Saída para entrega<input name="departureTime" type="time" value="${d.departureTime || ''}" /></label>
            <label>Finalização no cliente<input name="finalizationTime" type="time" value="${d.finalizationTime || ''}" /></label>
            <label>Retorno à loja<input name="returnTime" type="time" value="${d.returnTime || ''}" /></label>
            <div class="form-note">Espera atual: <strong>${fmtMinutes(calc.wait)}</strong><br>Até cliente: <strong>${fmtMinutes(calc.toClient)}</strong><br>Rota total: <strong>${fmtMinutes(calc.route)}</strong></div>
          </div>
        </div>



        <div class="form-section"><div class="form-section-title">Financeiro e retirada na loja</div>
          <div class="form-grid">
            <div class="form-note span-2">A taxa original de <strong>${money(rootDelivery(d)?.fee || d.fee)}</strong> foi contabilizada no registro da compra. Reagendamentos não geram nova receita.</div>
            <label>Valor reembolsado<input name="refundAmount" type="number" step="0.01" min="0" value="${Number(rootDelivery(d)?.refundAmount||0)||''}" /></label>
            <label>Data do reembolso<input name="refundDate" type="date" value="${rootDelivery(d)?.refundDate||''}" /></label>
          </div>
        </div>

        <div class="form-section"><div class="form-section-title">Programação, reagendamento e ocorrências</div>
          <div class="form-grid">
            <label>Data programada<input name="scheduledDate" type="date" value="${d.scheduledDate || ''}" /></label>
            <label>Tipo<select name="scheduleKind"><option value="Programada" ${d.scheduleKind==='Programada'?'selected':''}>Programada</option><option value="Reagendada" ${d.scheduleKind==='Reagendada'?'selected':''}>Reagendada</option></select></label>
            <label>Motivo padronizado<select name="reasonId">${options(state.reasons,d.reasonId)}</select></label>
            <label>Motivo complementar<input name="reasonText" value="${attr(d.reasonText)}" placeholder="Opcional" /></label>
            <label class="span-2">Próxima ação<input name="nextAction" value="${attr(d.nextAction)}" placeholder="Ex.: Reentregar amanhã" /></label>
            <label class="span-2">Observações<textarea name="notes">${esc(d.notes)}</textarea></label>
          </div>
        </div>
        <div class="form-actions">
          ${existing ? `<button type="button" class="btn danger" id="deleteDeliveryBtn">Apagar e enviar para Lixeira</button>`:''}
          <button type="button" class="btn secondary" id="cancelDeliveryBtn">Cancelar</button>
          <button type="submit" class="btn primary">Salvar entrega</button>
        </div>
      </form>
    `);
    $('#cancelDeliveryBtn').addEventListener('click',closeModal);
    if(existing) $('#deleteDeliveryBtn').addEventListener('click',()=>deleteDelivery(d.id));
    $('#deliveryForm').addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.fee = Number(data.fee || 0);
      data.refundAmount = Number(data.refundAmount || 0);
      const old = scoped(state.deliveries).find(x=>x.id===data.id);
      const root = old ? rootDelivery(old) : null;
      if (root && root.id !== old.id) { root.refundAmount = data.refundAmount; root.refundDate = data.refundDate || ''; data.refundAmount = Number(old.refundAmount||0); data.refundDate = old.refundDate||''; }
      data.rootId = old?.rootId || data.id;
      data.parentId = old?.parentId || '';
      data.attemptNo = old?.attemptNo || 1;
      data.createdAt = old?.createdAt || nowISO();
      data.updatedAt = nowISO();
      data.mode = old?.mode || currentMode();
      data.history = old?.history ? [...old.history] : [];
      if (old && old.scheduledDate !== data.scheduledDate && data.scheduledDate) {
        data.history.push({ id:uid('evt'), type:'schedule_change', from:old.scheduledDate || old.date, to:data.scheduledDate, kind:data.scheduleKind, at:nowISO(), reasonId:data.reasonId, reasonText:data.reasonText });
      } else if (!old && data.scheduledDate) {
        data.history.push({ id:uid('evt'), type:'scheduled', from:data.date, to:data.scheduledDate, kind:data.scheduleKind, at:nowISO(), reasonId:data.reasonId, reasonText:data.reasonText });
      }
      if (data.returnTime && !['Devolvida','Retirada na loja','Cancelada'].includes(data.status)) data.status='Finalizada';
      else if (data.departureTime && !data.returnTime && data.status==='Na loja') data.status='Em rota';
      if (data.scheduledDate && ['Na loja','Em rota','Devolvida'].includes(data.status)) data.status = data.scheduleKind || 'Programada';
      if (old) Object.assign(old,data); else state.deliveries.push(data);
      await saveState(old ? `Entrega ${data.coupon} editada` : `Entrega ${data.coupon} criada`);
      closeModal(); toast('Entrega salva com sucesso.','success'); render();
    });
  }

  async function deleteDelivery(id) {
    const d=scoped(state.deliveries).find(x=>x.id===id); if(!d)return;
    const descendants=[]; const walk=(parentId)=>{scoped(state.deliveries).filter(x=>x.parentId===parentId).forEach(x=>{descendants.push(x);walk(x.id);});}; walk(d.id);
    const bundle=[d,...descendants];
    const message=descendants.length ? `Apagar esta entrega e também ${descendants.length} tentativa(s) ligada(s) a ela? Tudo irá para a Lixeira.` : 'Apagar este registro? Ele irá para a Lixeira e poderá ser restaurado.';
    if(!confirm(message))return;
    await moveToTrash('delivery_bundle',bundle,`Entrega • Cupom ${d.coupon||'—'}`);
    const ids=new Set(bundle.map(x=>x.id)); state.deliveries=state.deliveries.filter(x=>!ids.has(x.id));
    await saveState(`Entrega ${d.coupon||d.id} apagada`); closeModal();toast('Entrega enviada para a Lixeira.','success');render();
  }


  async function quickDelivered(id) {
    const d=state.deliveries.find(x=>x.id===id); if(!d)return;
    d.finalizationTime=currentTimeHM();
    if(!d.departureTime)d.departureTime=d.finalizationTime;
    d.status=d.returnTime?'Finalizada':'Em rota';d.updatedAt=nowISO();d.history||=[];d.history.push({id:uid('evt'),type:'delivered',at:nowISO(),time:d.finalizationTime});
    await saveState(`Entrega ${d.coupon} marcada como entregue`);toast('Hora de entrega registrada automaticamente.','success');render();
  }

  async function quickReturn(id) {
    const d=state.deliveries.find(x=>x.id===id); if(!d)return;
    if (d.cycleId) {
      openCloseCycleModal(d.cycleId);
      return;
    }
    if(!d.finalizationTime && !confirm('A entrega ainda não tem hora de finalização no cliente. Registrar o retorno mesmo assim?'))return;
    d.returnTime=currentTimeHM();d.status='Finalizada';d.updatedAt=nowISO();d.history||=[];d.history.push({id:uid('evt'),type:'returned_to_store',at:nowISO(),time:d.returnTime});
    await saveState(`Retorno da entrega ${d.coupon} registrado`);toast('Retorno à loja registrado. Entrega finalizada.','success');render();
  }
  function quickDeparture(id) {
    openCycleDepartureModal(id || '');
  }

  function cycleAvailableDeliveries(date = todayISO()) {
    return scoped(state.deliveries).filter(d => {
      if (d.date !== date || isFinal(d) || d.departureTime) return false;
      if (d.scheduledDate && openScheduled(d)) return false;
      return true;
    }).sort((a,b)=>(a.purchaseTime||'').localeCompare(b.purchaseTime||''));
  }

  function nextCycleCode(date = todayISO()) {
    const prefix = `CIC-${date.replaceAll('-','')}-`;
    const seq = scoped(state.cycles).filter(c=>c.date===date).length + 1;
    return `${prefix}${String(seq).padStart(2,'0')}`;
  }

  function openCycleDepartureModal(preselectDeliveryId='') {
    const date=todayISO();
    const available=cycleAvailableDeliveries(date);
    if (!available.length) {
      toast('Não há entregas disponíveis para montar uma nova saída.','warning');
      return;
    }
    openModal('Montar saída / iniciar ciclo','Selecione todas as entregas que irão juntas. Uma saída da loja até o retorno ao mercado corresponde a exatamente 1 ciclo.',`
      <form id="cycleDepartureForm" class="quick-action-form">
        <div class="cycle-definition-box"><span>↻</span><div><strong>1 saída + 1 retorno = 1 ciclo</strong><small>O KM não é digitado aqui. O sistema usa o KM inicial e final do expediente do veículo para calcular as médias por ciclo e por entrega.</small></div></div>
        <div class="form-grid">
          <label>Hora da saída<input name="departureTime" type="time" value="${currentTimeHM()}" required /></label>
          <label>Veículo<select name="vehicleId" required>${options(state.vehicles,'')}</select></label>
          <label>Entregador<select name="driverId" required>${options(state.employees.filter(x=>x.role==='Entregador'||x.role==='Colaborador'),'')}</select></label>
          <label>Código do ciclo<input name="code" value="${nextCycleCode(date)}" readonly /></label>
        </div>
        <div class="delivery-picker-head"><div><strong>Quais entregas serão levadas nesta saída?</strong><small>Selecione uma ou várias. Todas receberão a mesma hora de saída, veículo, entregador e ciclo.</small></div><span id="selectedDeliveryCount" class="badge blue">0 selecionadas</span></div>
        <div class="delivery-picker-list">
          ${available.map(d=>`<label class="delivery-picker-item"><input type="checkbox" name="deliveryIds" value="${d.id}" ${d.id===preselectDeliveryId?'checked':''}/><span><strong>Cupom ${esc(d.coupon||'—')}</strong><small>${esc(neighborhood(d.neighborhoodId)?.name||'Sem bairro')} • entrada ${d.purchaseTime||'—'} • taxa ${money(rootDelivery(d)?.fee||d.fee)}</small></span></label>`).join('')}
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelCycleDepartureBtn">Cancelar</button><button type="submit" class="btn primary large-action">🚚 Confirmar saída e abrir ciclo</button></div>
      </form>
    `,'SAÍDA DA LOJA');
    $('#cancelCycleDepartureBtn').addEventListener('click',closeModal);
    const form=$('#cycleDepartureForm');
    const updateCount=()=>{const n=$$('input[name="deliveryIds"]:checked',form).length;$('#selectedDeliveryCount').textContent=`${n} selecionada${n===1?'':'s'}`;};
    $$('input[name="deliveryIds"]',form).forEach(x=>x.addEventListener('change',updateCount)); updateCount();
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const fd=new FormData(form); const ids=fd.getAll('deliveryIds');
      const vehicleId=fd.get('vehicleId'), driverId=fd.get('driverId'), departureTime=fd.get('departureTime');
      if (!ids.length) { toast('Selecione pelo menos uma entrega para esta saída.','warning'); return; }
      const openVehicleCycle=scoped(state.cycles).find(c=>c.date===date && c.vehicleId===vehicleId && !c.returnTime);
      if (openVehicleCycle) { toast(`O veículo ${vehicle(vehicleId)?.name||''} já está em rota no ciclo ${openVehicleCycle.code}. Registre o retorno antes de abrir outra saída.`,'error'); return; }
      const openDriverCycle=scoped(state.cycles).find(c=>c.date===date && c.driverId===driverId && !c.returnTime);
      if (openDriverCycle) { toast(`O entregador ${employee(driverId)?.name||''} já está em rota no ciclo ${openDriverCycle.code}. Registre o retorno antes de abrir outra saída.`,'error'); return; }
      const c={id:uid('cyc'),code:fd.get('code')||nextCycleCode(date),date,vehicleId,driverId,departureTime,returnTime:'',notes:`Ciclo aberto com ${ids.length} entrega(s).`,createdAt:nowISO(),updatedAt:nowISO(),mode:currentMode()};
      state.cycles.push(c);
      ids.forEach(id=>{
        const d=state.deliveries.find(x=>x.id===id); if(!d)return;
        d.departureTime=departureTime; d.vehicleId=vehicleId; d.driverId=driverId; d.cycleId=c.id; d.status='Em rota'; d.updatedAt=nowISO();
        d.history||=[]; d.history.push({id:uid('evt'),type:'departure',at:nowISO(),time:departureTime,vehicleId,driverId,cycleId:c.id});
      });
      await saveState(`Ciclo ${c.code} aberto com ${ids.length} entrega(s)`);
      closeModal();
      const odo=scoped(state.odometerLogs).find(o=>o.date===date && o.vehicleId===vehicleId && Number(o.kmStart||0)>0);
      toast(odo?`Ciclo ${c.code} iniciado com ${ids.length} entrega(s).`:`Ciclo iniciado. Atenção: registre o KM inicial do veículo ${vehicle(vehicleId)?.name||''}.`,odo?'success':'warning');
      render();
    });
  }


  function openManageCycleDeliveriesModal(cycleId) {
    const c = scoped(state.cycles).find(x => x.id === cycleId); if (!c) return;
    const linked = scoped(state.deliveries).filter(d => d.cycleId === c.id);
    const linkedIds = new Set(linked.map(d => d.id));
    const finalStates = ['Finalizada','Devolvida','Retirada na loja','Cancelada','Reagendada','Programada'];
    const available = scoped(state.deliveries)
      .filter(d => d.date === c.date && !d.cycleId && (!c.returnTime || finalStates.includes(d.status) || !!d.finalizationTime))
      .filter(d => !linkedIds.has(d.id))
      .sort((a,b) => `${a.purchaseTime||''}`.localeCompare(`${b.purchaseTime||''}`));
    const all = [...linked, ...available];

    openModal(
      'Gerenciar entregas do ciclo',
      c.returnTime
        ? 'Este ciclo já está fechado. Você ainda pode corrigir o histórico, mas alterações podem mudar indicadores antigos.'
        : 'Adicione ou retire entregas livremente antes do retorno à loja. Os indicadores são recalculados automaticamente.',
      `
      <form id="manageCycleDeliveriesForm" class="quick-action-form">
        <div class="cycle-manager-hero ${c.returnTime?'closed':'open'}">
          <div class="cycle-manager-code"><span>${c.returnTime?'CICLO FECHADO':'CICLO EM ROTA'}</span><strong>${esc(c.code)}</strong></div>
          <div class="cycle-manager-stats">
            <div><span>Veículo</span><strong>${esc(vehicle(c.vehicleId)?.name||'—')}</strong></div>
            <div><span>Entregador</span><strong>${esc(employee(c.driverId)?.name||'—')}</strong></div>
            <div><span>Saída</span><strong>${c.departureTime||'—'}</strong></div>
            <div><span>Retorno</span><strong>${c.returnTime||'Em rota'}</strong></div>
          </div>
        </div>

        ${c.returnTime ? `<div class="note warning-note"><strong>Atenção:</strong> este ciclo já foi encerrado. Use esta tela apenas para corrigir um erro real de vínculo. O histórico da entrega receberá o registro da alteração.</div>` : `<div class="note"><strong>Como usar:</strong> marque tudo que realmente saiu neste ciclo. Desmarque uma entrega para retirá-la; marque uma disponível para adicioná-la.</div>`}

        <div class="cycle-manager-toolbar">
          <div>
            <strong>Entregas do ciclo</strong>
            <small>Selecione os cupons que realmente foram levados nesta saída.</small>
          </div>
          <span id="manageCycleCount" class="badge blue">${linked.length} selecionada${linked.length===1?'':'s'}</span>
        </div>

        <div class="cycle-manager-columns">
          <section class="cycle-manager-column inside">
            <div class="cycle-manager-column-head"><span>NO CICLO AGORA</span><strong>${linked.length}</strong></div>
            <div class="delivery-picker-list cycle-manager-list">
              ${linked.length ? linked.map(d => cycleManagerDeliveryItem(d, true, c)).join('') : `<div class="cycle-manager-empty">Nenhuma entrega vinculada.</div>`}
            </div>
          </section>
          <section class="cycle-manager-column available">
            <div class="cycle-manager-column-head"><span>DISPONÍVEIS PARA ADICIONAR</span><strong>${available.length}</strong></div>
            <div class="delivery-picker-list cycle-manager-list">
              ${available.length ? available.map(d => cycleManagerDeliveryItem(d, false, c)).join('') : `<div class="cycle-manager-empty">Nenhuma entrega disponível para esta data.</div>`}
            </div>
          </section>
        </div>

        ${c.returnTime ? `<label class="cycle-history-confirm"><input id="closedCycleConfirm" type="checkbox" /> <span>Confirmo que esta alteração corrige o histórico real deste ciclo fechado.</span></label>` : ''}

        <div class="form-actions">
          <button type="button" class="btn secondary" id="cancelManageCycleBtn">Cancelar</button>
          <button type="submit" class="btn primary large-action">✓ Salvar entregas do ciclo</button>
        </div>
      </form>
      `,
      'GESTÃO DO CICLO'
    );

    const form = $('#manageCycleDeliveriesForm');
    $('#cancelManageCycleBtn').addEventListener('click', closeModal);
    const updateCount = () => {
      const n = $$('input[name="managedDeliveryIds"]:checked', form).length;
      $('#manageCycleCount').textContent = `${n} selecionada${n===1?'':'s'}`;
    };
    $$('input[name="managedDeliveryIds"]', form).forEach(x => x.addEventListener('change', updateCount));
    updateCount();

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (c.returnTime && !$('#closedCycleConfirm')?.checked) {
        toast('Confirme que você está corrigindo o histórico de um ciclo já fechado.', 'warning');
        return;
      }
      const ids = new FormData(form).getAll('managedDeliveryIds');
      if (!ids.length) {
        toast('Um ciclo precisa manter pelo menos uma entrega vinculada.', 'warning');
        return;
      }
      const selected = new Set(ids);
      const current = new Set(linked.map(d => d.id));
      const addedIds = ids.filter(id => !current.has(id));
      const removedIds = [...current].filter(id => !selected.has(id));

      removedIds.forEach(id => {
        const d = state.deliveries.find(x => x.id === id); if (!d) return;
        d.cycleId = '';
        if (d.departureTime === c.departureTime) d.departureTime = '';
        if (d.returnTime === c.returnTime) d.returnTime = '';
        if (d.vehicleId === c.vehicleId) d.vehicleId = '';
        if (d.driverId === c.driverId) d.driverId = '';
        if (d.status === 'Em rota') d.status = 'Na loja';
        d.updatedAt = nowISO();
        d.history ||= [];
        d.history.push({id:uid('evt'), type:'cycle_removed', cycleId:c.id, cycleCode:c.code, at:nowISO()});
      });

      addedIds.forEach(id => {
        const d = state.deliveries.find(x => x.id === id); if (!d) return;
        d.cycleId = c.id;
        d.vehicleId = c.vehicleId;
        d.driverId = c.driverId;
        d.departureTime = c.departureTime;
        if (c.returnTime) d.returnTime = c.returnTime;
        if (!finalStates.includes(d.status)) d.status = c.returnTime && d.finalizationTime ? 'Finalizada' : 'Em rota';
        d.updatedAt = nowISO();
        d.history ||= [];
        d.history.push({id:uid('evt'), type:'cycle_added', cycleId:c.id, cycleCode:c.code, at:nowISO(), departureTime:c.departureTime, returnTime:c.returnTime||''});
      });

      c.updatedAt = nowISO();
      c.notes = `${c.notes||''}${c.notes?'\n':''}Gestão manual de entregas: +${addedIds.length} / -${removedIds.length} em ${new Date().toLocaleString('pt-BR')}`;
      await saveState(`Ciclo ${c.code}: ${addedIds.length} adicionada(s), ${removedIds.length} removida(s)`);
      closeModal();
      toast(`Ciclo atualizado: ${ids.length} entrega(s), +${addedIds.length} / -${removedIds.length}.`, 'success');
      render();
    });
  }

  function cycleManagerDeliveryItem(d, checked, c) {
    const calc = deliveryCalc(d);
    const status = d.status || 'Na loja';
    return `<label class="cycle-manager-item ${checked?'selected':''}">
      <input type="checkbox" name="managedDeliveryIds" value="${d.id}" ${checked?'checked':''} />
      <span class="cycle-manager-check">✓</span>
      <span class="cycle-manager-copy">
        <strong>Cupom ${esc(d.coupon||'—')}</strong>
        <small>${esc(neighborhood(d.neighborhoodId)?.name||'Sem bairro')} • ${statusBadge(status)} • entrada ${d.purchaseTime||'—'}</small>
      </span>
      <span class="cycle-manager-time">${calc.wait!=null?fmtMinutes(calc.wait):'—'}</span>
    </label>`;
  }

  function openCloseCycleModal(cycleId) {
    const c=scoped(state.cycles).find(x=>x.id===cycleId); if(!c)return;
    if(c.returnTime){toast('Este ciclo já está fechado.','warning');return;}
    const linked=scoped(state.deliveries).filter(d=>d.cycleId===c.id);
    const unresolved=linked.filter(d=>!d.finalizationTime && !['Devolvida','Retirada na loja','Cancelada','Reagendada','Programada'].includes(d.status));
    if(unresolved.length){
      openModal('Antes do retorno, dê baixa em todas as entregas','Para não deixar ponta solta, cada entrega levada deve estar marcada como Entregue, Devolvida, Reagendada, Retirada ou Cancelada antes de fechar o ciclo.',`
        <div class="cycle-blocked-box"><span>!</span><div><strong>${unresolved.length} entrega(s) ainda sem baixa</strong><small>Feche esta janela, marque o resultado de cada uma e depois registre o retorno do ciclo.</small></div></div>
        <div class="list-stack">${unresolved.map(d=>`<div class="list-row"><div><strong>Cupom ${esc(d.coupon||'—')}</strong><small>${esc(neighborhood(d.neighborhoodId)?.name||'Sem bairro')}</small></div><span class="badge yellow">Sem baixa</span></div>`).join('')}</div>
        <div class="form-actions"><button class="btn primary" type="button" id="closeBlockedCycleBtn">Entendi</button></div>
      `,'RETORNO À LOJA');
      $('#closeBlockedCycleBtn').addEventListener('click',closeModal); return;
    }
    openModal('Registrar retorno e fechar ciclo','A hora do retorno será aplicada a todas as entregas levadas nesta saída. O KM continua sendo calculado pelo odômetro diário.',`
      <form id="closeCycleForm" class="quick-action-form">
        <div class="cycle-return-summary"><div><span>CICLO</span><strong>${esc(c.code)}</strong></div><div><span>SAÍDA</span><strong>${c.departureTime||'—'}</strong></div><div><span>ENTREGAS LEVADAS</span><strong>${linked.length}</strong></div></div>
        <div class="form-grid"><label>Hora do retorno ao mercado<input name="returnTime" type="time" value="${currentTimeHM()}" required /></label></div>
        <div class="note">Ao confirmar, todas as entregas deste ciclo receberão o mesmo horário de retorno à loja. As entregues passam para Finalizada; devolvidas mantêm o status Devolvida.</div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelCloseCycleBtn">Cancelar</button><button type="submit" class="btn primary large-action">🏪 Confirmar retorno e fechar ciclo</button></div>
      </form>
    `,'RETORNO À LOJA');
    $('#cancelCloseCycleBtn').addEventListener('click',closeModal);
    $('#closeCycleForm').addEventListener('submit',async e=>{
      e.preventDefault(); const data=Object.fromEntries(new FormData(e.target).entries());
      c.returnTime=data.returnTime; c.updatedAt=nowISO();
      linked.forEach(d=>{
        d.returnTime=data.returnTime; d.updatedAt=nowISO();
        if(d.finalizationTime && d.status!=='Devolvida') d.status='Finalizada';
        d.history||=[]; d.history.push({id:uid('evt'),type:'returned_to_store',at:nowISO(),time:data.returnTime,cycleId:c.id});
      });
      await saveState(`Ciclo ${c.code} fechado no retorno à loja`); closeModal(); toast(`Ciclo ${c.code} fechado com ${linked.length} entrega(s).`,'success'); render();
    });
  }

  function quickReschedule(id) {
    const d=state.deliveries.find(x=>x.id===id);if(!d)return;
    openModal('Reagendar entrega','Escolha a nova data. O histórico anterior será preservado e não haverá novo faturamento.',`
      <form id="quickRescheduleForm" class="quick-action-form">
        <div class="quick-action-summary"><strong>Cupom ${esc(d.coupon||'—')}</strong><small>Taxa original ${money(rootDelivery(d)?.fee||d.fee)} • não será duplicada</small></div>
        <div class="form-grid">
          <label>Nova data<input name="scheduledDate" type="date" min="${todayISO()}" required /></label>
          <label>Motivo<select name="reasonId">${options(state.reasons,d.reasonId)}</select></label>
          <label class="span-2">Próxima ação<input name="nextAction" value="${attr(d.nextAction||'Reentregar na nova data')}" /></label>
          <label class="full">Observação<input name="reasonText" placeholder="Opcional" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelRescheduleBtn">Cancelar</button><button type="submit" class="btn primary large-action">Confirmar reagendamento</button></div>
      </form>
    `,'AÇÃO RÁPIDA');
    $('#cancelRescheduleBtn').addEventListener('click',closeModal);
    $('#quickRescheduleForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());
      const oldDate=d.scheduledDate||d.date;d.scheduledDate=data.scheduledDate;d.scheduleKind='Reagendada';d.status='Reagendada';d.reasonId=data.reasonId||'';d.reasonText=data.reasonText||'';d.nextAction=data.nextAction||'';d.updatedAt=nowISO();d.history||=[];d.history.push({id:uid('evt'),type:'schedule_change',from:oldDate,to:d.scheduledDate,kind:'Reagendada',at:nowISO(),reasonId:d.reasonId,reasonText:d.reasonText});
      await saveState(`Entrega ${d.coupon} reagendada`);closeModal();toast(`Entrega reagendada para ${dateBR(d.scheduledDate)}. O faturamento não foi duplicado.`,'success');render();
    });
  }

  function quickPickup(id) {
    const d=state.deliveries.find(x=>x.id===id);if(!d)return;const root=rootDelivery(d);const fee=Number(root?.fee||0);
    openModal('Cliente retirou na loja','Registre se houve ou não reembolso da taxa de entrega.',`
      <form id="quickPickupForm" class="quick-action-form">
        <div class="quick-action-summary"><strong>Cupom ${esc(d.coupon||'—')}</strong><small>Taxa cobrada no registro: ${money(fee)}</small></div>
        <div class="quick-entry-block">
          <div class="quick-entry-title"><span>↩</span><div><strong>Houve reembolso da taxa?</strong><small>O faturamento bruto permanece rastreável e o reembolso é registrado separadamente.</small></div></div>
          <input type="hidden" name="refundMode" id="refundMode" value="none" />
          <div class="choice-buttons" id="refundChoices">
            <button type="button" class="choice-btn selected" data-value="none">Não houve reembolso</button>
            <button type="button" class="choice-btn" data-value="full">Reembolso total (${money(fee)})</button>
            <button type="button" class="choice-btn" data-value="custom">Outro valor</button>
          </div>
          <label id="customRefundWrap" class="quick-schedule-date hidden">Valor do reembolso<input name="customRefund" type="number" min="0" max="${fee}" step="0.01" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelPickupBtn">Cancelar</button><button type="submit" class="btn primary large-action">Confirmar retirada</button></div>
      </form>
    `,'AÇÃO RÁPIDA');
    const buttons=$$('#refundChoices .choice-btn');buttons.forEach(btn=>btn.addEventListener('click',()=>{buttons.forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');$('#refundMode').value=btn.dataset.value;$('#customRefundWrap').classList.toggle('hidden',btn.dataset.value!=='custom');}));
    $('#cancelPickupBtn').addEventListener('click',closeModal);
    $('#quickPickupForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());let amount=0;if(data.refundMode==='full')amount=fee;if(data.refundMode==='custom')amount=Number(data.customRefund||0);
      root.refundAmount=amount;root.refundDate=amount>0?todayISO():'';root.withdrawalDate=todayISO();root.withdrawalTime=currentTimeHM();
      d.status='Retirada na loja';d.returnTime='';d.updatedAt=nowISO();d.history||=[];d.history.push({id:uid('evt'),type:'store_pickup',at:nowISO(),refundAmount:amount});
      await saveState(`Retirada na loja do cupom ${d.coupon} registrada`);closeModal();toast(amount>0?`Retirada registrada com reembolso de ${money(amount)}.`:'Retirada registrada sem reembolso.','success');render();
    });
  }

  function quickDevolution(id) {
    const d=state.deliveries.find(x=>x.id===id);if(!d)return;
    openModal('Registrar devolução','Informe o motivo e, se já souber, uma nova data para reentrega.',`
      <form id="quickDevolutionForm" class="quick-action-form">
        <div class="form-grid">
          <label>Motivo<select name="reasonId" required>${options(state.reasons,d.reasonId)}</select></label>
          <label>Nova data (opcional)<input name="scheduledDate" type="date" min="${todayISO()}" /></label>
          <label class="span-2">Próxima ação<input name="nextAction" placeholder="Ex.: Aguardar contato do cliente" /></label>
          <label class="full">Observação<input name="reasonText" placeholder="Opcional" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelDevolutionBtn">Cancelar</button><button type="submit" class="btn primary large-action">Salvar devolução</button></div>
      </form>
    `,'AÇÃO RÁPIDA');
    $('#cancelDevolutionBtn').addEventListener('click',closeModal);
    $('#quickDevolutionForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());d.reasonId=data.reasonId;d.reasonText=data.reasonText||'';d.nextAction=data.nextAction||'';d.scheduledDate=data.scheduledDate||'';d.scheduleKind=data.scheduledDate?'Reagendada':d.scheduleKind;d.status=data.scheduledDate?'Reagendada':'Devolvida';d.returnTime=d.returnTime||currentTimeHM();d.updatedAt=nowISO();d.history||=[];d.history.push({id:uid('evt'),type:'devolution',at:nowISO(),reasonId:d.reasonId,scheduledDate:d.scheduledDate});
      await saveState(`Devolução do cupom ${d.coupon} registrada`);closeModal();toast(d.scheduledDate?`Devolvida e reagendada para ${dateBR(d.scheduledDate)}.`:'Devolução registrada.','success');render();
    });
  }

  async function startScheduledDelivery(id) {
    const source = scoped(state.deliveries).find(d=>d.id===id);
    if (!source || !source.scheduledDate) return;
    const existingChild = childDeliveries(source.id)[0];
    if (existingChild) { openDeliveryModal(existingChild.id); return; }
    const child = {
      id:uid('del'), rootId:source.rootId || source.id, parentId:source.id, attemptNo:Number(source.attemptNo||1)+1,
      date:source.scheduledDate, orderNo:source.orderNo, coupon:source.coupon, purchaseTime:'', neighborhoodId:source.neighborhoodId, fee:source.fee,
      driverId:source.driverId || '', vehicleId:'', cycleId:'', departureTime:'', finalizationTime:'', returnTime:'', status:'Na loja',
      scheduledDate:'', scheduleKind:'Reagendada', reasonId:'', reasonText:'', nextAction:'', notes:`Continuação automática da entrega originada em ${dateBR(source.date)}.`,
      refundAmount:0,refundDate:'',withdrawalDate:'',withdrawalTime:'',createdAt:nowISO(),updatedAt:nowISO(),history:[{id:uid('evt'),type:'continued_from',fromId:source.id,at:nowISO()}],mode:currentMode()
    };
    source.history ||= [];
    source.history.push({id:uid('evt'),type:'continued_to',toId:child.id,at:nowISO()});
    state.deliveries.push(child);
    await saveState(`Atendimento programado do cupom ${source.coupon} iniciado`);
    toast('Atendimento criado no dia programado.','success');
    openDeliveryModal(child.id);
  }

  function openCycleModal(id='') {
    const existing=id?scoped(state.cycles).find(c=>c.id===id):null;
    if(!existing){ openCycleDepartureModal(); return; }
    const c={...existing};
    openModal('Ajustar ciclo','Edição avançada. O fluxo normal deve ser feito por Montar saída e Registrar retorno.',`
      <form id="cycleForm">
        <div class="cycle-definition-box"><span>↻</span><div><strong>1 ciclo = uma saída até um retorno</strong><small>Não existe KM inicial/final aqui. A quilometragem é registrada uma vez por veículo no início e no fim do expediente.</small></div></div>
        <div class="form-grid">
          <label>Código<input name="code" value="${attr(c.code)}" required /></label>
          <label>Data<input name="date" type="date" value="${c.date}" required /></label>
          <label>Veículo<select name="vehicleId">${options(state.vehicles,c.vehicleId)}</select></label>
          <label>Entregador<select name="driverId">${options(state.employees.filter(x=>x.role==='Entregador'||x.role==='Colaborador'),c.driverId)}</select></label>
          <label>Saída<input name="departureTime" type="time" value="${c.departureTime||''}" /></label>
          <label>Retorno<input name="returnTime" type="time" value="${c.returnTime||''}" /></label>
          <label class="full">Observações<textarea name="notes">${esc(c.notes||'')}</textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelCycleBtn">Cancelar</button><button type="button" class="btn danger" id="deleteCycleBtn">Apagar ciclo</button><button type="submit" class="btn primary">Salvar ajuste</button></div>
      </form>
    `,'AJUSTE AVANÇADO');
    $('#cancelCycleBtn').addEventListener('click',closeModal); $('#deleteCycleBtn').addEventListener('click',()=>deleteRecord('cycle',c.id));
    $('#cycleForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());
      data.id=c.id;data.createdAt=c.createdAt||nowISO();data.updatedAt=nowISO();data.mode=existing.mode||currentMode();Object.assign(existing,data);
      await saveState(`Ciclo ${data.code} ajustado`);closeModal();toast('Ciclo ajustado.','success');render();
    });
  }
  function openOdometerModal(id='', presetVehicleId='') {
    const existing = id ? scoped(state.odometerLogs).find(o=>o.id===id) : null;
    const o = existing ? {...existing} : {id:uid('odo'),date:todayISO(),vehicleId:presetVehicleId||'',kmStart:'',kmEnd:'',notes:'',createdAt:nowISO(),updatedAt:nowISO(),mode:currentMode()};
    openModal(existing?'Atualizar KM diário':'Registrar KM diário','Informe o KM inicial no começo do dia e complete o KM final no encerramento. O sistema calcula todas as médias automaticamente.',`
      <form id="odometerForm">
        <div class="odometer-form-intro"><span>KM</span><div><strong>Um único fechamento por veículo e por dia</strong><small>Não informe KM em cada ciclo. O app usa o total diário para calcular KM por ciclo e por entrega.</small></div></div>
        <div class="form-grid">
          <label>Data<input name="date" type="date" value="${o.date}" required /></label>
          <label>Veículo<select name="vehicleId" required>${options(state.vehicles,o.vehicleId)}</select></label>
          <label>KM inicial<input name="kmStart" type="number" step="0.1" min="0" value="${o.kmStart||''}" required /></label>
          <label>KM final<input name="kmEnd" type="number" step="0.1" min="0" value="${o.kmEnd||''}" placeholder="Preencha no fim do dia" /></label>
          <label class="full">Observações<textarea name="notes">${esc(o.notes||'')}</textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelOdometerBtn">Cancelar</button>${existing?`<button type="button" class="btn danger" id="deleteOdometerBtn">Apagar KM</button>`:""}<button type="submit" class="btn primary">Salvar KM</button></div>
      </form>
    `,'QUILOMETRAGEM DA FROTA');
    $('#cancelOdometerBtn').addEventListener('click',closeModal); if(existing) $('#deleteOdometerBtn').addEventListener('click',()=>deleteRecord('odometer',o.id));
    $('#odometerForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const data=Object.fromEntries(new FormData(e.target).entries());
      data.kmStart=Number(data.kmStart||0);data.kmEnd=Number(data.kmEnd||0);
      if(data.kmEnd && data.kmEnd < data.kmStart){toast('O KM final não pode ser menor que o KM inicial.','error');return;}
      const duplicate=scoped(state.odometerLogs).find(x=>x.date===data.date && x.vehicleId===data.vehicleId && x.id!==o.id);
      if(duplicate){toast('Já existe um registro de KM para esse veículo nessa data. Abra o existente e atualize.','warning');return;}
      data.id=o.id;data.createdAt=o.createdAt||nowISO();data.updatedAt=nowISO();data.mode=existing?.mode||currentMode();
      if(existing) Object.assign(existing,data); else state.odometerLogs.push(data);
      await saveState(`KM diário de ${vehicle(data.vehicleId)?.name||'veículo'} salvo`);
      closeModal();toast(data.kmEnd?'Quilometragem diária fechada.':'KM inicial registrado. Complete o KM final no fim do dia.','success');render();
    });
  }

  function openCostModal(id='') {
    const existing=id?scoped(state.costs).find(c=>c.id===id):null;
    const fuelCat=state.costCategories.find(c=>c.name==='Combustível');
    const c=existing?{...existing}:{id:uid('cost'),date:todayISO(),time:'',vehicleId:'',categoryId:fuelCat?.id||'',description:'',value:0,km:0,supplier:'',receiptNo:'',responsibleId:'',notes:'',createdAt:nowISO(),updatedAt:nowISO(),mode:currentMode()};
    openModal(existing?'Editar custo':'Registrar custo','Todo gasto fica disponível nos relatórios por dia, semana, mês, ano e veículo.',`
      <form id="costForm">
        <div class="form-grid">
          <label>Data<input name="date" type="date" value="${c.date}" required /></label>
          <label>Hora<input name="time" type="time" value="${c.time||''}" /></label>
          <label>Veículo<select name="vehicleId">${options(state.vehicles,c.vehicleId)}</select></label>
          <label>Categoria<select name="categoryId">${options(state.costCategories,c.categoryId)}</select></label>
          <label>Valor<input name="value" type="number" step="0.01" min="0" value="${Number(c.value||0)||''}" required /></label>
          <label>KM atual<input name="km" type="number" step="0.1" min="0" value="${Number(c.km||0)||''}" /></label>
          <label class="span-2">Descrição<input name="description" value="${attr(c.description||'')}" required placeholder="Ex.: Abastecimento de gasolina" /></label>
          <label>Fornecedor<input name="supplier" value="${attr(c.supplier||'')}" /></label>
          <label>Nº nota/comprovante<input name="receiptNo" value="${attr(c.receiptNo||'')}" /></label>
          <label>Responsável<select name="responsibleId">${options(state.employees,c.responsibleId)}</select></label>
          <label class="span-3">Observações<textarea name="notes">${esc(c.notes||'')}</textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelCostBtn">Cancelar</button>${existing?`<button type="button" class="btn danger" id="deleteCostBtn">Apagar custo</button>`:""}<button type="submit" class="btn primary">Salvar custo</button></div>
      </form>
    `);
    $('#cancelCostBtn').addEventListener('click',closeModal); if(existing) $('#deleteCostBtn').addEventListener('click',()=>deleteRecord('cost',c.id));
    $('#costForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());
      data.id=c.id;data.value=Number(data.value||0);data.km=Number(data.km||0);data.createdAt=c.createdAt||nowISO();data.updatedAt=nowISO();data.mode=existing?.mode||currentMode();
      if(existing) Object.assign(existing,data); else state.costs.push(data);
      await saveState(`Custo ${data.description} salvo`);closeModal();toast('Custo salvo.','success');render();
    });
  }

  function openConfigModal(id='') {
    const arr=state[configTab];
    const existing=id?arr.find(x=>x.id===id):null;
    const item=existing?{...existing}:{id:uid(configTab.slice(0,3)),name:'',active:true};
    let extra='';
    if(configTab==='vehicles') extra=`<label>Placa<input name="plate" value="${attr(item.plate||'')}" /></label><label>Tipo<input name="type" value="${attr(item.type||'')}" placeholder="Moto, utilitário..." /></label>`;
    if(configTab==='neighborhoods') extra=`<label>Região<input name="region" value="${attr(item.region||'')}" placeholder="Opcional" /></label>`;
    if(configTab==='employees') extra=`<label>Função<select name="role">${['Entregador','Conferente','Gestor','Prevenção','Colaborador'].map(r=>`<option value="${r}" ${item.role===r?'selected':''}>${r}</option>`).join('')}</select></label>`;
    openModal(existing?'Editar cadastro':'Novo cadastro','Você pode desativar um cadastro sem perder o histórico.',`
      <form id="configForm"><div class="form-grid"><label>Nome<input name="name" value="${attr(item.name||'')}" required /></label>${extra}</div><div class="form-actions"><button type="button" class="btn secondary" id="cancelConfigBtn">Cancelar</button><button type="submit" class="btn primary">Salvar</button></div></form>
    `,'CADASTRO MESTRE');
    $('#cancelConfigBtn').addEventListener('click',closeModal);
    $('#configForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());
      data.id=item.id;data.active=item.active??true;data.createdAt=item.createdAt||nowISO();
      if(existing) Object.assign(existing,data); else arr.push(data);
      await saveState(`${configTab}: ${data.name} salvo`);closeModal();toast('Cadastro salvo.','success');renderSettings();
    });
  }

  async function toggleConfig(id) {
    const item=state[configTab].find(x=>x.id===id);if(!item)return;
    item.active=!item.active;await saveState(`${item.name} ${item.active?'reativado':'desativado'}`);toast(item.active?'Cadastro reativado.':'Cadastro desativado.','success');renderSettings();
  }

  async function saveRules() {
    state.settings.workStart=$('#ruleWorkStart').value;
    state.settings.lunchStart=$('#ruleLunchStart').value;
    state.settings.lunchEnd=$('#ruleLunchEnd').value;
    state.settings.workEnd=$('#ruleWorkEnd').value;
    state.settings.delayMinutes=Number($('#ruleDelay').value||120);
    await saveState('Regras operacionais atualizadas');toast('Regras salvas.','success');renderSettings();
  }

  function buildCostCategoryRows(costs) {
    return state.costCategories.map(c=>({label:c.name,value:sum(costs.filter(x=>x.categoryId===c.id).map(x=>x.value))})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
  }
  function groupSumByDate(list, field) {
    const map={}; list.forEach(x=>map[x.date]=(map[x.date]||0)+Number(x[field]||0));
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({label:dateBR(date).slice(0,5),value}));
  }

  /* Native SVG charts: no external library, so the dashboard also works offline. */
  function lineChartHTML(data, color='#2E73B9') {
    if(!data.length) return emptyState('▥','Sem dados para o gráfico','Registre dados no período selecionado.');
    const w=760,h=230,p=32,max=Math.max(...data.map(x=>Number(x.value||0)),1);
    const step=data.length>1?(w-p*2)/(data.length-1):0;
    const points=data.map((d,i)=>({x:p+i*step,y:h-p-(Number(d.value||0)/max)*(h-p*2),...d}));
    const poly=points.map(p=>`${p.x},${p.y}`).join(' ');
    const labels=points.filter((_,i)=>data.length<=10||i%Math.ceil(data.length/8)===0||i===data.length-1).map(p=>`<text x="${p.x}" y="${h-7}" text-anchor="middle" font-size="9" fill="#7A8C98">${esc(p.label)}</text>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img"><line x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}" stroke="#E5ECEF"/><polyline fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${poly}"/>${points.map(pt=>`<circle cx="${pt.x}" cy="${pt.y}" r="4" fill="#fff" stroke="${color}" stroke-width="2"><title>${esc(pt.label)}: ${number(pt.value,2)}</title></circle>`).join('')}${labels}</svg>`;
  }

  function horizontalBarChartHTML(data,color='#2E73B9') {
    if(!data.length) return emptyState('◎','Sem dados para o gráfico','Registre entregas com bairros.');
    const max=Math.max(...data.map(x=>Number(x.value||0)),1);
    return `<div style="display:grid;gap:9px;height:100%;align-content:center">${data.map(row=>`<div style="display:grid;grid-template-columns:minmax(85px,145px) 1fr 42px;gap:8px;align-items:center"><span style="font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${attr(row.label)}">${esc(row.label)}</span><div style="height:10px;background:#EEF3F6;border-radius:99px;overflow:hidden"><div style="height:100%;width:${clamp(Number(row.value||0)/max*100,0,100)}%;background:${color};border-radius:99px"></div></div><strong style="font-size:10px;text-align:right">${number(row.value)}</strong></div>`).join('')}</div>`;
  }

  function groupedBarChartHTML(data,labelA='A',labelB='B') {
    if(!data.length) return emptyState('R$','Sem dados para o gráfico','Registre movimentações no período.');
    const max=Math.max(...data.flatMap(x=>[Number(x.a||0),Number(x.b||0)]),1);
    return `<div style="height:100%;display:flex;flex-direction:column"><div style="display:flex;gap:14px;font-size:9px;color:#71808C;margin-bottom:8px"><span><i style="display:inline-block;width:9px;height:9px;background:#2E73B9;border-radius:3px"></i> ${esc(labelA)}</span><span><i style="display:inline-block;width:9px;height:9px;background:#D95C5C;border-radius:3px"></i> ${esc(labelB)}</span></div><div style="display:flex;align-items:flex-end;gap:10px;flex:1;border-bottom:1px solid #E5ECEF;padding:6px 4px 0">${data.map(row=>`<div style="flex:1;min-width:42px;display:flex;align-items:flex-end;justify-content:center;gap:4px;height:100%;position:relative"><div title="${labelA}: ${money(row.a)}" style="width:30%;height:${clamp(row.a/max*100,1,100)}%;background:#2E73B9;border-radius:5px 5px 0 0"></div><div title="${labelB}: ${money(row.b)}" style="width:30%;height:${clamp(row.b/max*100,1,100)}%;background:#D95C5C;border-radius:5px 5px 0 0"></div><span style="position:absolute;bottom:-19px;font-size:8px;color:#7A8C98;white-space:nowrap">${esc(row.label)}</span></div>`).join('')}</div><div style="height:22px"></div></div>`;
  }

  function donutChartHTML(rows) {
    if(!rows.length) return emptyState('◉','Sem custos no período','Registre custos para visualizar a distribuição.');
    const total=sum(rows.map(r=>r.value));
    const colors=['#2E73B9','#2EA8A1','#E9A93C','#D95C5C','#7A67C7','#6B8A9B','#9CB5C1'];
    let offset=0;
    const segments=rows.map((r,i)=>{const pct=r.value/total*100;const start=offset;offset+=pct;return `${colors[i%colors.length]} ${start}% ${offset}%`;});
    return `<div style="height:100%;display:grid;grid-template-columns:180px 1fr;align-items:center;gap:16px"><div style="width:165px;height:165px;border-radius:50%;background:conic-gradient(${segments.join(',')});position:relative;margin:auto"><div style="position:absolute;inset:28px;background:#fff;border-radius:50%;display:grid;place-items:center;text-align:center"><div><strong style="font-size:15px">${money(total)}</strong><div style="font-size:9px;color:#71808C">total</div></div></div></div><div class="stat-list">${rows.slice(0,7).map((r,i)=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px"><span style="display:flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:3px;background:${colors[i%colors.length]}"></i>${esc(r.label)}</span><strong>${money(r.value)}</strong></div>`).join('')}</div></div>`;
  }

  function problemNeighborhoodChartHTML(rows) {
    if(!rows.length) return emptyState('!','Sem problemas registrados','As ocorrências aparecerão aqui automaticamente.');
    const max=Math.max(...rows.map(r=>r.problemCount),1);
    return `<div style="display:grid;gap:8px;height:100%;align-content:center">${rows.map(r=>`<div><div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:4px"><strong>${esc(r.name)}</strong><span>${r.problemCount} ocorrências</span></div><div style="display:flex;height:11px;border-radius:99px;overflow:hidden;background:#EFF3F5"><span title="Endereço errado: ${r.wrongAddress}" style="width:${r.wrongAddress/max*100}%;background:#D95C5C"></span><span title="Reagendadas: ${r.rescheduled}" style="width:${r.rescheduled/max*100}%;background:#E9A93C"></span><span title="Devoluções: ${r.devolutions}" style="width:${r.devolutions/max*100}%;background:#7A67C7"></span><span title="Atrasadas: ${r.delayed}" style="width:${r.delayed/max*100}%;background:#2E73B9"></span></div></div>`).join('')}<div style="display:flex;gap:12px;font-size:8px;color:#71808C;margin-top:4px"><span>■ End. errado</span><span>■ Reagendada</span><span>■ Devolução</span><span>■ Atraso</span></div></div>`;
  }

  /* Excel-compatible SpreadsheetML 2003 export. Works offline and supports multiple worksheets. */
  function exportExcelReport() {
    const r=reportRangeFromForm();
    if(!r.start || !r.end){toast('Informe o período do relatório.','warning');return;}
    const deliveries=scoped(state.deliveries).filter(d=>inRange(d.date,r));
    const costs=scoped(state.costs).filter(c=>inRange(c.date,r));
    const cycles=scoped(state.cycles).filter(c=>inRange(c.date,r));
    const odometers=scoped(state.odometerLogs).filter(o=>inRange(o.date,r));
    const final=deliveries.filter(d=>d.status==='Finalizada');
    const totalCosts=sum(costs.map(c=>c.value));
    const fin=financialsForRange(r);
    const km=totalKmFromOdometers(odometers);
    const sheets={
      RESUMO_EXECUTIVO:[
        ['Indicador','Valor'],['Período',`${dateBR(r.start)} a ${dateBR(r.end)}`],['Entregas registradas',deliveries.length],['Entregas finalizadas',final.length],['Faturamento bruto',fin.gross],['Reembolsos de taxa',fin.refundTotal],['Faturamento líquido',fin.net],['Custos',totalCosts],['Saldo operacional',fin.net-totalCosts],['Custo por entrega',final.length?totalCosts/final.length:0],['KM total',km],['KM médio por dia',unique(odometers.filter(o=>odometerCalc(o).complete).map(o=>o.date)).length?km/unique(odometers.filter(o=>odometerCalc(o).complete).map(o=>o.date)).length:0],['KM por entrega',final.length?km/final.length:0],['Ciclos',cycles.length],['Entregas por ciclo',cycles.length?sum(cycles.map(c=>cycleCalc(c).deliveries))/cycles.length:0],['KM médio por ciclo',cycles.length?km/cycles.length:0]
      ],
      ENTREGAS:[['ID','Data','Nº Compra','Cupom','Bairro','Taxa registrada','Reembolso','Data reembolso','Receita líquida','Entregador','Veículo','Ciclo','Entrada','Saída','Finalização','Retorno Loja','Espera Min','Até Cliente Min','Rota Min','Atrasada','Status','Data Programada','Tipo Programação','Motivo','Próxima Ação','Observações'],...deliveries.map(d=>{const c=deliveryCalc(d);return[d.id,d.date,d.orderNo,d.coupon,neighborhood(d.neighborhoodId)?.name||'',rootDelivery(d)?.fee||d.fee,rootDelivery(d)?.refundAmount||0,rootDelivery(d)?.refundDate||'',netRevenueOfRoot(d),employee(d.driverId)?.name||'',vehicle(d.vehicleId)?.name||'',cycle(d.cycleId)?.code||'',d.purchaseTime,d.departureTime,d.finalizationTime,d.returnTime,c.wait,c.toClient,c.route,c.delayed?'SIM':'NÃO',d.status,d.scheduledDate,d.scheduleKind,reason(d.reasonId)?.name||d.reasonText||'',d.nextAction,d.notes]})],
      CUSTOS:[['Data','Hora','Veículo','Categoria','Descrição','Valor','KM Atual','Fornecedor','Comprovante','Responsável','Observações'],...costs.map(c=>[c.date,c.time,vehicle(c.vehicleId)?.name||'',category(c.categoryId)?.name||'',c.description,c.value,c.km,c.supplier,c.receiptNo,employee(c.responsibleId)?.name||'',c.notes])],
      CICLOS:[['Data','Ciclo','Veículo','Entregador','Saída','Retorno','Entregas','KM Médio por Ciclo','Tempo Min','Receita'],...cycles.map(c=>{const x=cycleCalc(c);return[c.date,c.code,vehicle(c.vehicleId)?.name||'',employee(c.driverId)?.name||'',c.departureTime,c.returnTime,x.deliveries,x.km,x.minutes,x.revenue]})],
      ODOMETRO_DIARIO:[['Data','Veículo','KM Inicial','KM Final','KM Rodado','Ciclos','Entregas','Entregas por Ciclo','KM por Ciclo','KM por Entrega','Status'],...odometers.map(o=>{const s=vehicleDayStats(o.date,o.vehicleId),x=odometerCalc(o);return[o.date,vehicle(o.vehicleId)?.name||'',o.kmStart,o.kmEnd,x.km,s.cycles,s.deliveries,s.deliveriesPerCycle,s.kmPerCycle,s.kmPerDelivery,x.complete?'FECHADO':'ABERTO']})],
      VEICULOS:buildVehicleReportRows(deliveries,costs,cycles,odometers),
      COLABORADORES:buildEmployeeReportRows(deliveries),
      BAIRROS:buildNeighborhoodReportRows(deliveries),
      PROGRAMADAS:[['Origem','Data Programada','Tipo','Cupom','Bairro','Motivo','Próxima Ação'],...deliveries.filter(openScheduled).map(d=>[d.date,d.scheduledDate,d.scheduleKind,d.coupon,neighborhood(d.neighborhoodId)?.name||'',reason(d.reasonId)?.name||d.reasonText||'',d.nextAction])],
      PENDENCIAS:[['Data','Cupom','Status','Pendências','Bairro'],...deliveries.filter(d=>pendingReasons(d).length).map(d=>[d.date,d.coupon,d.status,pendingReasons(d).join('; '),neighborhood(d.neighborhoodId)?.name||''])],
      HISTORICO:[['ID','Cupom','Data','Status','Pai','Raiz','Tentativa','Criado em','Atualizado em'],...deliveries.map(d=>[d.id,d.coupon,d.date,d.status,d.parentId,d.rootId,d.attemptNo,d.createdAt,d.updatedAt])]
    };
    const xml=buildSpreadsheetML(sheets);
    downloadBlob(new Blob(['\ufeff'+xml],{type:'application/vnd.ms-excel;charset=utf-8'}),`Relatorio_Controle_Entregas_${r.label}.xls`);
    toast('Relatório Excel gerado.','success');
  }

  function buildVehicleReportRows(deliveries,costs,cycles,odometers=filteredOdometers()) {
    const header=['Veículo','Entregas','Faturamento','Custos','Saldo','KM','Custo por Entrega','Custo por KM','Entregas por Ciclo'];
    const rows=state.vehicles.map(v=>{const d=deliveries.filter(x=>x.vehicleId===v.id&&x.status==='Finalizada');const c=costs.filter(x=>x.vehicleId===v.id);const cy=cycles.filter(x=>x.vehicleId===v.id);const odo=odometers.filter(x=>x.vehicleId===v.id);const km=totalKmFromOdometers(odo);const cost=sum(c.map(x=>x.value));const rev=revenueAttributedTo(d);return[v.name,d.length,rev,cost,rev-cost,km,d.length?cost/d.length:0,km?cost/km:0,cy.length?d.filter(x=>x.cycleId).length/cy.length:0]});
    return [header,...rows.filter(r=>r.slice(1).some(Number))];
  }
  function buildEmployeeReportRows(deliveries) {
    const header=['Colaborador','Função','Entregas','Faturamento','Tempo Médio Rota Min','Devoluções','Atrasadas'];
    const rows=state.employees.map(e=>{const d=deliveries.filter(x=>x.driverId===e.id);const final=d.filter(x=>x.status==='Finalizada');return[e.name,e.role,final.length,revenueAttributedTo(final),avg(d.map(x=>deliveryCalc(x).route)),d.filter(x=>x.status==='Devolvida').length,d.filter(x=>deliveryCalc(x).delayed).length]});
    return [header,...rows.filter(r=>r.slice(2).some(Number))];
  }
  function buildNeighborhoodReportRows(deliveries) {
    const header=['Bairro','Entregas','Faturamento','Endereço Errado','Agendadas','Reagendadas','Devoluções','Atrasadas','Taxa Devolução %','Taxa Problemas %'];
    return [header,...buildNeighborhoodRows(deliveries).map(r=>[r.name,r.deliveries,r.revenue,r.wrongAddress,r.scheduled,r.rescheduled,r.devolutions,r.delayed,r.returnRate,r.problemRate])];
  }

  function buildSpreadsheetML(sheets) {
    const xmlEsc=v=>String(v??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    const dataType=v=>typeof v==='number'&&Number.isFinite(v)?'Number':'String';
    const sheetXml=Object.entries(sheets).map(([name,rows])=>`<Worksheet ss:Name="${xmlEsc(name.slice(0,31))}"><Table>${rows.map(row=>`<Row>${row.map(value=>`<Cell><Data ss:Type="${dataType(value)}">${xmlEsc(value)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet>`).join('');
    return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheetXml}</Workbook>`;
  }

  function printReport() {
    const r=reportRangeFromForm();
    const deliveries=scoped(state.deliveries).filter(d=>inRange(d.date,r));
    const costs=scoped(state.costs).filter(c=>inRange(c.date,r));
    const cycles=scoped(state.cycles).filter(c=>inRange(c.date,r));
    const odometers=scoped(state.odometerLogs).filter(o=>inRange(o.date,r));
    const final=deliveries.filter(d=>d.status==='Finalizada');
    const fin=financialsForRange(r);
    const nb=buildNeighborhoodRows(deliveries).slice(0,10);
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Relatório</title><style>body{font-family:Arial,sans-serif;color:#233743;padding:28px}h1{color:#173A5E}table{border-collapse:collapse;width:100%;margin-top:15px}th,td{border:1px solid #dfe7ec;padding:7px;font-size:12px;text-align:left}th{background:#f3f6f8}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.c{border:1px solid #dfe7ec;border-radius:10px;padding:12px}.c small{color:#71808c}.c strong{display:block;font-size:20px;margin-top:4px}@media print{button{display:none}}</style></head><body><h1>Controle de Entregas • Relatório</h1><p>${dateBR(r.start)} a ${dateBR(r.end)}</p><div class="cards"><div class="c"><small>Entregas</small><strong>${final.length}</strong></div><div class="c"><small>Faturamento bruto</small><strong>${money(fin.gross)}</strong></div><div class="c"><small>Reembolsos</small><strong>${money(fin.refundTotal)}</strong></div><div class="c"><small>Faturamento líquido</small><strong>${money(fin.net)}</strong></div><div class="c"><small>Custos</small><strong>${money(sum(costs.map(c=>c.value)))}</strong></div><div class="c"><small>KM</small><strong>${number(totalKmFromOdometers(odometers),1)}</strong></div></div><h2>Top bairros</h2><table><tr><th>Bairro</th><th>Entregas</th><th>Faturamento</th><th>Endereço errado</th><th>Reagendadas</th><th>Devoluções</th></tr>${nb.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.deliveries}</td><td>${money(r.revenue)}</td><td>${r.wrongAddress}</td><td>${r.rescheduled}</td><td>${r.devolutions}</td></tr>`).join('')}</table><script>window.onload=()=>window.print()<\/script></body></html>`;
    const w=window.open('','_blank');w.document.write(html);w.document.close();
  }

  function downloadBackup() {
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    downloadBlob(blob,`Backup_Controle_Entregas_${todayISO()}.json`);
    toast('Backup gerado.','success');
  }
  function restoreBackup(file) {
    const reader=new FileReader();
    reader.onload=async()=>{try{const data=JSON.parse(reader.result);state=migrateState(data);await saveState('Backup restaurado');refreshYearOptions();render();toast('Backup restaurado com sucesso.','success');}catch(err){console.error(err);toast('Arquivo de backup inválido.','error');}};
    reader.readAsText(file);
  }
  function downloadBlob(blob,filename) { const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

  function toast(message,type='') {
    const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;$('#toastStack').appendChild(el);setTimeout(()=>el.remove(),3300);
  }

  window.App = { navigate, openDeliveryModal, openCycleModal, openCostModal, showTrace };
  initialize();
})();
