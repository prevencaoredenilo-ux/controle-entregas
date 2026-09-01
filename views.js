import { Deliveries, Vehicles, Drivers, Collaborators, Neighborhoods, CostCategories, ReturnReasons, Cycles, OdometerLogs, Costs, AuditLog, Counters } from './db.js';
import { $, $$, money, dateBR, dateTimeBR, timeBR, escapeHtml, toast, badge, STATUS_META, guardClick, downloadCSV, downloadJSON, wirePhoneMask, animateStatCards, motivationalPhrase, performanceProfile, barChartSVG, thermometerHTML } from './helpers.js';
import { getEnv, getOperatorName, closeModal, openModal, refreshApp } from './app.js';

/* =========================================================
   CENTRAL OPERACIONAL
   ========================================================= */
export async function renderCentral() {
  const env = getEnv();
  const rows = await Deliveries.active(env);
  const [cycles, vehicles, drivers, collaborators, kmLogs] = await Promise.all([
    Cycles.all(), Vehicles.all(), Drivers.all(), Collaborators.all(), OdometerLogs.all(),
  ]);
  const openCycles = cycles.filter((c) => c.environment === env && c.status === 'aberto' && !c.deletedAt);
  const vName = (id) => vehicles.find((v) => v.id === id)?.label || 'Veículo';
  const dName = (id) => drivers.find((d) => d.id === id)?.name || 'Entregador';

  const naLoja = rows.filter((r) => r.status === 'na_loja');
  const emRota = rows.filter((r) => ['em_rota', 'no_cliente'].includes(r.status));
  const prioritarias = rows.filter((r) => r.priority === 'alta' && ['na_loja', 'em_rota', 'no_cliente'].includes(r.status));
  const reentrega = rows.filter((r) => r.status === 'reentrega');
  const agendadas = rows.filter((r) => r.type === 'agendada' && r.status === 'programada');
  const atrasadas = rows.filter((r) => {
    if (!['na_loja', 'em_rota', 'no_cliente'].includes(r.status)) return false;
    const mins = (Date.now() - new Date(r.entryTime).getTime()) / 60000;
    return mins > 60;
  });
  const pendingKmLogs = kmLogs.filter((k) => k.environment === env && k.kmEnd == null);
  const kmPendente = pendingKmLogs.length;

  const now = new Date();
  const isToday = (value) => {
    const d = new Date(value);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  const todayRows = rows.filter((r) => isToday(r.entryTime));
  const completedToday = todayRows.filter((r) => (r.status === 'finalizada' && !!r.deliveredAt) || r.status === 'retirada_loja').length;
  const problemsToday = todayRows.filter((r) => ['retorno', 'reentrega', 'cancelada'].includes(r.status)).length;
  const lateToday = atrasadas.filter((r) => isToday(r.entryTime)).length;
  const totalToday = todayRows.length;
  const pendingToday = todayRows.filter((r) => ['na_loja','em_rota','no_cliente','programada','reentrega'].includes(r.status)).length;
  const completionPctToday = totalToday ? Math.round((completedToday / totalToday) * 100) : 0;
  const completion = totalToday ? completedToday / totalToday : 0.5;
  const punctuality = totalToday ? Math.max(0, 1 - (lateToday / totalToday)) : 0.5;
  const quality = totalToday ? Math.max(0, 1 - (problemsToday / totalToday)) : 0.5;
  const score = Math.round((completion * 65) + (punctuality * 20) + (quality * 15));
  const profile = performanceProfile(score);
  const mood = profile.mood;
  const phrase = motivationalPhrase(score);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const activeCollaborators = collaborators.filter((c) => c.active !== false);
  const selectedName = getOperatorName();
  const firstName = activeCollaborators.find((c) => c.name === selectedName)?.name || activeCollaborators[0]?.name || '';

  const alerts = [];
  if (atrasadas.length) alerts.push({ text: `⚠️ ${atrasadas.length} entrega(s) atrasada(s) há mais de 60 min`, query: 'na_loja' });
  if (prioritarias.length) alerts.push({ text: `⭐ ${prioritarias.length} entrega(s) prioritária(s) aguardando`, query: 'alta' });
  if (kmPendente) alerts.push({ text: `⌁ ${kmPendente} veículo(s) sem KM final registrado`, query: '' });
  if (reentrega.length) alerts.push({ text: `↻ ${reentrega.length} entrega(s) aguardando reentrega`, query: 'reentrega' });

  return `
    <div class="central-hero" style="--performance-color:${profile.color}">
      <div class="orbit-decor" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="mascot-frame interactive" role="button" tabindex="0" aria-label="Interagir com o mascote Nilo" data-score="${score}">
        <img src="assets/brand/mascote.png" alt="Mascote Nilo" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'mascot-fallback',textContent:'🧑\u200d🌾'}))" />
        <div class="mascot-mood" id="mascotMood" data-score="${score}">${mood}</div>
        <span class="mascot-hint">Clique em mim</span>
      </div>
      <div class="hero-copy">
        <div class="eyebrow">CENTRAL OPERACIONAL · AO VIVO</div>
        <div class="greeting-title">${greet}<span id="greetName">${firstName ? ', ' + escapeHtml(firstName) : ''}</span>! <span class="hello-wave">👋</span></div>
        <div class="greeting-phrase">${phrase}</div>
        <div style="color:var(--text-muted);font-size:12px;margin-top:2px">${env === 'treino' ? '🎓 Modo Treinamento — nada aqui entra no histórico oficial.' : 'Operação Real'}</div>
      </div>
      <div class="greeting-thermo">${thermometerHTML(score, 'Termômetro de desempenho')}</div>
    </div>

    ${alerts.length ? `<div class="alert-strip">${alerts.map((a) => `<button type="button" class="alert-chip" data-query="${escapeHtml(a.query)}">${a.text}</button>`).join('')}</div>` : ''}

    <div class="day-performance-head"><div><span>DESEMPENHO DO DIA</span><h2>Progresso de hoje</h2></div><strong>${completionPctToday}% concluído</strong></div>
    <div class="day-performance-grid">
      <div class="day-performance-card" data-tip="Total de entregas registradas hoje."><small>Registradas</small><strong data-count="${totalToday}">0</strong></div>
      <div class="day-performance-card good" data-tip="Finalizadas hoje com hora de conclusão na casa do cliente, mais retiradas na loja."><small>Finalizadas</small><strong data-count="${completedToday}">0</strong></div>
      <div class="day-performance-card" data-tip="Entregas de hoje que ainda precisam de alguma ação operacional."><small>Pendentes</small><strong data-count="${pendingToday}">0</strong></div>
      <div class="day-performance-card ${lateToday ? 'bad' : 'good'}" data-tip="Entregas de hoje abertas há mais de 60 minutos."><small>Atrasadas</small><strong data-count="${lateToday}">0</strong></div>
      <div class="day-performance-card ${problemsToday ? 'warning' : ''}" data-tip="Retornos, reentregas e cancelamentos registrados hoje."><small>Ocorrências</small><strong data-count="${problemsToday}">0</strong></div>
      <div class="day-performance-card score" data-tip="Percentual de entregas de hoje já concluídas com registro correto."><small>Conclusão</small><strong>${completionPctToday}%</strong><i><b style="width:${completionPctToday}%"></b></i></div>
    </div>

    <div class="stat-row">
      <button class="stat-card clickable" data-central-filter="na_loja" data-tip="Compras lançadas aguardando um ciclo. Clique para filtrar a fila."><span class="stat-icon blue">⌂</span><small>Na loja</small><strong data-count="${naLoja.length}">0</strong><em>aguardando saída</em></button>
      <button class="stat-card clickable" data-central-filter="em_andamento" data-tip="Entregas em rota ou já na casa do cliente. Clique para filtrar."><span class="stat-icon cyan">➜</span><small>Em andamento</small><strong data-count="${emRota.length}">0</strong><em>rota ou cliente</em></button>
      <button class="stat-card clickable" data-central-filter="alta" data-tip="Prioridades altas na loja ou em rota. Clique para filtrar."><span class="stat-icon yellow">★</span><small>Prioritárias</small><strong data-count="${prioritarias.length}">0</strong><em>exigem atenção</em></button>
      <button class="stat-card clickable ${atrasadas.length ? 'danger-card' : ''}" data-central-filter="atrasada" data-tip="Entregas abertas há mais de 60 minutos. Clique para ver as ocorrências."><span class="stat-icon red">!</span><small>Atrasadas (&gt;60min)</small><strong data-count="${atrasadas.length}">0</strong><em>${atrasadas.length ? 'agir agora' : 'tudo em ordem'}</em></button>
    </div>
    <div class="stat-row">
      <button class="stat-card clickable" data-central-action="close-cycle" data-tip="Ciclos abertos agora. Clique para finalizar um ciclo."><span class="stat-icon violet">↻</span><small>Ciclos ativos</small><strong data-count="${openCycles.length}">0</strong><em>veículos ocupados</em></button>
      <button class="stat-card clickable" data-central-filter="reentrega" data-tip="Entregas que voltaram e precisam de nova tentativa."><span class="stat-icon orange">↺</span><small>Para reentrega</small><strong data-count="${reentrega.length}">0</strong><em>nova tentativa</em></button>
      <button class="stat-card clickable" data-central-filter="programada" data-tip="Entregas programadas para uma data e hora futura."><span class="stat-icon green">◷</span><small>Agendadas</small><strong data-count="${agendadas.length}">0</strong><em>programadas</em></button>
      <button class="stat-card clickable" data-central-action="km" data-tip="Expedientes sem KM final. Clique para registrar."><span class="stat-icon navy">⌁</span><small>KM pendente</small><strong data-count="${kmPendente}">0</strong><em>fechar expediente</em></button>
    </div>

    <section class="operation-launcher">
      <div class="section-heading"><div><span>COMANDOS RÁPIDOS</span><h2>Toda a operação em um só lugar</h2></div><div class="heading-signal"><i></i>Atualização automática</div></div>
      <div class="action-grid">
        <button class="action-card primary-action" id="qaNewDelivery" data-tip="Abra o cadastro completo de uma nova entrega."><span>＋</span><strong>Nova entrega</strong><small>Cadastrar uma compra</small></button>
        <button class="action-card arrival-action" id="qaArrival" data-tip="Selecione uma entrega em rota e registre imediatamente a hora em que chegou na casa do cliente."><span>⌂</span><strong>Chegou no cliente</strong><small>Registrar hora da chegada</small></button>
        <button class="action-card" id="qaStartCycle" data-tip="Selecione veículo, entregador e as compras que sairão neste ciclo."><span>▶</span><strong>Iniciar ciclo</strong><small>Selecionar rota e equipe</small></button>
        <button class="action-card" id="qaCloseCycle" data-tip="Finalize um ciclo resolvendo uma entrega pendente por vez e informando os horários obrigatórios."><span>■</span><strong>Finalizar ciclo</strong><small>Resolver pendências</small></button>
        <button class="action-card" id="qaKm" data-tip="Registre o KM inicial ou feche um expediente com o KM final."><span>⌁</span><strong>Registrar KM</strong><small>Início ou fechamento</small></button>
        <button class="action-card" id="qaCost" data-tip="Lance combustível, manutenção e outras despesas da operação."><span>R$</span><strong>Lançar custo</strong><small>Despesa da operação</small></button>
      </div>
    </section>

    <div class="operation-panels">
      <section class="ops-panel">
        <div class="panel-head"><div><span class="live-mini"></span><strong>Ciclos em andamento</strong></div><button class="text-action" id="panelStartCycle">＋ Novo ciclo</button></div>
        ${openCycles.length ? openCycles.map((c) => `<div class="ops-line"><div><strong>${escapeHtml(vName(c.vehicleId))}</strong><small>${escapeHtml(dName(c.driverId))} · ${(c.deliveryIds || []).length} entrega(s)</small></div><button class="btn-ghost btn-small central-cycle-close" data-id="${c.id}">Finalizar</button></div>`).join('') : '<div class="panel-empty">Nenhum ciclo aberto agora.</div>'}
      </section>
      <section class="ops-panel">
        <div class="panel-head"><div><span class="live-mini ${kmPendente ? 'warning' : ''}"></span><strong>Expedientes de KM</strong></div><button class="text-action" id="panelKmStart">＋ Iniciar</button></div>
        ${pendingKmLogs.length ? pendingKmLogs.map((l) => `<div class="ops-line"><div><strong>${escapeHtml(vName(l.vehicleId))}</strong><small>KM inicial ${l.kmStart} · ${dateBR(l.shiftDate)}</small></div><button class="btn-ghost btn-small central-km-close" data-id="${l.id}">KM final</button></div>`).join('') : '<div class="panel-empty">Todos os expedientes estão fechados.</div>'}
      </section>
    </div>

    <div class="queue-heading"><div><span>FILA OPERACIONAL</span><h2>Entregas que exigem acompanhamento</h2></div><label class="central-search">⌕<input id="centralQueueSearch" placeholder="Buscar compra, cupom, PDV, DOC ou cliente" /></label></div>
    ${await miniList([...naLoja, ...emRota])}
  `;
}

async function miniList(rows) {
  if (!rows.length) return `<div class="empty-state"><strong>Nada por aqui agora</strong>As entregas na loja e em rota aparecem nesta lista.</div>`;
  const trs = rows.slice(0, 30).map((r) => `
    <tr data-id="${r.id}" class="row-click" data-status="${r.status}" data-priority="${r.priority}" data-late="${((Date.now() - new Date(r.entryTime).getTime()) / 60000) > 60 ? 'true' : 'false'}" data-search="${escapeHtml([r.purchaseNumber, r.coupon, r.pdv, r.doc, r.clientName, r.street].join(' ').toLowerCase())}" data-tip="Compra #${r.purchaseNumber} · ${escapeHtml(r.clientName || 'Cliente sem nome')} · Cupom ${escapeHtml(r.coupon || 'não informado')} · PDV ${escapeHtml(r.pdv || '—')} · DOC ${escapeHtml(r.doc || '—')} · Status ${escapeHtml(STATUS_META[r.status]?.label || r.status)} · Chegada ${timeBR(r.clientArrivalAt)} · Finalização ${timeBR(r.deliveredAt)}">
      <td><strong>#${r.purchaseNumber}</strong></td>
      <td>${escapeHtml(r.clientName || 'Sem nome')}<br><span style="color:var(--text-muted);font-size:11px">${escapeHtml(r.street || '')}</span></td>
      <td><strong>${escapeHtml(r.coupon || '—')}</strong><br><span style="color:var(--text-muted);font-size:11px">PDV ${escapeHtml(r.pdv || '—')} · DOC ${escapeHtml(r.doc || '—')}</span></td>
      <td>${badge(r.status)}<br><span class="delivery-times">Chegou: ${timeBR(r.clientArrivalAt)} · Final: ${timeBR(r.deliveredAt)}</span></td>
      <td>${r.priority === 'alta' ? '<span class="badge problema">Alta</span>' : '—'}</td>
      <td>${money(r.deliveryFee)}</td>
      <td>${r.status === 'em_rota' ? `<button class="btn-primary btn-small arrival-row-btn" data-id="${r.id}">Chegou no cliente</button>` : r.status === 'no_cliente' ? `<button class="btn-primary btn-small completion-row-btn" data-id="${r.id}">Finalizar entrega</button>` : '<span style="color:var(--text-muted)">—</span>'}</td>
    </tr>`).join('');
  return `<div class="table-wrap central-queue"><table><thead><tr><th>Compra</th><th>Cliente / endereço</th><th>Cupom / documento</th><th>Status</th><th>Prioridade</th><th>Taxa</th><th>Ação rápida</th></tr></thead><tbody>${trs}</tbody></table><div class="queue-no-result hidden" id="queueNoResult">Nenhuma entrega corresponde a esse filtro.</div></div>`;
}

let _phraseTimer = null;
let _waveTimer = null;
let _nameTimer = null;

export function wireCentralEvents() {
  $$('.row-click').forEach((tr) => tr.addEventListener('click', async () => {
    const rec = await Deliveries.get(tr.dataset.id);
    if (rec) openDeliveryModal(rec);
  }));
  $('#qaNewDelivery')?.addEventListener('click', () => openDeliveryModal());
  $('#qaStartCycle')?.addEventListener('click', () => openStartCycleModal());
  $('#qaArrival')?.addEventListener('click', () => openArrivalPicker());
  $('#qaKm')?.addEventListener('click', () => openKmStartModal());
  $('#qaCost')?.addEventListener('click', () => openCostModal());
  $('#panelStartCycle')?.addEventListener('click', () => openStartCycleModal());
  $('#panelKmStart')?.addEventListener('click', () => openKmStartModal());
  $('#qaCloseCycle')?.addEventListener('click', async () => {
    const cycles = (await Cycles.all()).filter((c) => c.environment === getEnv() && c.status === 'aberto' && !c.deletedAt);
    if (!cycles.length) return toast('Não há ciclo aberto no momento.', 'error');
    if (cycles.length === 1) return openCloseCycleModal(cycles[0]);
    openCyclePicker(cycles);
  });
  $$('.central-cycle-close').forEach((btn) => btn.addEventListener('click', async () => {
    const cycle = await Cycles.get(btn.dataset.id);
    if (cycle) openCloseCycleModal(cycle);
  }));
  $$('.central-km-close').forEach((btn) => btn.addEventListener('click', async () => {
    const log = await OdometerLogs.get(btn.dataset.id);
    if (log) openKmEndModal(log);
  }));
  $$('.arrival-row-btn').forEach((btn) => btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const record = await Deliveries.get(btn.dataset.id);
    if (record) openClientArrivalFlow(record);
  }));
  $$('.completion-row-btn').forEach((btn) => btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const record = await Deliveries.get(btn.dataset.id);
    if (record) openDeliveryCompletionFlow(record);
  }));
  $$('[data-central-action]').forEach((card) => card.addEventListener('click', async () => {
    if (card.dataset.centralAction === 'km') {
      const pending = (await OdometerLogs.all()).filter((k) => k.environment === getEnv() && k.kmEnd == null);
      if (pending.length === 1) return openKmEndModal(pending[0]);
      if (!pending.length) return openKmStartModal();
      return openKmPicker(pending);
    }
    const cycles = (await Cycles.all()).filter((c) => c.environment === getEnv() && c.status === 'aberto' && !c.deletedAt);
    if (!cycles.length) return toast('Não há ciclo aberto no momento.', 'error');
    if (cycles.length === 1) return openCloseCycleModal(cycles[0]);
    openCyclePicker(cycles);
  }));
  $$('.alert-chip').forEach((chip) => chip.addEventListener('click', () => {
    applyCentralFilter(chip.dataset.query || '');
  }));

  const queueSearch = $('#centralQueueSearch');
  queueSearch?.addEventListener('input', () => applyCentralFilter(queueSearch.value));
  $$('[data-central-filter]').forEach((card) => card.addEventListener('click', () => {
    const active = card.classList.contains('filter-active');
    $$('[data-central-filter]').forEach((item) => item.classList.remove('filter-active'));
    const value = active ? '' : card.dataset.centralFilter;
    if (!active) card.classList.add('filter-active');
    if (queueSearch) queueSearch.value = '';
    applyCentralFilter(value);
    $('.queue-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  // frases motivacionais alternando sozinhas a cada 8s, sem recarregar o card inteiro
  clearInterval(_phraseTimer);
  _phraseTimer = setInterval(() => {
    const el = $('.greeting-phrase');
    const moodEl = $('#mascotMood');
    if (!el || !moodEl) { clearInterval(_phraseTimer); return; }
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent = motivationalPhrase(Number(moodEl.dataset.score || 0));
      el.style.opacity = '1';
    }, 200);
  }, 8000);

  // mascote acena de tempos em tempos, sem ficar repetitivo demais
  clearInterval(_waveTimer);
  _waveTimer = setInterval(() => {
    const img = $('.mascot-frame img');
    if (!img) { clearInterval(_waveTimer); return; }
    img.classList.add('waving');
    setTimeout(() => img.classList.remove('waving'), 900);
  }, 6000);

  // a saudação percorre automaticamente todos os colaboradores ativos
  clearInterval(_nameTimer);
  Collaborators.all().then((list) => {
    const active = list.filter((c) => c.active !== false);
    if (!active.length) return;
    const selectedIndex = active.findIndex((c) => c.name === getOperatorName());
    let i = selectedIndex >= 0 ? selectedIndex : 0;
    _nameTimer = setInterval(() => {
      const other = $('#greetName');
      if (!other) { clearInterval(_nameTimer); return; }
      i = (i + 1) % active.length;
      other.style.opacity = '0';
      setTimeout(() => {
        other.textContent = ', ' + active[i].name;
        other.style.opacity = '1';
      }, 220);
    }, 5000);
  });

  const mascot = $('.mascot-frame.interactive');
  const reactMascot = () => {
    if (!mascot) return;
    mascot.classList.remove('mascot-react');
    void mascot.offsetWidth;
    mascot.classList.add('mascot-react');
    const phraseEl = $('.greeting-phrase');
    if (phraseEl) phraseEl.textContent = motivationalPhrase(Number(mascot.dataset.score || 0));
    setTimeout(() => mascot.classList.remove('mascot-react'), 1100);
  };
  mascot?.addEventListener('click', reactMascot);
  mascot?.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reactMascot(); } });
}

function applyCentralFilter(value) {
  const q = String(value || '').trim().toLowerCase();
  const rows = $$('.central-queue tbody tr');
  let visible = 0;
  rows.forEach((row) => {
    const matches = !q
      || (q === 'atrasada' && row.dataset.late === 'true')
      || (q === 'alta' && row.dataset.priority === 'alta')
      || (q === 'em_andamento' && ['em_rota', 'no_cliente'].includes(row.dataset.status))
      || row.dataset.status === q
      || (row.dataset.search || '').includes(q);
    row.classList.toggle('hidden', !matches);
    if (matches) visible++;
  });
  $('#queueNoResult')?.classList.toggle('hidden', visible !== 0);
}

async function openCyclePicker(cycles) {
  const vehicles = await Vehicles.all();
  const drivers = await Drivers.all();
  openModal({
    title: 'Qual ciclo deseja finalizar?',
    subtitle: 'Escolha o ciclo para iniciar a conferência das entregas pendentes.',
    body: `<div class="picker-list">${cycles.map((c) => `<button class="picker-row" data-cycle-id="${c.id}"><strong>${escapeHtml(vehicles.find((v) => v.id === c.vehicleId)?.label || 'Veículo')}</strong><span>${escapeHtml(drivers.find((d) => d.id === c.driverId)?.name || 'Entregador')} · ${(c.deliveryIds || []).length} entrega(s)</span></button>`).join('')}</div>`,
    actions: [{ label: 'Cancelar', kind: 'ghost', onClick: closeModal }],
  });
  $$('.picker-row[data-cycle-id]').forEach((btn) => btn.addEventListener('click', async () => {
    const cycle = await Cycles.get(btn.dataset.cycleId);
    if (cycle) openCloseCycleModal(cycle);
  }));
}

async function openKmPicker(logs) {
  const vehicles = await Vehicles.all();
  openModal({
    title: 'Qual expediente deseja fechar?',
    body: `<div class="picker-list">${logs.map((l) => `<button class="picker-row" data-km-id="${l.id}"><strong>${escapeHtml(vehicles.find((v) => v.id === l.vehicleId)?.label || 'Veículo')}</strong><span>KM inicial ${l.kmStart} · ${dateBR(l.shiftDate)}</span></button>`).join('')}</div>`,
    actions: [{ label: 'Cancelar', kind: 'ghost', onClick: closeModal }],
  });
  $$('.picker-row[data-km-id]').forEach((btn) => btn.addEventListener('click', async () => {
    const log = await OdometerLogs.get(btn.dataset.kmId);
    if (log) openKmEndModal(log);
  }));
}

async function openArrivalPicker() {
  const rows = (await Deliveries.active(getEnv())).filter((r) => r.status === 'em_rota');
  if (!rows.length) return toast('Não há entrega em rota aguardando registro de chegada.', 'error');
  openModal({
    title: 'Registrar chegada no cliente',
    subtitle: 'Escolha qual entrega chegou à casa do cliente.',
    body: `<div class="picker-list">${rows.map((r) => `<button class="picker-row arrival-picker-row" data-id="${r.id}"><strong>#${r.purchaseNumber} · ${escapeHtml(r.clientName || r.street || 'Sem nome')}</strong><span>Cupom ${escapeHtml(r.coupon || '—')} · PDV ${escapeHtml(r.pdv || '—')} · DOC ${escapeHtml(r.doc || '—')}</span></button>`).join('')}</div>`,
    actions: [{ label: 'Cancelar', kind: 'ghost', onClick: closeModal }],
  });
  $$('.arrival-picker-row').forEach((btn) => btn.addEventListener('click', async () => {
    const record = await Deliveries.get(btn.dataset.id);
    if (record) openClientArrivalFlow(record);
  }));
}

/* =========================================================
   MODAL — CADASTRO / EDIÇÃO DE ENTREGA (seção 7 e 8)
   ========================================================= */
function localDateTimeValue(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function operationalTimeFields(record) {
  if (!record) return '';
  return `
    <fieldset class="operational-times-card">
      <legend>Horários da entrega</legend>
      <p>Todos podem ser corrigidos depois. As alterações ficam registradas na auditoria.</p>
      <label>Saída da loja<input type="datetime-local" name="leftStoreAt" value="${localDateTimeValue(record.leftStoreAt)}" /></label>
      <div class="field-row">
        <label>Chegada na casa do cliente<input type="datetime-local" name="clientArrivalAt" value="${localDateTimeValue(record.clientArrivalAt)}" /></label>
        <label>Finalizada na casa do cliente<input type="datetime-local" name="deliveredAt" value="${localDateTimeValue(record.deliveredAt)}" /></label>
      </div>
    </fieldset>`;
}

export async function openDeliveryModal(record = null) {
  const isEdit = !!record;
  const env = getEnv();
  const neighborhoods = (await Neighborhoods.all()).filter((n) => n.active);
  const vehicles = (await Vehicles.all()).filter((v) => v.active);
  const drivers = (await Drivers.all()).filter((d) => d.active);

  const body = `
    <form id="deliveryForm">
      <div class="field-row">
        <label>Nº da compra<input value="${record?.purchaseNumber ?? '(automático ao salvar)'}" disabled /></label>
        <label>Nº de chegada<input value="${record?.arrivalNumber ?? '(automático ao salvar)'}" disabled /></label>
      </div>
      <div class="field-row">
        <label>Hora de entrada *<input type="time" name="entryTimeOnly" required value="${record ? new Date(record.entryTime).toTimeString().slice(0,5) : new Date().toTimeString().slice(0,5)}" /></label>
        <label>PDV/Caixa *<input name="pdv" required value="${escapeHtml(record?.pdv || '')}" /></label>
      </div>
      <div class="field-row">
        <label>DOC *<input name="doc" required value="${escapeHtml(record?.doc || '')}" /></label>
        <label>Cupom<input name="coupon" value="${escapeHtml(record?.coupon || '')}" /></label>
      </div>
      <label>Cliente<input name="clientName" value="${escapeHtml(record?.clientName || '')}" placeholder="Opcional" /></label>
      <label>Telefone<input name="phone" value="${escapeHtml(record?.phone || '')}" placeholder="(99) 99999-9999" data-mask="phone" /></label>
      <label>Endereço *<input name="street" required value="${escapeHtml(record?.street || '')}" /></label>
      <div class="field-row">
        <label>Número<input name="houseNumber" value="${escapeHtml(record?.houseNumber || '')}" /></label>
        <label>Complemento<input name="complement" value="${escapeHtml(record?.complement || '')}" /></label>
      </div>
      <label>Referência<input name="reference" value="${escapeHtml(record?.reference || '')}" /></label>
      <label>Bairro *
        <select name="neighborhoodId" required>
          <option value="">Selecione…</option>
          ${neighborhoods.map((n) => `<option value="${n.id}" ${record?.neighborhoodId === n.id ? 'selected' : ''}>${escapeHtml(n.name)}</option>`).join('')}
        </select>
        ${!neighborhoods.length ? '<small style="color:var(--status-problema)">Nenhum bairro cadastrado — cadastre em Cadastros → Bairros.</small>' : ''}
      </label>
      <div class="field-row">
        <label>Taxa de entrega
          <select name="feeOption">
            <option value="6.99" ${record?.deliveryFee === 6.99 ? 'selected' : ''}>R$ 6,99</option>
            <option value="9.99" ${record?.deliveryFee === 9.99 ? 'selected' : ''}>R$ 9,99</option>
            <option value="0" ${record?.deliveryFee === 0 ? 'selected' : ''}>Sem taxa</option>
            <option value="livre" ${record && ![6.99,9.99,0].includes(record.deliveryFee) ? 'selected' : ''}>Valor livre</option>
          </select>
        </label>
        <label>Valor livre (se aplicável)<input name="feeCustom" type="number" step="0.01" min="0" value="${record && ![6.99,9.99,0].includes(record?.deliveryFee) ? record.deliveryFee : ''}" /></label>
      </div>
      <div class="field-row">
        <label>Tamanho
          <select name="size" id="sizeSelect">
            <option value="normal" ${record?.size !== 'grande' ? 'selected' : ''}>Normal</option>
            <option value="grande" ${record?.size === 'grande' ? 'selected' : ''}>Grande</option>
          </select>
        </label>
        <label>Viagens (se Grande)<input name="tripCount" type="number" min="1" value="${record?.tripCount || 1}" ${record?.size !== 'grande' ? 'disabled' : ''} /></label>
      </div>
      <div class="field-row">
        <label>Prioridade
          <select name="priority">
            <option value="normal" ${record?.priority !== 'alta' ? 'selected' : ''}>Normal</option>
            <option value="alta" ${record?.priority === 'alta' ? 'selected' : ''}>Alta</option>
          </select>
        </label>
        <label>Tipo
          <select name="type" id="typeSelect">
            <option value="hoje" ${record?.type !== 'agendada' ? 'selected' : ''}>Hoje</option>
            <option value="agendada" ${record?.type === 'agendada' ? 'selected' : ''}>Agendada</option>
          </select>
        </label>
      </div>
      <label id="scheduledWrap" class="${record?.type === 'agendada' ? '' : 'hidden'}">Data/hora agendada *
        <input name="scheduledAt" type="datetime-local" value="${record?.scheduledAt ? record.scheduledAt.slice(0,16) : ''}" />
      </label>
      <div class="field-row">
        <label>Veículo
          <select name="vehicleId">
            <option value="">—</option>
            ${vehicles.map((v) => `<option value="${v.id}" ${record?.vehicleId === v.id ? 'selected' : ''}>${escapeHtml(v.label)}</option>`).join('')}
          </select>
        </label>
        <label>Entregador
          <select name="driverId">
            <option value="">—</option>
            ${drivers.map((d) => `<option value="${d.id}" ${record?.driverId === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
          </select>
        </label>
      </div>
      ${operationalTimeFields(record)}
      <label>Observações<textarea name="notes" rows="2">${escapeHtml(record?.notes || '')}</textarea></label>
    </form>
  `;

  const statusActions = isEdit ? deliveryStatusActionsHtml(record) : '';

  openModal({
    title: isEdit ? `Editar entrega #${record.purchaseNumber}` : 'Registrar entrega',
    subtitle: isEdit ? `Status atual: ${STATUS_META[record.status]?.label}` : 'Preencha os campos obrigatórios (*)',
    body: body + statusActions,
    actions: isEdit
      ? [
          { label: 'Remover (lixeira)', kind: 'danger', onClick: async () => { await Deliveries.softDelete(record.id); toast('Entrega enviada para a lixeira.', 'success'); closeModal(); refreshApp(); } },
          { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
          { label: 'Salvar alterações', kind: 'primary', onClick: () => saveDeliveryForm(record) },
        ]
      : [
          { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
          { label: 'Registrar', kind: 'primary', onClick: () => saveDeliveryForm(null) },
        ],
  });

  $('#sizeSelect')?.addEventListener('change', (e) => {
    $('input[name="tripCount"]').disabled = e.target.value !== 'grande';
  });
  $('#typeSelect')?.addEventListener('change', (e) => {
    $('#scheduledWrap').classList.toggle('hidden', e.target.value !== 'agendada');
  });
  wireDeliveryStatusActions(record);
  wirePhoneMask($('#modalBody'));
}

function deliveryStatusActionsHtml(record) {
  const buttons = [];
  if (record.status === 'na_loja') buttons.push('<button type="button" class="btn-ghost btn-small" data-action="em_rota">Marcar Em rota</button>');
  if (record.status === 'em_rota') {
    buttons.push('<button type="button" class="btn-ghost btn-small" data-action="chegou_cliente">Chegou ao cliente</button>');
    buttons.push('<button type="button" class="btn-primary btn-small" data-action="finalizada">Finalizar na casa do cliente</button>');
    buttons.push('<button type="button" class="btn-ghost btn-small" data-action="retirada">Retirada na loja</button>');
  }
  if (record.status === 'no_cliente') buttons.push('<button type="button" class="btn-primary btn-small" data-action="finalizada">Finalizar na casa do cliente</button>');
  if (record.status === 'na_loja') buttons.push('<button type="button" class="btn-ghost btn-small" data-action="retirada">Retirada na loja</button>');
  if (record.status === 'finalizada') {
    buttons.push('<button type="button" class="btn-ghost btn-small" data-action="editar_horarios">Editar horários</button>');
    buttons.push('<button type="button" class="btn-ghost btn-small" data-action="retorno">Registrar retorno</button>');
  }
  if (record.type === 'agendada' || record.status === 'programada') {
    buttons.push('<button type="button" class="btn-ghost btn-small" data-action="reagendar">Reagendar</button>');
  }
  const history = (record.statusHistory || []).slice(-5).reverse().map((h) =>
    `<div style="font-size:11.5px;color:var(--text-muted)">${dateTimeBR(h.at)} — ${STATUS_META[h.from]?.label || h.from || 'início'} → ${STATUS_META[h.to]?.label || h.to}${h.note ? ' · ' + escapeHtml(h.note) : ''}</div>`
  ).join('');
  return `
    <div style="border-top:1px solid var(--line);margin-top:6px;padding-top:12px">
      <label style="margin-bottom:8px">Ações de status</label>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${buttons.join('') || '<span style="font-size:12px;color:var(--text-muted)">Sem transições disponíveis para o status atual.</span>'}</div>
      ${history ? `<div style="margin-top:10px"><label>Histórico recente</label>${history}</div>` : ''}
    </div>`;
}

function wireDeliveryStatusActions(record) {
  if (!record) return;
  $$('#modalBody [data-action]').forEach((btn) => {
    guardClick(btn, async () => {
      const action = btn.dataset.action;
      if (action === 'em_rota') { await Deliveries.changeStatus(record.id, 'em_rota'); toast('Entrega em rota.', 'success'); closeModal(); refreshApp(); }
      if (action === 'chegou_cliente') openClientArrivalFlow(record);
      if (action === 'finalizada') openDeliveryCompletionFlow(record);
      if (action === 'editar_horarios') openDeliveryCompletionFlow(record, { editing: true });
      if (action === 'retirada') openRetiradaFlow(record);
      if (action === 'retorno') openRetornoFlow(record);
      if (action === 'reagendar') openReagendarFlow(record);
    });
  });
}

function openClientArrivalFlow(record) {
  openModal({
    title: 'Chegada na casa do cliente',
    subtitle: `Entrega #${record.purchaseNumber} · registre o horário real da chegada.`,
    body: `
      <form id="clientArrivalForm">
        <label>Data e hora da chegada *<input type="datetime-local" name="clientArrivalAt" required value="${localDateTimeValue(record.clientArrivalAt || new Date())}" /></label>
      </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Confirmar chegada', kind: 'primary', onClick: async () => {
        const form = $('#clientArrivalForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const clientArrivalAt = new Date(fd.clientArrivalAt).toISOString();
        if (record.leftStoreAt && new Date(clientArrivalAt) < new Date(record.leftStoreAt)) return toast('A chegada não pode ser anterior à saída da loja.', 'error');
        await Deliveries.changeStatus(record.id, 'no_cliente', { clientArrivalAt, arrivalRegisteredBy: getOperatorName(), note: 'Chegada registrada na casa do cliente.' });
        toast(`Chegada registrada às ${timeBR(clientArrivalAt)}.`, 'success');
        closeModal();
        refreshApp();
      }},
    ],
  });
}

function openDeliveryCompletionFlow(record, { cycle = null, editing = false } = {}) {
  const arrivalDefault = record.clientArrivalAt || new Date();
  const deliveredDefault = record.deliveredAt || new Date();
  openModal({
    title: editing ? 'Editar horários da entrega' : 'Finalizar na casa do cliente',
    subtitle: `Entrega #${record.purchaseNumber} · a finalização exige os dois horários.`,
    body: `
      <form id="deliveryCompletionForm">
        <label>Chegada na casa do cliente *<input type="datetime-local" name="clientArrivalAt" required value="${localDateTimeValue(arrivalDefault)}" /></label>
        <label>Finalizada na casa do cliente *<input type="datetime-local" name="deliveredAt" required value="${localDateTimeValue(deliveredDefault)}" /></label>
        <label>Observação da conclusão<textarea name="completionNote" rows="2" placeholder="Opcional"></textarea></label>
      </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: editing ? 'Salvar horários' : 'Confirmar finalização', kind: 'primary', onClick: async () => {
        const form = $('#deliveryCompletionForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const clientArrivalAt = new Date(fd.clientArrivalAt).toISOString();
        const deliveredAt = new Date(fd.deliveredAt).toISOString();
        if (record.leftStoreAt && new Date(clientArrivalAt) < new Date(record.leftStoreAt)) return toast('A chegada não pode ser anterior à saída da loja.', 'error');
        if (new Date(deliveredAt) < new Date(clientArrivalAt)) return toast('A hora de finalização não pode ser anterior à chegada.', 'error');
        await Deliveries.changeStatus(record.id, 'finalizada', {
          clientArrivalAt, deliveredAt,
          arrivalRegisteredBy: record.arrivalRegisteredBy || getOperatorName(),
          completionRegisteredBy: getOperatorName(),
          completionUpdatedAt: new Date().toISOString(),
          note: fd.completionNote?.trim() || (editing ? 'Horários de conclusão corrigidos.' : `Finalizada na casa do cliente às ${timeBR(deliveredAt)}.`),
        });
        toast(`Entrega finalizada às ${timeBR(deliveredAt)}.`, 'success');
        if (cycle) return advanceCloseCycle(cycle);
        closeModal();
        refreshApp();
      }},
    ],
  });
}

async function saveDeliveryForm(record) {
  const form = $('#deliveryForm');
  if (!form.reportValidity()) return;
  const fd = Object.fromEntries(new FormData(form).entries());
  const env = getEnv();

  const neighborhoods = await Neighborhoods.all();
  if (!fd.neighborhoodId) return toast('Selecione um bairro cadastrado.', 'error');

  let fee = fd.feeOption === 'livre' ? Number(fd.feeCustom || 0) : Number(fd.feeOption);
  const [hh, mm] = (fd.entryTimeOnly || '00:00').split(':');
  const entryTime = new Date();
  entryTime.setHours(Number(hh), Number(mm), 0, 0);

  if (fd.type === 'agendada' && !fd.scheduledAt) return toast('Informe a data e hora do agendamento.', 'error');

  // duplicidade acidental de cupom no mesmo dia/ambiente
  if (fd.coupon) {
    const all = await Deliveries.active(env);
    const dup = all.find((d) => d.coupon === fd.coupon && d.id !== record?.id);
    if (dup) return toast('Já existe uma entrega ativa com esse número de cupom.', 'error');
  }

  const payload = {
    environment: env,
    entryTime: entryTime.toISOString(),
    pdv: fd.pdv.trim(),
    doc: fd.doc.trim(),
    coupon: fd.coupon?.trim() || '',
    clientName: fd.clientName?.trim() || '',
    phone: fd.phone?.trim() || '',
    street: fd.street.trim(),
    houseNumber: fd.houseNumber?.trim() || '',
    complement: fd.complement?.trim() || '',
    reference: fd.reference?.trim() || '',
    neighborhoodId: fd.neighborhoodId,
    deliveryFee: fee,
    size: fd.size,
    tripCount: fd.size === 'grande' ? Number(fd.tripCount || 1) : 1,
    trips: fd.size === 'grande' ? Array.from({ length: Number(fd.tripCount || 1) }, (_, i) => record?.trips?.[i] || ({ tripIndex: i + 1, leftStoreAt: null, arrivedAt: null })) : [],
    priority: fd.priority,
    type: fd.type,
    scheduledAt: fd.type === 'agendada' ? new Date(fd.scheduledAt).toISOString() : null,
    vehicleId: fd.vehicleId || null,
    driverId: fd.driverId || null,
    notes: fd.notes?.trim() || '',
  };

  if (record) {
    payload.leftStoreAt = fd.leftStoreAt ? new Date(fd.leftStoreAt).toISOString() : null;
    payload.clientArrivalAt = fd.clientArrivalAt ? new Date(fd.clientArrivalAt).toISOString() : null;
    payload.deliveredAt = fd.deliveredAt ? new Date(fd.deliveredAt).toISOString() : null;
    if (payload.deliveredAt && !payload.clientArrivalAt) return toast('Informe também a hora de chegada na casa do cliente.', 'error');
    if (payload.clientArrivalAt && payload.deliveredAt && new Date(payload.deliveredAt) < new Date(payload.clientArrivalAt)) return toast('A finalização não pode ser anterior à chegada no cliente.', 'error');
    if (record.status === 'finalizada' && !payload.deliveredAt) return toast('Uma entrega finalizada precisa ter a hora de finalização na casa do cliente.', 'error');
  }

  try {
    if (record) {
      await Deliveries.update(record.id, payload);
      const targetStatus = payload.deliveredAt ? 'finalizada' : (payload.clientArrivalAt && record.status === 'em_rota' ? 'no_cliente' : null);
      if (targetStatus && targetStatus !== record.status) await Deliveries.changeStatus(record.id, targetStatus, { note: 'Horários operacionais informados na edição.' });
      toast('Entrega atualizada.', 'success');
    } else {
      payload.purchaseNumber = await Counters.next(env, 'compra');
      payload.arrivalNumber = await Counters.next(env, 'chegada');
      payload.status = fd.type === 'agendada' ? 'programada' : 'na_loja';
      payload.statusHistory = [];
      payload.reschedules = [];
      payload.deletedAt = null;
      await Deliveries.add(payload);
      toast(`Entrega #${payload.purchaseNumber} registrada.`, 'success');
    }
    closeModal();
    refreshApp();
  } catch (err) {
    toast('Não foi possível salvar. ' + err.message, 'error');
  }
}

/* ---------- retirada na loja (seção 10) ---------- */
function openRetiradaFlow(record) {
  openModal({
    title: 'Retirada na loja',
    subtitle: `Entrega #${record.purchaseNumber} — reembolsar a taxa de ${money(record.deliveryFee)}?`,
    body: `<p style="font-size:13px;color:var(--text-muted)">Escolha uma opção abaixo. Isso fica registrado no histórico e no relatório financeiro.</p>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Não reembolsar', kind: 'ghost', onClick: async () => { await finishRetirada(record, false); } },
      { label: 'Sim, reembolsar', kind: 'primary', onClick: async () => { await finishRetirada(record, true); } },
    ],
  });
}
async function finishRetirada(record, refunded) {
  await Deliveries.update(record.id, { status: 'retirada_loja', pickedUpAtStore: true, refunded });
  await Deliveries.changeStatus(record.id, 'retirada_loja', { note: refunded ? 'Retirada com reembolso' : 'Retirada sem reembolso' });
  toast('Retirada registrada.', 'success');
  closeModal();
  refreshApp();
}

/* ---------- retorno / reentrega (seção 8 e 10) ---------- */
async function openRetornoFlow(record) {
  const reasons = (await ReturnReasons.all()).filter((r) => r.active);
  openModal({
    title: 'A entrega voltou?',
    subtitle: `Entrega #${record.purchaseNumber} — registre o motivo para manter o histórico.`,
    body: `
      <form id="retornoForm">
        <label>Motivo *
          <select name="reasonId" required>
            <option value="">Selecione…</option>
            ${reasons.map((r) => `<option value="${r.id}">${escapeHtml(r.label)}</option>`).join('')}
          </select>
        </label>
        <label>Observação<textarea name="note" rows="2"></textarea></label>
        <label>Encaminhar para
          <select name="nextStatus">
            <option value="reentrega">Reentrega</option>
            <option value="programada">Reagendar</option>
            <option value="cancelada">Cancelar entrega</option>
          </select>
        </label>
      </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Confirmar', kind: 'primary', onClick: async () => {
        const form = $('#retornoForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        await Deliveries.changeStatus(record.id, fd.nextStatus, { reasonId: fd.reasonId, note: fd.note });
        toast('Retorno registrado.', 'success');
        closeModal();
        refreshApp();
      }},
    ],
  });
}

/* ---------- reagendamento (nunca sobrescreve a tentativa anterior) ---------- */
function openReagendarFlow(record) {
  openModal({
    title: 'Reagendar entrega',
    subtitle: `Entrega #${record.purchaseNumber} — a tentativa anterior fica preservada no histórico.`,
    body: `
      <form id="reagForm">
        <label>Nova data/hora *<input type="datetime-local" name="newAt" required /></label>
        <label>Motivo<input name="reason" /></label>
      </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Confirmar', kind: 'primary', onClick: async () => {
        const form = $('#reagForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        await Deliveries.reschedule(record.id, new Date(fd.newAt).toISOString(), fd.reason);
        toast('Reagendado.', 'success');
        closeModal();
        refreshApp();
      }},
    ],
  });
}

/* =========================================================
   CICLOS (seção 9)
   ========================================================= */
export async function renderCycles() {
  const cycles = (await Cycles.all()).filter((c) => c.environment === getEnv() && !c.deletedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (!cycles.length) return `<div class="empty-state"><strong>Nenhum ciclo iniciado</strong>Use "Iniciar ciclo" na Central Operacional.</div>`;

  const vehicles = await Vehicles.all();
  const drivers = await Drivers.all();
  const vName = (id) => vehicles.find((v) => v.id === id)?.label || '—';
  const dName = (id) => drivers.find((d) => d.id === id)?.name || '—';

  const rows = await Promise.all(cycles.map(async (c) => {
    const items = await Promise.all((c.deliveryIds || []).map((id) => Deliveries.get(id)));
    const pending = items.filter((i) => i && (['em_rota', 'no_cliente'].includes(i.status) || (i.status === 'finalizada' && !i.deliveredAt))).length;
    return `<tr data-id="${c.id}" class="row-click-cycle">
      <td>${dateTimeBR(c.startedAt)}</td>
      <td>${escapeHtml(vName(c.vehicleId))}</td>
      <td>${escapeHtml(dName(c.driverId))}</td>
      <td>${items.length}</td>
      <td>${c.status === 'aberto' ? `<span class="badge transito">Aberto · ${pending} pendente(s)</span>` : `<span class="badge entregue">Fechado</span>`}</td>
      <td>${c.status === 'aberto' ? '<button class="btn-ghost btn-small cycle-close-btn">Finalizar</button>' : dateTimeBR(c.closedAt)}</td>
    </tr>`;
  }));

  return `<div class="table-wrap"><table><thead><tr><th>Início</th><th>Veículo</th><th>Entregador</th><th>Entregas</th><th>Status</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

export function wireCyclesEvents() {
  $$('.cycle-close-btn').forEach((btn) => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('tr').dataset.id;
    const cycle = await Cycles.get(id);
    openCloseCycleModal(cycle);
  }));
}

export async function openStartCycleModal() {
  const env = getEnv();
  const openCycles = (await Cycles.all()).filter((c) => c.environment === env && c.status === 'aberto' && !c.deletedAt);
  const busyVehicles = new Set(openCycles.map((c) => c.vehicleId));
  const busyDrivers = new Set(openCycles.map((c) => c.driverId));

  const vehicles = (await Vehicles.all()).filter((v) => v.active);
  const drivers = (await Drivers.all()).filter((d) => d.active);
  const neighborhoods = await Neighborhoods.all();
  const neighOrder = Object.fromEntries(neighborhoods.map((n) => [n.id, n.routeOrder ?? 0]));

  const candidates = (await Deliveries.active(env))
    .filter((d) => d.status === 'na_loja')
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'alta' ? -1 : 1;
      return (neighOrder[a.neighborhoodId] || 0) - (neighOrder[b.neighborhoodId] || 0);
    });

  if (!candidates.length) return toast('Não há entregas "Na loja" para formar um ciclo.', 'error');

  const body = `
    <form id="startCycleForm">
      <div class="field-row">
        <label>Veículo *
          <select name="vehicleId" required>
            <option value="">Selecione…</option>
            ${vehicles.map((v) => `<option value="${v.id}" ${busyVehicles.has(v.id) ? 'disabled' : ''}>${escapeHtml(v.label)}${busyVehicles.has(v.id) ? ' (em uso)' : ''}</option>`).join('')}
          </select>
        </label>
        <label>Entregador *
          <select name="driverId" required>
            <option value="">Selecione…</option>
            ${drivers.map((d) => `<option value="${d.id}" ${busyDrivers.has(d.id) ? 'disabled' : ''}>${escapeHtml(d.name)}${busyDrivers.has(d.id) ? ' (em uso)' : ''}</option>`).join('')}
          </select>
        </label>
      </div>
      <label>Entregas do ciclo (ordem sugerida: prioridade e bairro — arraste com os botões)</label>
      <div id="cycleItemsList" style="display:grid;gap:6px">
        ${candidates.map((d, i) => `
          <div class="cycle-item" data-id="${d.id}" style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:8px;padding:8px 10px">
            <input type="checkbox" checked />
            <div style="flex:1">
              <strong style="font-size:12.5px">#${d.purchaseNumber} · ${escapeHtml(d.clientName || d.street)}</strong>
              <div style="font-size:11px;color:var(--text-muted)">${d.priority === 'alta' ? 'Prioridade alta · ' : ''}${escapeHtml(neighborhoods.find(n=>n.id===d.neighborhoodId)?.name || '')}</div>
            </div>
            <button type="button" class="btn-ghost btn-small move-up">↑</button>
            <button type="button" class="btn-ghost btn-small move-down">↓</button>
          </div>`).join('')}
      </div>
    </form>`;

  openModal({
    title: 'Iniciar ciclo',
    subtitle: 'Veículo e entregador ficam bloqueados para outro ciclo até este ser finalizado.',
    body,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Iniciar ciclo', kind: 'primary', onClick: async () => {
        const form = $('#startCycleForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const order = $$('.cycle-item').map((el) => el.dataset.id);
        const checked = order.filter((id) => $(`.cycle-item[data-id="${id}"] input[type=checkbox]`).checked);
        if (!checked.length) return toast('Selecione ao menos uma entrega.', 'error');

        const cycle = await Cycles.add({
          environment: env, vehicleId: fd.vehicleId, driverId: fd.driverId,
          status: 'aberto', startedAt: new Date().toISOString(), closedAt: null,
          deliveryIds: checked, deletedAt: null,
        });
        const leftStoreAt = cycle.startedAt;
        for (const id of checked) {
          await Deliveries.changeStatus(id, 'em_rota', { cycleId: cycle.id, vehicleId: fd.vehicleId, driverId: fd.driverId, leftStoreAt, note: `Saída da loja registrada às ${timeBR(leftStoreAt)}.` });
        }
        toast('Ciclo iniciado.', 'success');
        closeModal();
        refreshApp();
      }},
    ],
  });

  $$('.move-up').forEach((b) => b.addEventListener('click', (e) => {
    const item = e.target.closest('.cycle-item');
    const prev = item.previousElementSibling;
    if (prev) item.parentNode.insertBefore(item, prev);
  }));
  $$('.move-down').forEach((b) => b.addEventListener('click', (e) => {
    const item = e.target.closest('.cycle-item');
    const next = item.nextElementSibling;
    if (next) item.parentNode.insertBefore(next, item);
  }));
}

/* ---------- finalizar ciclo: uma pendência por vez (seção 9) ---------- */
export async function openCloseCycleModal(cycle) {
  const items = await Promise.all((cycle.deliveryIds || []).map((id) => Deliveries.get(id)));
  const pending = items.filter((i) => i && (['em_rota', 'no_cliente'].includes(i.status) || (i.status === 'finalizada' && !i.deliveredAt)));

  if (!pending.length) {
    await Cycles.update(cycle.id, { status: 'fechado', closedAt: new Date().toISOString() });
    toast('Ciclo finalizado — todas as entregas já estavam resolvidas.', 'success');
    refreshApp();
    return;
  }

  showPendingOne(cycle, pending[0], pending.length);
}

function showPendingOne(cycle, delivery, remainingCount) {
  const reasonsPromise = ReturnReasons.all();
  openModal({
    title: `Finalizar ciclo — ${remainingCount} pendente(s)`,
    subtitle: `Entrega #${delivery.purchaseNumber} · ${escapeHtml(delivery.clientName || delivery.street)}`,
    body: `<p style="font-size:14px;font-weight:700">A entrega voltou?</p><p style="font-size:12.5px;color:var(--text-muted)">Se não voltou, vamos registrar a hora de entrega ao cliente.</p>`,
    actions: [
      { label: 'Sim, voltou', kind: 'ghost', onClick: async () => {
        const reasons = await reasonsPromise;
        openModal({
          title: 'Motivo do retorno',
          subtitle: `Entrega #${delivery.purchaseNumber}`,
          body: `
            <form id="pendReturnForm">
              <label>Motivo *
                <select name="reasonId" required>
                  <option value="">Selecione…</option>
                  ${reasons.filter(r=>r.active).map((r) => `<option value="${r.id}">${escapeHtml(r.label)}</option>`).join('')}
                </select>
              </label>
              <label>Observação<textarea name="note" rows="2"></textarea></label>
              <label>Encaminhar para
                <select name="nextStatus"><option value="reentrega">Reentrega</option><option value="programada">Reagendar</option></select>
              </label>
            </form>`,
          actions: [
            { label: 'Voltar', kind: 'ghost', onClick: () => showPendingOne(cycle, delivery, remainingCount) },
            { label: 'Confirmar', kind: 'primary', onClick: async () => {
              const form = $('#pendReturnForm');
              if (!form.reportValidity()) return;
              const fd = Object.fromEntries(new FormData(form).entries());
              await Deliveries.changeStatus(delivery.id, fd.nextStatus, { reasonId: fd.reasonId, note: fd.note });
              await advanceCloseCycle(cycle);
            }},
          ],
        });
      }},
      { label: 'Não, foi entregue', kind: 'primary', onClick: async () => {
        openDeliveryCompletionFlow(delivery, { cycle });
      }},
    ],
  });
}

async function advanceCloseCycle(cycle) {
  const items = await Promise.all((cycle.deliveryIds || []).map((id) => Deliveries.get(id)));
  const pending = items.filter((i) => i && (['em_rota', 'no_cliente'].includes(i.status) || (i.status === 'finalizada' && !i.deliveredAt)));
  if (pending.length) {
    showPendingOne(cycle, pending[0], pending.length);
  } else {
    await Cycles.update(cycle.id, { status: 'fechado', closedAt: new Date().toISOString() });
    toast('Ciclo finalizado. Veículo e entregador liberados.', 'success');
    closeModal();
    refreshApp();
  }
}

/* =========================================================
   QUILOMETRAGEM (seção 11)
   ========================================================= */
export async function renderKm() {
  const env = getEnv();
  const logs = (await OdometerLogs.all()).filter((l) => l.environment === env).sort((a, b) => b.shiftDate.localeCompare(a.shiftDate));
  const vehicles = await Vehicles.all();
  const vName = (id) => vehicles.find((v) => v.id === id)?.label || '—';

  const rows = logs.map((l) => `
    <tr data-id="${l.id}">
      <td>${dateBR(l.shiftDate)}</td>
      <td>${escapeHtml(vName(l.vehicleId))}</td>
      <td>${l.kmStart ?? '—'}</td>
      <td>${l.kmEnd ?? '—'}</td>
      <td>${l.kmEnd != null && l.kmStart != null ? (l.kmEnd - l.kmStart).toFixed(1) : '—'}</td>
      <td>${l.kmEnd == null ? '<button class="btn-ghost btn-small km-close-btn">Registrar KM final</button>' : ''}</td>
    </tr>`).join('');

  return `
    <div style="margin-bottom:14px"><button class="btn-primary" id="kmNewBtn">＋ Iniciar expediente</button></div>
    ${logs.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Veículo</th><th>KM inicial</th><th>KM final</th><th>Rodado</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="empty-state"><strong>Nenhum registro de KM</strong>Clique em "Iniciar expediente" para o primeiro veículo do dia.</div>`}
  `;
}

export function wireKmEvents() {
  $('#kmNewBtn')?.addEventListener('click', openKmStartModal);
  $$('.km-close-btn').forEach((btn) => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('tr').dataset.id;
    const log = await OdometerLogs.get(id);
    openKmEndModal(log);
  }));
}

async function openKmStartModal() {
  const vehicles = (await Vehicles.all()).filter((v) => v.active);
  openModal({
    title: 'Iniciar expediente',
    body: `
      <form id="kmStartForm">
        <label>Veículo *
          <select name="vehicleId" required>${vehicles.map((v) => `<option value="${v.id}">${escapeHtml(v.label)}</option>`).join('')}</select>
        </label>
        <label>KM inicial *<input name="kmStart" type="number" step="0.1" min="0" required /></label>
      </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Salvar', kind: 'primary', onClick: async () => {
        const form = $('#kmStartForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        await OdometerLogs.add({ environment: getEnv(), vehicleId: fd.vehicleId, shiftDate: new Date().toISOString().slice(0,10), kmStart: Number(fd.kmStart), kmEnd: null });
        toast('Expediente iniciado.', 'success');
        closeModal(); refreshApp();
      }},
    ],
  });
}

function openKmEndModal(log) {
  openModal({
    title: 'Registrar KM final',
    subtitle: `KM inicial: ${log.kmStart}`,
    body: `<form id="kmEndForm"><label>KM final *<input name="kmEnd" type="number" step="0.1" min="0" required /></label></form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Salvar', kind: 'primary', onClick: async () => {
        const form = $('#kmEndForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const kmEnd = Number(fd.kmEnd);
        if (kmEnd < log.kmStart) return toast('KM final não pode ser menor que o KM inicial.', 'error');
        await OdometerLogs.update(log.id, { kmEnd });
        toast('KM final registrado.', 'success');
        closeModal(); refreshApp();
      }},
    ],
  });
}

/* =========================================================
   CUSTOS E FINANCEIRO (seção 11)
   ========================================================= */
export async function renderCosts() {
  const env = getEnv();
  const costs = (await Costs.all()).filter((c) => c.environment === env && !c.deletedAt).sort((a, b) => b.date.localeCompare(a.date));
  const categories = await CostCategories.all();
  const vehicles = await Vehicles.all();
  const drivers = await Drivers.all();
  const catName = (id) => categories.find((c) => c.id === id)?.name || '—';
  const vName = (id) => vehicles.find((v) => v.id === id)?.label || '—';
  const dName = (id) => drivers.find((d) => d.id === id)?.name || '—';

  const rows = costs.map((c) => `
    <tr><td>${dateBR(c.date)}</td><td>${escapeHtml(catName(c.categoryId))}</td><td>${escapeHtml(vName(c.vehicleId))}</td><td>${escapeHtml(dName(c.driverId))}</td><td>${money(c.amount)}</td><td>${escapeHtml(c.note || '')}</td></tr>
  `).join('');

  const financial = await computeFinancialSummary(env);

  return `
    <div class="stat-row">
      <div class="stat-card"><small>Total de taxas</small><strong>${money(financial.fees)}</strong></div>
      <div class="stat-card"><small>Reembolsos</small><strong>${money(financial.refunds)}</strong></div>
      <div class="stat-card"><small>Custos</small><strong>${money(financial.costsTotal)}</strong></div>
      <div class="stat-card accent"><small>Saldo</small><strong>${money(financial.balance)}</strong></div>
    </div>
    <div class="stat-row" style="grid-template-columns:1fr 1fr">
      <div class="stat-card"><small>Custo por KM</small><strong>${financial.kmTotal ? money(financial.costsTotal / financial.kmTotal) : '—'}</strong></div>
      <div class="stat-card"><small>Custo por entrega</small><strong>${financial.deliveredCount ? money(financial.costsTotal / financial.deliveredCount) : '—'}</strong></div>
    </div>
    <div style="margin:16px 0"><button class="btn-primary" id="costNewBtn">＋ Registrar custo</button></div>
    ${costs.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Categoria</th><th>Veículo</th><th>Entregador</th><th>Valor</th><th>Obs.</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty-state"><strong>Nenhum custo lançado</strong></div>`}
  `;
}

async function computeFinancialSummary(env) {
  const deliveries = await Deliveries.active(env);
  const finalized = deliveries.filter((d) => d.status === 'finalizada' || (d.status === 'retirada_loja' && !d.refunded));
  const fees = finalized.reduce((s, d) => s + (Number(d.deliveryFee) || 0), 0);
  const refunds = deliveries.filter((d) => d.refunded).reduce((s, d) => s + (Number(d.deliveryFee) || 0), 0);
  const costsTotal = (await Costs.all()).filter((c) => c.environment === env && !c.deletedAt).reduce((s, c) => s + Number(c.amount || 0), 0);
  const kmTotal = (await OdometerLogs.all()).filter((l) => l.environment === env && l.kmEnd != null).reduce((s, l) => s + (l.kmEnd - l.kmStart), 0);
  const balance = fees - refunds - costsTotal;
  return { fees, refunds, costsTotal, balance, kmTotal, deliveredCount: finalized.length };
}

export function wireCostsEvents() {
  $('#costNewBtn')?.addEventListener('click', openCostModal);
}

async function openCostModal() {
  const categories = (await CostCategories.all()).filter((c) => c.active);
  const vehicles = await Vehicles.all();
  const drivers = await Drivers.all();
  openModal({
    title: 'Registrar custo',
    body: `
      <form id="costForm">
        <label>Data *<input type="date" name="date" required value="${new Date().toISOString().slice(0,10)}" /></label>
        <label>Categoria *<select name="categoryId" required><option value="">Selecione…</option>${categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></label>
        <div class="field-row">
          <label>Veículo<select name="vehicleId"><option value="">—</option>${vehicles.map((v) => `<option value="${v.id}">${escapeHtml(v.label)}</option>`).join('')}</select></label>
          <label>Entregador<select name="driverId"><option value="">—</option>${drivers.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('')}</select></label>
        </div>
        <label>Valor *<input type="number" step="0.01" min="0" name="amount" required /></label>
        <label>Comprovante/observação<textarea name="note" rows="2"></textarea></label>
      </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Salvar', kind: 'primary', onClick: async () => {
        const form = $('#costForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        await Costs.add({ environment: getEnv(), date: fd.date, categoryId: fd.categoryId, vehicleId: fd.vehicleId || null, driverId: fd.driverId || null, amount: Number(fd.amount), note: fd.note, deletedAt: null });
        toast('Custo registrado.', 'success');
        closeModal(); refreshApp();
      }},
    ],
  });
}

function byWeekdayCountOccurrences(rows, weekday) {
  const datesSeen = new Set();
  let total = 0;
  rows.forEach((r) => {
    const d = new Date(r.entryTime);
    if (d.getDay() === weekday) {
      total++;
      datesSeen.add(d.toISOString().slice(0, 10));
    }
  });
  return { total, occurrences: datesSeen.size };
}

/* =========================================================
   DASHBOARD (seção 14) — métricas, rankings e gráficos
   ========================================================= */
let dashboardPeriod = { mode: 'mes', start: '', end: '' };

function dashboardDayKey(value) {
  const d = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dashboardRange() {
  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (dashboardPeriod.mode === 'semana') {
    const mondayOffset = (now.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  }
  if (dashboardPeriod.mode === 'mes') start = new Date(now.getFullYear(), now.getMonth(), 1);
  if (dashboardPeriod.mode === 'ano') start = new Date(now.getFullYear(), 0, 1);
  if (dashboardPeriod.mode === 'tudo') return { start: null, end: null, label: 'Todo o histórico' };
  if (dashboardPeriod.mode === 'personalizado') {
    start = dashboardPeriod.start ? new Date(`${dashboardPeriod.start}T00:00:00`) : null;
    end = dashboardPeriod.end ? new Date(`${dashboardPeriod.end}T23:59:59.999`) : null;
  }
  const label = dashboardPeriod.mode === 'dia' ? 'Hoje'
    : dashboardPeriod.mode === 'semana' ? 'Semana atual'
      : dashboardPeriod.mode === 'mes' ? 'Mês atual'
        : dashboardPeriod.mode === 'ano' ? 'Ano atual'
          : `${dashboardPeriod.start || 'início'} até ${dashboardPeriod.end || 'hoje'}`;
  return { start, end, label };
}

function dashboardInRange(value, range) {
  if (!value) return false;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value);
  return (!range.start || d >= range.start) && (!range.end || d <= range.end);
}

function averageMinutes(rows, fromField, toField) {
  const values = rows.map((r) => r[fromField] && r[toField] ? (new Date(r[toField]) - new Date(r[fromField])) / 60000 : null).filter((v) => v != null && v >= 0);
  return values.length ? values.reduce((s,v) => s + v, 0) / values.length : null;
}

function formatDuration(minutes) {
  if (minutes == null) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return `${h}h ${m}min`;
}

function meanGroupForecast(rows, keyFn) {
  const groups = {};
  rows.forEach((r) => { const key = keyFn(new Date(r.entryTime)); if (key) groups[key] = (groups[key] || 0) + 1; });
  const values = Object.values(groups);
  return values.length ? Math.round(values.reduce((s,v) => s + v, 0) / values.length) : null;
}

function dashboardTrend(rows, range) {
  if (!rows.length) return { labels: ['Sem dados'], values: [0] };
  const first = range.start || new Date(Math.min(...rows.map((r) => new Date(r.entryTime))));
  const last = range.end || new Date(Math.max(...rows.map((r) => new Date(r.entryTime))));
  const days = Math.max(1, Math.ceil((last - first) / 86400000));
  const groups = {};
  if (days > 62) {
    rows.forEach((r) => { const d = new Date(r.entryTime); const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; groups[key] = (groups[key] || 0) + 1; });
  } else if (days > 21) {
    rows.forEach((r) => { const d = new Date(r.entryTime); const start = new Date(d); start.setDate(d.getDate() - ((d.getDay()+6)%7)); const key = `S ${dashboardDayKey(start).slice(5)}`; groups[key] = (groups[key] || 0) + 1; });
  } else {
    rows.forEach((r) => { const key = dashboardDayKey(r.entryTime).slice(5); groups[key] = (groups[key] || 0) + 1; });
  }
  const entries = Object.entries(groups).sort((a,b) => a[0].localeCompare(b[0]));
  return { labels: entries.map(([k]) => k), values: entries.map(([,v]) => v) };
}

export async function renderDashboard() {
  const env = getEnv();
  const [allRows, allCycles, allCosts, allKm, drivers, vehicles, neighborhoods] = await Promise.all([
    Deliveries.active(env), Cycles.all(), Costs.all(), OdometerLogs.all(), Drivers.all(), Vehicles.all(), Neighborhoods.all(),
  ]);
  const range = dashboardRange();
  const rows = allRows.filter((r) => dashboardInRange(r.entryTime, range));
  const cycles = allCycles.filter((c) => c.environment === env && !c.deletedAt && dashboardInRange(c.startedAt, range));
  const costs = allCosts.filter((c) => c.environment === env && !c.deletedAt && dashboardInRange(c.date, range));
  const kmLogs = allKm.filter((l) => l.environment === env && dashboardInRange(l.shiftDate, range));
  const finalized = rows.filter((r) => r.status === 'finalizada' && r.deliveredAt);
  const problems = rows.filter((r) => ['retorno', 'reentrega', 'cancelada'].includes(r.status));
  const refunded = rows.filter((r) => r.refunded);
  const closedCycles = cycles.filter((c) => c.status === 'fechado');
  const pending = rows.filter((r) => ['na_loja','em_rota','no_cliente','programada','reentrega'].includes(r.status));
  const late = rows.filter((r) => ['na_loja','em_rota','no_cliente'].includes(r.status) && (Date.now() - new Date(r.entryTime)) > 3600000);
  const priority = rows.filter((r) => r.priority === 'alta');
  const scheduled = rows.filter((r) => r.type === 'agendada' || r.status === 'programada');

  const feeRows = rows.filter((r) => r.status === 'finalizada' || (r.status === 'retirada_loja' && !r.refunded));
  const grossFees = feeRows.reduce((s,r) => s + Number(r.deliveryFee || 0), 0);
  const refunds = refunded.reduce((s,r) => s + Number(r.deliveryFee || 0), 0);
  const netRevenue = grossFees - refunds;
  const costTotal = costs.reduce((s,c) => s + Number(c.amount || 0), 0);
  const balance = netRevenue - costTotal;
  const kmTotal = kmLogs.filter((l) => l.kmEnd != null).reduce((s,l) => s + (l.kmEnd - l.kmStart), 0);

  // produtividade
  const successRate = rows.length ? Math.round((finalized.length / rows.length) * 100) : 0;
  const avgPerCycle = closedCycles.length ? (finalized.length / closedCycles.length).toFixed(1) : '—';
  const avgStoreWait = averageMinutes(rows, 'entryTime', 'leftStoreAt');
  const avgRoute = averageMinutes(rows, 'leftStoreAt', 'clientArrivalAt');
  const avgAtClient = averageMinutes(rows, 'clientArrivalAt', 'deliveredAt');
  const avgTotal = averageMinutes(rows, 'entryTime', 'deliveredAt');

  // qualidade dos dados
  const missingPhone = rows.filter((r) => !r.phone).length;
  const missingClient = rows.filter((r) => !r.clientName).length;
  const missingVehicleOrDriver = rows.filter((r) => !r.vehicleId || !r.driverId).length;
  const missingCompletionTime = rows.filter((r) => r.status === 'finalizada' && !r.deliveredAt).length;

  // rankings
  const rank = (items, keyFn, nameFn) => {
    const map = {};
    items.forEach((it) => { const k = keyFn(it); if (k) map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => [nameFn(id), count]);
  };
  const rankingDriver = rank(finalized, (d) => d.driverId, (id) => drivers.find((d) => d.id === id)?.name || 'Sem entregador');
  const rankingVehicle = rank(finalized, (d) => d.vehicleId, (id) => vehicles.find((v) => v.id === id)?.label || 'Sem veículo');
  const rankingNeighborhood = rank(rows, (d) => d.neighborhoodId, (id) => neighborhoods.find((n) => n.id === id)?.name || 'Sem bairro');

  // entregas por dia da semana
  const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const byWeekday = new Array(7).fill(0);
  rows.forEach((r) => { byWeekday[new Date(r.entryTime).getDay()]++; });

  // distribuição por status
  const statusKeys = Object.keys(STATUS_META);
  const statusCounts = statusKeys.map((k) => rows.filter((r) => r.status === k).length);
  const statusLabels = statusKeys.map((k) => STATUS_META[k].label);

  // clientes recorrentes (por telefone, quando existe; senão por nome)
  const clientKey = (r) => (r.phone || r.clientName || '').trim().toLowerCase();
  const clientCounts = {};
  rows.forEach((r) => { const k = clientKey(r); if (k) clientCounts[k] = (clientCounts[k] || 0) + 1; });
  const recurringClients = Object.values(clientCounts).filter((c) => c > 1).length;
  const uniqueClients = Object.keys(clientCounts).length;
  const topClients = Object.entries(clientCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([key, count]) => {
      const sample = rows.find((r) => clientKey(r) === key);
      return [sample?.clientName || sample?.phone || 'Cliente sem nome', count];
    });

  // horário de pico (hora do dia com mais entregas)
  const byHour = new Array(24).fill(0);
  rows.forEach((r) => { byHour[new Date(r.entryTime).getHours()]++; });
  const peakHour = byHour.indexOf(Math.max(...byHour));

  // previsões estatísticas simples baseadas exclusivamente no histórico real
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowWeekday = tomorrow.getDay();
  const sameWeekdayCount = byWeekdayCountOccurrences(allRows, tomorrowWeekday);
  const forecastTomorrow = sameWeekdayCount.occurrences ? (sameWeekdayCount.total / sameWeekdayCount.occurrences).toFixed(1) : null;
  const weekKey = (d) => { const s = new Date(d); s.setDate(d.getDate() - ((d.getDay()+6)%7)); return dashboardDayKey(s); };
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const forecastWeek = meanGroupForecast(allRows, weekKey);
  const forecastMonth = meanGroupForecast(allRows, monthKey);
  const trend = dashboardTrend(rows, range);

  const rankTable = (title, data, tip) => `
    <div class="stat-card" data-tip="${tip}">
      <small>${title}</small>
      <table style="width:100%;margin-top:8px;font-size:12.5px">
        ${data.length ? data.map(([name, count]) => `<tr><td style="padding:3px 0">${escapeHtml(name)}</td><td style="text-align:right;font-weight:800">${count}</td></tr>`).join('') : '<tr><td style="color:var(--text-muted)">Sem dados suficientes</td></tr>'}
      </table>
    </div>`;

  const metric = (title, value, tip, tone = '') => `<div class="stat-card dashboard-metric ${tone}" data-tip="${escapeHtml(tip)}"><small>${title}</small><strong>${value}</strong></div>`;
  const currentStart = range.start ? dashboardDayKey(range.start) : '';
  const currentEnd = range.end ? dashboardDayKey(range.end) : '';

  return `
    <div class="dashboard-filter-bar">
      <div><span>PERÍODO ANALISADO</span><strong>${range.label}</strong></div>
      <div class="dashboard-period-buttons">
        ${[['dia','Dia'],['semana','Semana'],['mes','Mês'],['ano','Ano'],['tudo','Tudo']].map(([mode,label]) => `<button class="dashboard-period-btn ${dashboardPeriod.mode === mode ? 'active' : ''}" data-mode="${mode}">${label}</button>`).join('')}
      </div>
      <div class="dashboard-custom-period">
        <input type="date" id="dashboardStart" value="${dashboardPeriod.start || currentStart}" />
        <span>até</span>
        <input type="date" id="dashboardEnd" value="${dashboardPeriod.end || currentEnd}" />
        <button class="btn-primary btn-small" id="dashboardApplyPeriod">Aplicar período</button>
      </div>
    </div>

    ${!rows.length ? `<div class="dashboard-empty-notice">Não existem entregas neste período. Troque o filtro para visualizar outros dados.</div>` : ''}

    <div class="dashboard-thermo-card" data-tip="Desempenho do período: percentual de entregas finalizadas com hora de conclusão registrada.">${thermometerHTML(successRate, 'Desempenho do período', true)}</div>

    <div class="dashboard-section-title"><span>OPERAÇÃO</span><h2>Indicadores operacionais</h2></div>
    <div class="dashboard-kpi-grid">
      ${metric('Total previsto/registrado', `<span data-count="${rows.length}">0</span>`, 'Todas as entregas registradas no período selecionado.')}
      ${metric('Finalizadas com horário', `<span data-count="${finalized.length}">0</span>`, 'Entregas finalizadas que possuem hora de conclusão na casa do cliente.', 'good')}
      ${metric('Pendentes', `<span data-count="${pending.length}">0</span>`, 'Na loja, em rota, na casa do cliente, programadas ou aguardando reentrega.')}
      ${metric('Atrasadas', `<span data-count="${late.length}">0</span>`, 'Entregas abertas há mais de 60 minutos.', late.length ? 'bad' : 'good')}
      ${metric('Retornos/Problemas', `<span data-count="${problems.length}">0</span>`, 'Retornos, reentregas e cancelamentos registrados no período.', problems.length ? 'warning' : '')}
      ${metric('Prioridade alta', `<span data-count="${priority.length}">0</span>`, 'Entregas classificadas como prioridade alta.')}
      ${metric('Agendadas', `<span data-count="${scheduled.length}">0</span>`, 'Entregas agendadas ou programadas no período.')}
      ${metric('Taxa de sucesso', `${successRate}%`, 'Finalizadas com horário dividido pelo total registrado.', 'good')}
      ${metric('Ciclos', `<span data-count="${cycles.length}">0</span>`, 'Total de ciclos iniciados no período.')}
      ${metric('Produtividade/ciclo', avgPerCycle, 'Média de entregas finalizadas por ciclo fechado.')}
      ${metric('KM rodado', `${kmTotal.toFixed(1)} km`, 'Soma do KM final menos KM inicial dos expedientes fechados.')}
      ${metric('Tempo total médio', formatDuration(avgTotal), 'Tempo médio entre a entrada da compra e a finalização na casa do cliente.')}
    </div>

    <div class="dashboard-section-title"><span>TEMPOS</span><h2>Eficiência do fluxo</h2></div>
    <div class="dashboard-kpi-grid compact">
      ${metric('Espera na loja', formatDuration(avgStoreWait), 'Tempo médio da entrada da compra até a saída da loja.')}
      ${metric('Tempo em rota', formatDuration(avgRoute), 'Tempo médio da saída da loja até a chegada na casa do cliente.')}
      ${metric('Tempo no cliente', formatDuration(avgAtClient), 'Tempo médio entre a chegada e a finalização na casa do cliente.')}
      ${metric('Sem hora final', `<span data-count="${missingCompletionTime}">0</span>`, 'Entregas marcadas como finalizadas que ainda não têm hora de conclusão.', missingCompletionTime ? 'bad' : 'good')}
    </div>

    <div class="dashboard-section-title"><span>FINANCEIRO</span><h2>Resultado do período</h2></div>
    <div class="dashboard-kpi-grid financial-grid">
      ${metric('Taxas brutas', money(grossFees), 'Soma das taxas das entregas contabilizadas.')}
      ${metric('Reembolsos', money(refunds), 'Taxas devolvidas em retiradas na loja.', refunds ? 'warning' : '')}
      ${metric('Receita líquida', money(netRevenue), 'Taxas brutas menos reembolsos.', 'good')}
      ${metric('Custos operacionais', money(costTotal), 'Soma de combustível, manutenção e demais custos do período.')}
      ${metric('Resultado', money(balance), 'Receita líquida menos custos: lucro ou prejuízo operacional.', balance >= 0 ? 'good' : 'bad')}
      ${metric('Custo por entrega', finalized.length ? money(costTotal/finalized.length) : '—', 'Custos divididos pelas entregas finalizadas com horário.')}
      ${metric('Receita por entrega', finalized.length ? money(netRevenue/finalized.length) : '—', 'Receita líquida dividida pelas entregas finalizadas com horário.')}
      ${metric('Custo por KM', kmTotal ? money(costTotal/kmTotal) : '—', 'Custos operacionais divididos pelo KM rodado.')}
    </div>

    <div class="dashboard-section-title"><span>PREVISÕES</span><h2>Estimativa de movimento futuro</h2></div>
    <div class="forecast-grid">
      <div class="forecast-card" data-tip="Média histórica do mesmo dia da semana de amanhã. É uma estimativa estatística baseada nos registros existentes."><span>PRÓXIMO DIA</span><strong>${forecastTomorrow ?? '—'}</strong><small>entregas previstas</small></div>
      <div class="forecast-card" data-tip="Média de entregas por semana registrada no histórico. Não é uma garantia de demanda."><span>PRÓXIMA SEMANA</span><strong>${forecastWeek ?? '—'}</strong><small>entregas previstas</small></div>
      <div class="forecast-card" data-tip="Média de entregas por mês registrado no histórico. A precisão melhora conforme novos meses são acumulados."><span>PRÓXIMO MÊS</span><strong>${forecastMonth ?? '—'}</strong><small>entregas previstas</small></div>
      <div class="forecast-card peak" data-tip="Faixa horária com maior quantidade de entradas no período selecionado."><span>PICO OPERACIONAL</span><strong>${rows.length ? String(peakHour).padStart(2,'0')+'h' : '—'}</strong><small>horário mais movimentado</small></div>
    </div>

    <div class="dashboard-section-title"><span>GRÁFICOS VIVOS</span><h2>Movimento, horários e situação</h2></div>
    <div class="dashboard-chart-grid">
      <div class="chart-card" data-tip="Evolução do volume de entregas dentro do período selecionado. Passe o mouse sobre cada barra para ver o valor."><div class="chart-title"><strong>Evolução das entregas</strong><small>${range.label}</small></div>${barChartSVG({ labels: trend.labels, values: trend.values, color: 'var(--ink-2)' })}</div>
      <div class="chart-card" data-tip="Distribuição atual das entregas do período por status operacional."><div class="chart-title"><strong>Distribuição por status</strong><small>situação atual</small></div>${barChartSVG({ labels: statusLabels, values: statusCounts, color: 'var(--accent)' })}</div>
      <div class="chart-card" data-tip="Quantidade de entregas registrada em cada dia da semana dentro do período."><div class="chart-title"><strong>Entregas por dia da semana</strong><small>volume semanal</small></div>${barChartSVG({ labels: weekdayNames, values: byWeekday, color: '#2f9e5b' })}</div>
      <div class="chart-card" data-tip="Comparação entre taxas brutas, reembolsos, custos e resultado positivo do período."><div class="chart-title"><strong>Composição financeira</strong><small>valores em reais</small></div>${barChartSVG({ labels: ['Taxas','Reemb.','Custos','Resultado'], values: [grossFees,refunds,costTotal,Math.max(0,balance)].map((v)=>Number(v.toFixed(2))), color: '#e8a33d', unit: ' R$' })}</div>
    </div>

    <div class="dashboard-section-title"><span>CLIENTES E RANKINGS</span><h2>Recorrência e produtividade</h2></div>
    <div class="dashboard-kpi-grid compact">
      ${metric('Clientes recorrentes', `<span data-count="${recurringClients}">0</span>`, 'Clientes identificados por telefone ou nome com mais de uma entrega.')}
      ${metric('Clientes únicos', `<span data-count="${uniqueClients}">0</span>`, 'Quantidade de clientes diferentes identificados no período.')}
      ${metric('Sem telefone', `<span data-count="${missingPhone}">0</span>`, 'Entregas sem telefone do cliente preenchido.', missingPhone ? 'warning' : 'good')}
      ${metric('Sem cliente', `<span data-count="${missingClient}">0</span>`, 'Entregas sem nome de cliente preenchido.', missingClient ? 'warning' : 'good')}
    </div>
    <div class="stat-card" style="margin-bottom:16px" data-tip="Clientes com mais entregas registradas">
      <small>Clientes mais recorrentes</small>
      <table style="width:100%;margin-top:8px;font-size:12.5px">
        ${topClients.length ? topClients.map(([name, count]) => `<tr><td style="padding:3px 0">${escapeHtml(name)}</td><td style="text-align:right;font-weight:800">${count}x</td></tr>`).join('') : '<tr><td style="color:var(--text-muted)">Sem dados suficientes</td></tr>'}
      </table>
    </div>

    <div class="stat-row" style="grid-template-columns:repeat(3,1fr)">
      ${rankTable('Por entregador (finalizadas)', rankingDriver, 'Quem mais finalizou entregas')}
      ${rankTable('Por veículo (finalizadas)', rankingVehicle, 'Qual veículo mais rodou entregas finalizadas')}
      ${rankTable('Por bairro (volume)', rankingNeighborhood, 'Bairros com mais entregas registradas')}
    </div>

    <div class="dashboard-quality-note ${missingVehicleOrDriver || missingCompletionTime ? 'has-warning' : ''}" data-tip="Verificação automática de dados necessários para relatórios e indicadores confiáveis.">Qualidade dos dados: ${missingVehicleOrDriver} sem veículo/entregador · ${missingCompletionTime} finalizada(s) sem hora de conclusão.</div>
  `;
}

export function wireDashboardEvents() {
  $$('.dashboard-period-btn').forEach((btn) => btn.addEventListener('click', () => {
    dashboardPeriod = { ...dashboardPeriod, mode: btn.dataset.mode };
    refreshApp();
  }));
  $('#dashboardApplyPeriod')?.addEventListener('click', () => {
    const start = $('#dashboardStart')?.value || '';
    const end = $('#dashboardEnd')?.value || '';
    if (start && end && start > end) return toast('A data inicial não pode ser maior que a final.', 'error');
    dashboardPeriod = { mode: 'personalizado', start, end };
    refreshApp();
  });
}

/* =========================================================
   BUSCA GERAL (seção 14)
   ========================================================= */
export async function renderSearch() {
  return `
    <input id="searchInput" placeholder="Buscar por compra, cliente, telefone, endereço, bairro, veículo, entregador, status…" style="width:100%;padding:11px 14px;border-radius:9px;border:1px solid var(--line);margin-bottom:14px;font-size:13px" />
    <div id="searchResults"></div>
  `;
}
export function wireSearchEvents() {
  const input = $('#searchInput');
  if (!input) return;
  input.addEventListener('input', async () => {
    const q = input.value.trim().toLowerCase();
    const env = getEnv();
    const rows = await Deliveries.active(env);
    const neighborhoods = await Neighborhoods.all();
    const vehicles = await Vehicles.all();
    const drivers = await Drivers.all();
    const nName = (id) => neighborhoods.find((n) => n.id === id)?.name || '';
    const vName = (id) => vehicles.find((v) => v.id === id)?.label || '';
    const dName = (id) => drivers.find((d) => d.id === id)?.name || '';

    const filtered = !q ? [] : rows.filter((r) => [
      r.purchaseNumber, r.arrivalNumber, r.coupon, r.doc, r.pdv, r.clientName, r.phone,
      r.street, nName(r.neighborhoodId), vName(r.vehicleId), dName(r.driverId), r.status, r.priority,
    ].some((f) => String(f ?? '').toLowerCase().includes(q)));

    $('#searchResults').innerHTML = !q
      ? '<div class="empty-state"><strong>Digite para buscar</strong>Combine termos: nome, bairro, status, número da compra, etc.</div>'
      : (filtered.length ? await miniList(filtered) : '<div class="empty-state"><strong>Nada encontrado</strong></div>');
    wireCentralEvents();
  });
}

/* =========================================================
   RELATÓRIOS (seção 14)
   ========================================================= */
export async function renderReports() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return `
    <div class="report-period-card">
      <div><span>PERÍODO DO RELATÓRIO</span><strong>Escolha as datas antes de gerar</strong></div>
      <label>De<input type="date" id="reportStart" value="${localISO(monthStart)}" /></label>
      <label>Até<input type="date" id="reportEnd" value="${localISO(today)}" /></label>
      <button class="btn-ghost btn-small" id="reportTodayBtn">Hoje</button>
      <button class="btn-ghost btn-small" id="reportMonthBtn">Mês atual</button>
    </div>
    <div class="stat-row" style="grid-template-columns:1fr 1fr">
      <div class="stat-card">
        <small>Relatório gerencial</small>
        <p style="font-size:12.5px;color:var(--text-muted);margin:8px 0">Resumo completo com indicadores, gráfico e financeiro — pronto para impressão/PDF.</p>
        <button class="btn-primary btn-small" id="printReportBtn">🖶 Imprimir / Salvar PDF</button>
      </div>
      <div class="stat-card">
        <small>Relatório analítico</small>
        <p style="font-size:12.5px;color:var(--text-muted);margin:8px 0">Um arquivo CSV por área — todos abrem direto no Excel.</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn-ghost btn-small export-btn" data-kind="resumo">Resumo executivo</button>
          <button class="btn-ghost btn-small export-btn" data-kind="deliveries">Entregas</button>
          <button class="btn-ghost btn-small export-btn" data-kind="cycles">Ciclos</button>
          <button class="btn-ghost btn-small export-btn" data-kind="km">Quilometragem</button>
          <button class="btn-ghost btn-small export-btn" data-kind="costs">Custos</button>
          <button class="btn-ghost btn-small export-btn" data-kind="audit">Auditoria</button>
          <button class="btn-ghost btn-small export-btn" data-kind="clients">Clientes</button>
          <button class="btn-ghost btn-small export-btn" data-kind="dias_semana">Dias da semana</button>
          <button class="btn-ghost btn-small export-btn" data-kind="horarios_pico">Horários de pico</button>
          <button class="btn-ghost btn-small export-btn" data-kind="status">Status</button>
          <button class="btn-ghost btn-small export-btn" data-kind="vehicles">Veículos</button>
          <button class="btn-ghost btn-small export-btn" data-kind="collaborators">Colaboradores</button>
          <button class="btn-ghost btn-small export-btn" data-kind="neighborhoods">Bairros</button>
          <button class="btn-primary btn-small" id="exportAllBtn">⇩ Exportar tudo (13 arquivos)</button>
        </div>
      </div>
    </div>
    <div id="printArea" class="hidden"></div>
  `;
}

function readReportPeriod() {
  return { start: $('#reportStart')?.value || '', end: $('#reportEnd')?.value || '' };
}

function inReportPeriod(value, period) {
  if (!value || !period) return true;
  const key = String(value).slice(0, 10);
  return (!period.start || key >= period.start) && (!period.end || key <= period.end);
}

async function buildExport(kind, env, period = null) {
  const neighborhoods = await Neighborhoods.all();
  const vehicles = await Vehicles.all();
  const drivers = await Drivers.all();
  const nName = (id) => neighborhoods.find((n) => n.id === id)?.name || '';
  const vName = (id) => vehicles.find((v) => v.id === id)?.label || '';
  const dName = (id) => drivers.find((d) => d.id === id)?.name || '';

  if (kind === 'deliveries') {
    const rows = (await Deliveries.active(env)).filter((r) => inReportPeriod(r.entryTime, period));
    const header = ['Compra','Chegada','Data entrada','PDV','DOC','Cupom','Cliente','Telefone','Endereço','Nº','Complemento','Referência','Bairro','Taxa','Tamanho','Viagens','Prioridade','Tipo','Agendado para','Status','Saída da loja','Chegada na casa do cliente','Finalizada na casa do cliente','Veículo','Entregador','Reembolsado','Observações'];
    const lines = rows.map((r) => [r.purchaseNumber, r.arrivalNumber, dateTimeBR(r.entryTime), r.pdv, r.doc, r.coupon, r.clientName, r.phone, r.street, r.houseNumber, r.complement, r.reference, nName(r.neighborhoodId), r.deliveryFee, r.size, r.tripCount, r.priority, r.type, r.scheduledAt ? dateTimeBR(r.scheduledAt) : '', STATUS_META[r.status]?.label, r.leftStoreAt ? dateTimeBR(r.leftStoreAt) : '', r.clientArrivalAt ? dateTimeBR(r.clientArrivalAt) : '', r.deliveredAt ? dateTimeBR(r.deliveredAt) : '', vName(r.vehicleId), dName(r.driverId), r.refunded ? 'Sim' : 'Não', r.notes]);
    return { name: 'entregas', header, lines };
  }
  if (kind === 'cycles') {
    const rows = (await Cycles.all()).filter((c) => c.environment === env && !c.deletedAt && inReportPeriod(c.startedAt, period));
    const header = ['Início', 'Fim', 'Veículo', 'Entregador', 'Status', 'Qtd. entregas'];
    const lines = rows.map((c) => [dateTimeBR(c.startedAt), c.closedAt ? dateTimeBR(c.closedAt) : '', vName(c.vehicleId), dName(c.driverId), c.status, (c.deliveryIds || []).length]);
    return { name: 'ciclos', header, lines };
  }
  if (kind === 'km') {
    const rows = (await OdometerLogs.all()).filter((l) => l.environment === env && inReportPeriod(l.shiftDate, period));
    const header = ['Data', 'Veículo', 'KM inicial', 'KM final', 'KM rodado'];
    const lines = rows.map((l) => [dateBR(l.shiftDate), vName(l.vehicleId), l.kmStart, l.kmEnd ?? '', l.kmEnd != null ? (l.kmEnd - l.kmStart).toFixed(1) : '']);
    return { name: 'quilometragem', header, lines };
  }
  if (kind === 'costs') {
    const categories = await CostCategories.all();
    const rows = (await Costs.all()).filter((c) => c.environment === env && !c.deletedAt && inReportPeriod(c.date, period));
    const header = ['Data', 'Categoria', 'Veículo', 'Entregador', 'Valor', 'Observação'];
    const lines = rows.map((c) => [dateBR(c.date), categories.find((cat) => cat.id === c.categoryId)?.name || '', vName(c.vehicleId), dName(c.driverId), c.amount, c.note]);
    return { name: 'custos', header, lines };
  }
  if (kind === 'audit') {
    const rows = (await AuditLog.all()).filter((e) => inReportPeriod(e.at, period));
    const header = ['Quando', 'Entidade', 'Ação', 'ID do registro'];
    const lines = rows.map((e) => [dateTimeBR(e.at), e.entityTable, e.action, e.entityId]);
    return { name: 'auditoria', header, lines };
  }
  if (kind === 'clients') {
    const rows = (await Deliveries.active(env)).filter((r) => inReportPeriod(r.entryTime, period));
    const clientKey = (r) => (r.phone || r.clientName || '').trim().toLowerCase();
    const map = {};
    rows.forEach((r) => {
      const k = clientKey(r);
      if (!k) return;
      if (!map[k]) map[k] = { name: r.clientName || '', phone: r.phone || '', count: 0, lastNeighborhood: '' };
      map[k].count++;
      map[k].lastNeighborhood = nName(r.neighborhoodId);
    });
    const header = ['Cliente', 'Telefone', 'Qtd. de entregas', 'Recorrente?', 'Último bairro'];
    const lines = Object.values(map).sort((a, b) => b.count - a.count).map((c) => [c.name, c.phone, c.count, c.count > 1 ? 'Sim' : 'Não', c.lastNeighborhood]);
    return { name: 'clientes', header, lines };
  }
  if (kind === 'resumo') {
    const rows = (await Deliveries.active(env)).filter((r) => inReportPeriod(r.entryTime, period));
    const finalized = rows.filter((r) => r.status === 'finalizada');
    const countedFees = rows.filter((d) => d.status === 'finalizada' || (d.status === 'retirada_loja' && !d.refunded));
    const periodCosts = (await Costs.all()).filter((c) => c.environment === env && !c.deletedAt && inReportPeriod(c.date, period));
    const periodKm = (await OdometerLogs.all()).filter((l) => l.environment === env && l.kmEnd != null && inReportPeriod(l.shiftDate, period));
    const financial = {
      fees: countedFees.reduce((s,d) => s + Number(d.deliveryFee || 0), 0),
      refunds: rows.filter((d) => d.refunded).reduce((s,d) => s + Number(d.deliveryFee || 0), 0),
      costsTotal: periodCosts.reduce((s,c) => s + Number(c.amount || 0), 0),
      kmTotal: periodKm.reduce((s,l) => s + (l.kmEnd - l.kmStart), 0),
    };
    financial.balance = financial.fees - financial.refunds - financial.costsTotal;
    const cycles = (await Cycles.all()).filter((c) => c.environment === env && !c.deletedAt && inReportPeriod(c.startedAt, period));
    const clientKey = (r) => (r.phone || r.clientName || '').trim().toLowerCase();
    const clientCounts = {};
    rows.forEach((r) => { const k = clientKey(r); if (k) clientCounts[k] = (clientCounts[k] || 0) + 1; });
    const recurring = Object.values(clientCounts).filter((c) => c > 1).length;
    const header = ['Indicador', 'Valor'];
    const lines = [
      ['Ambiente', env === 'treino' ? 'Treinamento' : 'Operação real'],
      ['Gerado em', dateTimeBR(new Date().toISOString())],
      ['Total de entregas', rows.length],
      ['Entregues no cliente', finalized.length],
      ['Em rota', rows.filter((r) => r.status === 'em_rota').length],
      ['Na loja', rows.filter((r) => r.status === 'na_loja').length],
      ['Retorno/Reentrega', rows.filter((r) => ['retorno', 'reentrega'].includes(r.status)).length],
      ['Retiradas na loja', rows.filter((r) => r.status === 'retirada_loja').length],
      ['Canceladas', rows.filter((r) => r.status === 'cancelada').length],
      ['Taxa de sucesso %', rows.length ? Math.round((finalized.length / rows.length) * 100) : 0],
      ['Clientes recorrentes identificados', recurring],
      ['Total de taxas', financial.fees],
      ['Reembolsos de taxa', financial.refunds],
      ['Custos', financial.costsTotal],
      ['Saldo operacional', financial.balance],
      ['KM total', financial.kmTotal.toFixed(1)],
      ['Ciclos', cycles.length],
    ];
    return { name: 'resumo_executivo', header, lines };
  }
  if (kind === 'dias_semana') {
    const rows = (await Deliveries.active(env)).filter((r) => inReportPeriod(r.entryTime, period));
    const names = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const counts = new Array(7).fill(0);
    rows.forEach((r) => { counts[new Date(r.entryTime).getDay()]++; });
    return { name: 'dias_semana', header: ['Dia da semana', 'Entregas'], lines: names.map((n, i) => [n, counts[i]]) };
  }
  if (kind === 'horarios_pico') {
    const rows = (await Deliveries.active(env)).filter((r) => inReportPeriod(r.entryTime, period));
    const counts = new Array(24).fill(0);
    rows.forEach((r) => { counts[new Date(r.entryTime).getHours()]++; });
    return { name: 'horarios_pico', header: ['Faixa horária', 'Entregas'], lines: counts.map((c, h) => [`${String(h).padStart(2,'0')}:00–${String(h).padStart(2,'0')}:59`, c]) };
  }
  if (kind === 'status') {
    const rows = (await Deliveries.active(env)).filter((r) => inReportPeriod(r.entryTime, period));
    return { name: 'status', header: ['Status', 'Quantidade'], lines: Object.entries(STATUS_META).map(([k, v]) => [v.label, rows.filter((r) => r.status === k).length]) };
  }
  if (kind === 'vehicles') {
    const rows = await Vehicles.all();
    return { name: 'veiculos', header: ['Apelido', 'Fabricante', 'Modelo', 'Placa', 'Ano', 'Tipo', 'Status'], lines: rows.map((v) => [v.label, v.brand || '', v.model || '', v.plate || '', v.year || '', v.type || '', v.active === false ? 'Inativo' : 'Ativo']) };
  }
  if (kind === 'collaborators') {
    const rows = await Collaborators.all();
    return { name: 'colaboradores', header: ['Nome', 'Função', 'Status'], lines: rows.map((c) => [c.name, c.role || '', c.active === false ? 'Inativo' : 'Ativo']) };
  }
  if (kind === 'neighborhoods') {
    const rows = await Neighborhoods.all();
    return { name: 'bairros', header: ['Bairro', 'Ordem de rota', 'Status'], lines: rows.map((n) => [n.name, n.routeOrder ?? 0, n.active === false ? 'Inativo' : 'Ativo']) };
  }
}

export function wireReportsEvents() {
  const setPeriod = (start, end) => { if ($('#reportStart')) $('#reportStart').value = start; if ($('#reportEnd')) $('#reportEnd').value = end; };
  $('#reportTodayBtn')?.addEventListener('click', () => {
    const d = new Date(); const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setPeriod(iso, iso);
  });
  $('#reportMonthBtn')?.addEventListener('click', () => {
    const d = new Date(); const end = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setPeriod(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`, end);
  });
  $$('.export-btn').forEach((btn) => btn.addEventListener('click', async () => {
    const env = getEnv();
    const period = readReportPeriod();
    const { name, header, lines } = await buildExport(btn.dataset.kind, env, period);
    downloadCSV(`orbita-${name}-${env}-${new Date().toISOString().slice(0,10)}.csv`, [header, ...lines]);
    toast('Arquivo CSV gerado.', 'success');
  }));

  $('#exportAllBtn')?.addEventListener('click', async () => {
    const env = getEnv();
    const period = readReportPeriod();
    for (const kind of ['resumo', 'deliveries', 'cycles', 'km', 'costs', 'audit', 'clients', 'dias_semana', 'horarios_pico', 'status', 'vehicles', 'collaborators', 'neighborhoods']) {
      const { name, header, lines } = await buildExport(kind, env, period);
      downloadCSV(`orbita-${name}-${env}-${new Date().toISOString().slice(0,10)}.csv`, [header, ...lines]);
      await new Promise((r) => setTimeout(r, 250)); // evita o navegador bloquear downloads múltiplos
    }
    toast('13 arquivos CSV gerados.', 'success');
  });

  $('#printReportBtn')?.addEventListener('click', async () => {
    const env = getEnv();
    const period = readReportPeriod();
    if (period.start && period.end && period.start > period.end) return toast('A data inicial não pode ser maior que a final.', 'error');
    const rows = (await Deliveries.active(env)).filter((r) => inReportPeriod(r.entryTime, period));
    const allCosts = (await Costs.all()).filter((c) => c.environment === env && !c.deletedAt && inReportPeriod(c.date, period));
    const allKm = (await OdometerLogs.all()).filter((l) => l.environment === env && l.kmEnd != null && inReportPeriod(l.shiftDate, period));
    const finalizedForFinance = rows.filter((d) => d.status === 'finalizada' || (d.status === 'retirada_loja' && !d.refunded));
    const financial = {
      fees: finalizedForFinance.reduce((s,d) => s + Number(d.deliveryFee || 0), 0),
      refunds: rows.filter((d) => d.refunded).reduce((s,d) => s + Number(d.deliveryFee || 0), 0),
      costsTotal: allCosts.reduce((s,c) => s + Number(c.amount || 0), 0),
      kmTotal: allKm.reduce((s,l) => s + (l.kmEnd - l.kmStart), 0),
    };
    financial.balance = financial.fees - financial.refunds - financial.costsTotal;
    const cycles = (await Cycles.all()).filter((c) => c.environment === env && !c.deletedAt && inReportPeriod(c.startedAt, period));
    const drivers = await Drivers.all();
    const finalized = rows.filter((r) => r.status === 'finalizada');
    const byDriver = {};
    finalized.forEach((d) => { byDriver[d.driverId] = (byDriver[d.driverId] || 0) + 1; });
    const rankingRows = Object.entries(byDriver).sort((a,b) => b[1]-a[1]).slice(0,5)
      .map(([id, c]) => `<tr><td>${escapeHtml(drivers.find(d=>d.id===id)?.name || 'Sem entregador')}</td><td>${c}</td></tr>`).join('');

    const weekdayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const byWeekday = new Array(7).fill(0);
    rows.forEach((r) => { byWeekday[new Date(r.entryTime).getDay()]++; });

    const area = $('#printArea');
    area.innerHTML = `
      <div class="print-report-head"><img src="assets/brand/nilo-logo.png" alt="Nilo" /><div><span>ÓRBITA · CONTROLE DE ENTREGAS</span><h2>Relatório gerencial</h2><p>${env === 'treino' ? 'Ambiente de treinamento' : 'Operação Real'} · Período: ${period.start ? dateBR(period.start + 'T12:00:00') : 'início'} a ${period.end ? dateBR(period.end + 'T12:00:00') : 'hoje'}</p></div><strong>${dateTimeBR(new Date().toISOString())}</strong></div>
      <h3>Indicadores gerais</h3>
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin-bottom:16px">
        <tr><td>Total de entregas</td><td>${rows.length}</td></tr>
        <tr><td>Finalizadas</td><td>${finalized.length}</td></tr>
        <tr><td>Taxa de sucesso</td><td>${rows.length ? Math.round(finalized.length/rows.length*100) : 0}%</td></tr>
        <tr><td>Ciclos realizados</td><td>${cycles.length}</td></tr>
        <tr><td>KM total rodado</td><td>${financial.kmTotal.toFixed(1)} km</td></tr>
      </table>
      <h3>Financeiro</h3>
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin-bottom:16px">
        <tr><td>Total de taxas</td><td>${money(financial.fees)}</td></tr>
        <tr><td>Reembolsos</td><td>${money(financial.refunds)}</td></tr>
        <tr><td>Custos</td><td>${money(financial.costsTotal)}</td></tr>
        <tr><td>Saldo</td><td>${money(financial.balance)}</td></tr>
      </table>
      <h3>Entregas por dia da semana</h3>
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin-bottom:16px">
        <tr>${weekdayNames.map(d=>`<th>${d}</th>`).join('')}</tr>
        <tr>${byWeekday.map(v=>`<td style="text-align:center">${v}</td>`).join('')}</tr>
      </table>
      <h3>Ranking por entregador</h3>
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
        <tr><th>Entregador</th><th>Entregas finalizadas</th></tr>
        ${rankingRows || '<tr><td colspan="2">Sem dados suficientes</td></tr>'}
      </table>
      <h3>Horários das entregas finalizadas</h3>
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
        <tr><th>Compra</th><th>Cliente</th><th>Saída</th><th>Chegada no cliente</th><th>Finalizada no cliente</th></tr>
        ${finalized.length ? finalized.map((r) => `<tr><td>#${r.purchaseNumber}</td><td>${escapeHtml(r.clientName || r.street || '—')}</td><td>${timeBR(r.leftStoreAt)}</td><td>${timeBR(r.clientArrivalAt)}</td><td>${timeBR(r.deliveredAt)}</td></tr>`).join('') : '<tr><td colspan="5">Nenhuma entrega finalizada no período</td></tr>'}
      </table>`;    area.classList.remove('hidden');
    window.addEventListener('afterprint', () => area.classList.add('hidden'), { once: true });
    window.print();
  });
}

/* =========================================================
   AUDITORIA (seção 13)
   ========================================================= */
export async function renderAudit() {
  const log = await AuditLog.all();
  if (!log.length) return `<div class="empty-state"><strong>Sem eventos ainda</strong></div>`;
  const rows = log.slice(0, 200).map((e) => `
    <tr><td>${dateTimeBR(e.at)}</td><td>${escapeHtml(e.entityTable)}</td><td>${e.action}</td><td style="font-family:monospace;font-size:11px">${escapeHtml(e.entityId).slice(0,14)}</td></tr>
  `).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Entidade</th><th>Ação</th><th>ID</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* =========================================================
   LIXEIRA
   ========================================================= */
export async function renderTrash() {
  const env = getEnv();
  const rows = (await Deliveries.trashed(env)).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  if (!rows.length) return `<div class="empty-state"><strong>Lixeira vazia</strong></div>`;
  const trs = rows.map((r) => `
    <tr data-id="${r.id}">
      <td><strong>#${r.purchaseNumber}</strong> ${escapeHtml(r.clientName || '')}</td>
      <td>${dateBR(r.deletedAt)}</td>
      <td><button class="btn-ghost btn-small restore-btn">Restaurar</button></td>
    </tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Entrega</th><th>Removida em</th><th></th></tr></thead><tbody>${trs}</tbody></table></div>`;
}
export function wireTrashEvents() {
  $$('.restore-btn').forEach((btn) => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('tr').dataset.id;
    await Deliveries.restore(id);
    toast('Entrega restaurada.', 'success');
    refreshApp();
  }));
}

/* =========================================================
   CADASTROS ADMINISTRATIVOS (seção 15)
   ========================================================= */
export async function renderRegistry(tab = 'vehicles') {
  const tabs = [
    ['vehicles', 'Veículos'], ['drivers', 'Entregadores'], ['collaborators', 'Colaboradores'], ['neighborhoods', 'Bairros'],
    ['costCategories', 'Categorias de custo'], ['returnReasons', 'Motivos de retorno'],
  ];
  const tabsHtml = tabs.map(([key, label]) => `<button class="btn-ghost btn-small registry-tab ${tab === key ? 'active-tab' : ''}" data-tab="${key}">${label}</button>`).join('');

  let listHtml = '';
  if (tab === 'vehicles') listHtml = await vehicleList();
  if (tab === 'drivers') listHtml = await registryList(Drivers, 'name', 'drivers');
  if (tab === 'collaborators') listHtml = await collaboratorList();
  if (tab === 'neighborhoods') listHtml = await registryList(Neighborhoods, 'name', 'neighborhoods', true);
  if (tab === 'costCategories') listHtml = await registryList(CostCategories, 'name', 'costCategories');
  if (tab === 'returnReasons') listHtml = await registryList(ReturnReasons, 'label', 'returnReasons');

  return `<div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap">${tabsHtml}</div>
    <div style="margin-bottom:12px"><button class="btn-primary btn-small" id="registryAddBtn" data-tab="${tab}">＋ Adicionar</button></div>
    ${listHtml}`;
}

async function registryList(store, field, storeName, showOrder = false) {
  const rows = await store.all();
  if (!rows.length) return `<div class="empty-state"><strong>Nada cadastrado ainda</strong></div>`;
  const trs = rows.map((r) => `
    <tr data-id="${r.id}" data-store="${storeName}">
      <td>${escapeHtml(r[field])}${showOrder ? ` <span style="color:var(--text-muted);font-size:11px">(ordem ${r.routeOrder ?? 0})</span>` : ''}</td>
      <td>${r.active === false ? '<span class="badge problema">Inativo</span>' : '<span class="badge entregue">Ativo</span>'}</td>
      <td><div class="registry-actions"><button class="btn-ghost btn-small registry-edit">Editar</button><button class="btn-ghost btn-small registry-toggle">${r.active === false ? 'Reativar' : 'Desativar'}</button></div></td>
    </tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Status</th><th></th></tr></thead><tbody>${trs}</tbody></table></div>`;
}

async function collaboratorList() {
  const rows = await Collaborators.all();
  if (!rows.length) return `<div class="empty-state"><strong>Nenhum colaborador cadastrado</strong>Cadastre aqui qualquer pessoa que deva aparecer na saudação: operadores, líderes, agentes de prevenção etc.</div>`;
  const trs = rows.map((c) => `
    <tr data-id="${c.id}" data-store="collaborators">
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>${escapeHtml(c.role || 'Operador')}</td>
      <td>${c.active === false ? '<span class="badge problema">Inativo</span>' : '<span class="badge entregue">Ativo</span>'}</td>
      <td><div class="registry-actions"><button class="btn-ghost btn-small registry-edit">Editar</button><button class="btn-ghost btn-small registry-toggle">${c.active === false ? 'Reativar' : 'Desativar'}</button></div></td>
    </tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Função</th><th>Status</th><th></th></tr></thead><tbody>${trs}</tbody></table></div>`;
}

async function vehicleList() {
  const rows = await Vehicles.all();
  if (!rows.length) return `<div class="empty-state"><strong>Nenhum veículo cadastrado</strong></div>`;
  const trs = rows.map((v) => `
    <tr data-id="${v.id}" data-store="vehicles">
      <td><strong>${escapeHtml(v.label)}</strong></td>
      <td>${escapeHtml(v.brand || '—')}</td>
      <td>${escapeHtml(v.model || '—')}</td>
      <td>${escapeHtml(v.plate || '—')}</td>
      <td>${escapeHtml(v.year || '—')}</td>
      <td>${v.active === false ? '<span class="badge problema">Inativo</span>' : '<span class="badge entregue">Ativo</span>'}</td>
      <td><div class="registry-actions"><button class="btn-ghost btn-small registry-edit">Editar</button><button class="btn-ghost btn-small registry-toggle">${v.active === false ? 'Reativar' : 'Desativar'}</button></div></td>
    </tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Apelido</th><th>Fabricante</th><th>Modelo</th><th>Placa</th><th>Ano</th><th>Status</th><th></th></tr></thead><tbody>${trs}</tbody></table></div>`;
}

const REGISTRY_STORES = { vehicles: Vehicles, drivers: Drivers, collaborators: Collaborators, neighborhoods: Neighborhoods, costCategories: CostCategories, returnReasons: ReturnReasons };
const REGISTRY_FIELD = { vehicles: 'label', drivers: 'name', collaborators: 'name', neighborhoods: 'name', costCategories: 'name', returnReasons: 'label' };

export function wireRegistryEvents(currentTab, onTabChange) {
  $$('.registry-tab').forEach((btn) => btn.addEventListener('click', () => onTabChange(btn.dataset.tab)));
  $('#registryAddBtn')?.addEventListener('click', () => openRegistryAddModal(currentTab));
  $$('.registry-edit').forEach((btn) => btn.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    const store = REGISTRY_STORES[tr.dataset.store];
    const rec = await store.get(tr.dataset.id);
    if (rec) openRegistryAddModal(currentTab, rec);
  }));
  $$('.registry-toggle').forEach((btn) => btn.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    const store = REGISTRY_STORES[tr.dataset.store];
    const rec = await store.get(tr.dataset.id);
    // desativar preserva histórico — nunca apaga (seção 15)
    await store.update(rec.id, rec.active === false ? { active: true } : { active: false, deactivatedAt: new Date().toISOString() });
    toast('Atualizado.', 'success');
    onTabChange(currentTab);
  }));
}

function openRegistryAddModal(tab, record = null) {
  if (tab === 'vehicles') return openVehicleAddModal(record);
  if (tab === 'collaborators') return openCollaboratorAddModal(record);
  const field = REGISTRY_FIELD[tab];
  const store = REGISTRY_STORES[tab];
  const isNeighborhood = tab === 'neighborhoods';
  openModal({
    title: record ? 'Editar cadastro' : 'Novo cadastro',
    subtitle: record ? 'As alterações serão registradas automaticamente na auditoria.' : '',
    body: `
      <form id="registryForm">
        <label>Nome *<input name="${field}" required value="${escapeHtml(record?.[field] || '')}" /></label>
        ${isNeighborhood ? `<label>Ordem de rota<input name="routeOrder" type="number" value="${record?.routeOrder ?? 0}" /></label>` : ''}
      </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Salvar', kind: 'primary', onClick: async () => {
        const form = $('#registryForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const payload = { [field]: fd[field].trim(), active: record?.active ?? true };
        if (isNeighborhood) payload.routeOrder = Number(fd.routeOrder || 0);
        if (record) await store.update(record.id, payload);
        else await store.add(payload);
        toast(record ? 'Cadastro atualizado.' : 'Cadastrado.', 'success');
        closeModal();
        refreshApp();
      }},
    ],
  });
}

function openCollaboratorAddModal(record = null) {
  const roles = ['Operador', 'Líder', 'Agente de Prevenção', 'Administrador', 'Outro'];
  openModal({
    title: record ? 'Editar colaborador' : 'Novo colaborador',
    subtitle: record ? 'O nome atualizado entrará automaticamente no rodízio da saudação.' : 'Qualquer nome cadastrado aqui aparece automaticamente na saudação.',
    body: `
      <form id="collabForm">
        <label>Nome *<input name="name" required value="${escapeHtml(record?.name || '')}" /></label>
        <label>Função
          <select name="role">
            ${roles.map((role) => `<option value="${role}" ${record?.role === role ? 'selected' : ''}>${role}</option>`).join('')}
          </select>
        </label>
      </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Salvar', kind: 'primary', onClick: async () => {
        const form = $('#collabForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const payload = { name: fd.name.trim(), role: fd.role, active: record?.active ?? true };
        if (record) await Collaborators.update(record.id, payload);
        else await Collaborators.add(payload);
        toast(record ? 'Colaborador atualizado.' : 'Colaborador cadastrado.', 'success');
        closeModal();
        refreshApp();
      }},
    ],
  });
}

function openVehicleAddModal(record = null) {
  const years = Array.from({ length: 36 }, (_, i) => new Date().getFullYear() + 1 - i);
  const types = [['carro','Carro'],['moto','Moto'],['van','Van/Furgão'],['outro','Outro']];
  openModal({
    title: record ? 'Editar veículo' : 'Novo veículo',
    subtitle: record ? 'Você pode alterar qualquer campo sem perder o histórico deste veículo.' : '',
    body: `
      <form id="vehicleForm">
        <label>Apelido (como aparece nas listas) *<input name="label" required placeholder="Ex: Fiorino 1" value="${escapeHtml(record?.label || '')}" /></label>
        <div class="field-row">
          <label>Fabricante<input name="brand" placeholder="Ex: Fiat" value="${escapeHtml(record?.brand || '')}" /></label>
          <label>Modelo<input name="model" placeholder="Ex: Fiorino Furgão" value="${escapeHtml(record?.model || '')}" /></label>
        </div>
        <div class="field-row">
          <label>Placa<input name="plate" placeholder="ABC-1D23" style="text-transform:uppercase" value="${escapeHtml(record?.plate || '')}" /></label>
          <label>Ano de fabricação<select name="year"><option value="">—</option>${years.map((y) => `<option value="${y}" ${String(record?.year || '') === String(y) ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
        </div>
        <div class="field-row">
          <label>Tipo<select name="type">${types.map(([value,label]) => `<option value="${value}" ${record?.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
          <label>Capacidade (kg)<input name="capacity" type="number" min="0" placeholder="Opcional" value="${record?.capacity ?? ''}" /></label>
        </div>
      </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Salvar', kind: 'primary', onClick: async () => {
        const form = $('#vehicleForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const payload = {
          label: fd.label.trim(), brand: fd.brand?.trim() || '', model: fd.model?.trim() || '',
          plate: fd.plate?.trim().toUpperCase() || '', year: fd.year || '', type: fd.type, capacity: fd.capacity ? Number(fd.capacity) : null,
          active: record?.active ?? true,
        };
        if (record) await Vehicles.update(record.id, payload);
        else await Vehicles.add(payload);
        toast(record ? 'Veículo atualizado.' : 'Veículo cadastrado.', 'success');
        closeModal();
        refreshApp();
      }},
    ],
  });
}

/* =========================================================
   CONFIGURAÇÕES (backup, treinamento, empresa)
   ========================================================= */
export async function renderSettings() {
  const cfg = JSON.parse(localStorage.getItem('orbita_settings') || '{}');
  const { listAutoBackups } = await import('./db.js');
  const autoBackups = await listAutoBackups();
  const autoList = autoBackups.length
    ? autoBackups.map((b) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed var(--line)">
          <span style="font-size:12.5px">${dateTimeBR(b.at)}</span>
          <button class="btn-ghost btn-small auto-restore-btn" data-id="${b.id}">Restaurar este</button>
        </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-muted)">Ainda não rodou nenhum backup automático — o primeiro acontece ao abrir o app.</p>';

  return `
    <div class="stat-card" style="margin-bottom:16px">
      <small>Backup automático</small>
      <p style="font-size:12.5px;color:var(--text-muted);margin:8px 0">Roda sozinho ao abrir o app e a cada 10 minutos — guarda os últimos 5, direto neste aparelho, sem precisar baixar nada.</p>
      ${autoList}
    </div>
    <div class="stat-card" style="margin-bottom:16px">
      <small>Backup manual e restauração</small>
      <p style="font-size:12.5px;color:var(--text-muted);margin:8px 0">Gera um arquivo antes de qualquer restauração, para nunca perder dados por engano.</p>
      <div style="display:flex;gap:8px">
        <button class="btn-ghost btn-small" id="settingsBackupBtn">⇩ Backup completo (JSON)</button>
        <label class="btn-ghost btn-small" style="cursor:pointer">⇧ Restaurar<input type="file" id="settingsRestoreInput" accept="application/json" hidden /></label>
      </div>
    </div>
    <div class="stat-card">
      <small>Empresa</small>
      <form id="companyForm" style="margin-top:8px;display:grid;gap:8px;max-width:360px">
        <label>Nome<input name="companyName" value="${escapeHtml(cfg.companyName || 'Nilo Supermercado')}" /></label>
        <label>Limite de atraso (minutos)<input name="delayLimit" type="number" value="${cfg.delayLimit || 60}" /></label>
        <button type="submit" class="btn-primary btn-small" style="width:fit-content">Salvar</button>
      </form>
    </div>
  `;
}
export function wireSettingsEvents() {
  $$('.auto-restore-btn').forEach((btn) => btn.addEventListener('click', async () => {
    if (!confirm('Restaurar esse backup automático vai substituir os dados atuais. Continuar?')) return;
    const { restoreAutoBackup } = await import('./db.js');
    await restoreAutoBackup(btn.dataset.id);
    toast('Backup automático restaurado.', 'success');
    refreshApp();
  }));
  $('#settingsBackupBtn')?.addEventListener('click', async () => {
    const data = await (await import('./db.js')).exportAll();
    downloadJSON(`orbita-backup-completo-${new Date().toISOString().slice(0,10)}.json`, data);
    toast('Backup completo gerado.', 'success');
  });
  $('#settingsRestoreInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Isso vai substituir os dados atuais pelo conteúdo do backup. Um backup de segurança dos dados atuais será baixado antes. Continuar?')) { e.target.value = ''; return; }
    const currentBackup = await (await import('./db.js')).exportAll();
    downloadJSON(`orbita-backup-seguranca-antes-restauracao-${Date.now()}.json`, currentBackup);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await (await import('./db.js')).importAll(data);
      toast('Backup restaurado.', 'success');
      refreshApp();
    } catch { toast('Arquivo de backup inválido.', 'error'); }
    e.target.value = '';
  });
  $('#companyForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    localStorage.setItem('orbita_settings', JSON.stringify({ companyName: fd.companyName, delayLimit: Number(fd.delayLimit) }));
    toast('Configurações salvas.', 'success');
  });
}
