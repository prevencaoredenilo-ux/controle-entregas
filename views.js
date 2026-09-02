import { Deliveries, Vehicles, Drivers, Collaborators, Neighborhoods, CostCategories, ReturnReasons, Cycles, OdometerLogs, Costs, DayClosures, AuditLog, Counters } from './db.js?v=5.4';
import { $, $$, money, dateBR, dateTimeBR, timeBR, escapeHtml, toast, badge, STATUS_META, guardClick, downloadCSV, downloadJSON, wirePhoneMask, animateStatCards, motivationalPhrase, performanceProfile, barChartSVG, lineChartSVG, thermometerHTML } from './helpers.js?v=5.4';
import { getEnv, getOperatorName, getOperatorRole, canPerform, closeModal, openModal, refreshApp } from './app.js?v=5.4';
import { exportFullExcelReport } from './excel-report.js?v=5.4';

const DEFAULT_OPERATIONAL_TARGETS = { startMinutes:120, arrivalMinutes:210, warningMinutes:30, successTarget:90 };

function operationalTargets() {
  try { return { ...DEFAULT_OPERATIONAL_TARGETS, ...JSON.parse(localStorage.getItem('orbita_operational_targets') || '{}') }; }
  catch { return { ...DEFAULT_OPERATIONAL_TARGETS }; }
}

export async function normalizeReturnQueueStatus() {
  const env = getEnv();
  const rows = await Deliveries.active(env);
  const legacyReturned = rows.filter((r) => ['retorno', 'reentrega'].includes(r.status));
  await Promise.all(legacyReturned.map((record) => Deliveries.update(record.id, {
    status: 'na_loja',
    cycleId: null, vehicleId: null, driverId: null,
    leftStoreAt: null, clientArrivalAt: null, deliveredAt: null,
    normalizedReturnQueueAt: new Date().toISOString(),
  }).catch(() => null)));
}

function formatKm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

function formatPerKm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ent./km`;
}

function nextDailyPurchaseNumber(deliveries, entryTime, excludeId = null) {
  const dayKey = localDateKey(entryTime);
  return deliveries
    .filter((item) => item.id !== excludeId && item.type !== 'agendada' && localDateKey(item.entryTime) === dayKey)
    .reduce((max, item) => Math.max(max, Number(item.purchaseNumber) || 0), 0) + 1;
}

function nextArrivalNumber(deliveries, entryTime, excludeId = null) {
  const dayKey = localDateKey(entryTime);
  return deliveries
    .filter((item) => item.id !== excludeId && localDateKey(item.entryTime) === dayKey)
    .reduce((max, item) => Math.max(max, Number(item.arrivalNumber) || 0), 0) + 1;
}

function nextScheduledPurchaseNumber(deliveries, excludeId = null) {
  return deliveries
    .filter((item) => item.id !== excludeId && item.type === 'agendada')
    .reduce((max, item) => Math.max(max, Number(item.purchaseNumber) || 0), 0) + 1;
}

function registrationTimestamp(record) {
  const created = Date.parse(record?.createdAt || '');
  if (Number.isFinite(created)) return created;
  const idPart = String(record?.id || '').split('_')[1];
  if (idPart) {
    const parsed = parseInt(idPart, 36);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.MAX_SAFE_INTEGER;
}

async function repairNormalPurchaseNumbers({ environment = getEnv(), selectedDay = null, reason = 'Correção automática da numeração diária pela ordem de cadastro' } = {}) {
  const rows = await Deliveries.active(environment);
  const normals = rows.filter((r) => r.type !== 'agendada' && (!selectedDay || localDateKey(r.entryTime) === selectedDay));
  const groups = new Map();
  normals.forEach((row) => {
    const day = localDateKey(row.entryTime);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(row);
  });

  let changed = 0;
  const changedDays = new Set();
  for (const [day, dayRows] of groups.entries()) {
    dayRows.sort((a, b) => {
      const createdA = registrationTimestamp(a);
      const createdB = registrationTimestamp(b);
      if (createdA !== createdB) return createdA - createdB;
      return String(a.id).localeCompare(String(b.id));
    });

    for (let i = 0; i < dayRows.length; i += 1) {
      const row = dayRows[i];
      const expected = i + 1;
      if (Number(row.purchaseNumber) === expected) continue;
      const history = [...(row.numberingCorrections || []), {
        previous: row.purchaseNumber,
        current: expected,
        day,
        by: getOperatorName(),
        at: new Date().toISOString(),
        reason,
      }];
      await Deliveries.update(row.id, {
        purchaseNumber: expected,
        numberingCorrections: history,
        numberingCorrection: history.at(-1),
      });
      changed += 1;
      changedDays.add(day);
    }
  }

  return { changed, days: [...changedDays] };
}

export async function normalizeExistingDailyPurchaseNumbers() {
  return repairNormalPurchaseNumbers({ reason: 'Migração automática v5.4: correção dos números já lançados pela data da entrega e ordem de cadastro' });
}

function deliverySla(record, nowMs = Date.now()) {
  const targets = operationalTargets();
  const baseValue = record.type === 'agendada' && record.scheduledAt ? record.scheduledAt : record.entryTime;
  const baseMs = new Date(baseValue).getTime();
  const active = ['na_loja','em_rota','no_cliente'].includes(record.status);
  if (!Number.isFinite(baseMs)) return { startLate:false,arrivalLate:false,startRisk:false,arrivalRisk:false,startDeadline:null,arrivalDeadline:null };
  const startDeadlineMs = baseMs + targets.startMinutes*60000;
  const arrivalDeadlineMs = baseMs + targets.arrivalMinutes*60000;
  const warningMs = targets.warningMinutes*60000;
  const leftMs = record.leftStoreAt ? new Date(record.leftStoreAt).getTime() : null;
  const arrivalMs = record.clientArrivalAt ? new Date(record.clientArrivalAt).getTime() : null;
  return {
    startLate: leftMs ? leftMs > startDeadlineMs : active && nowMs > startDeadlineMs,
    arrivalLate: arrivalMs ? arrivalMs > arrivalDeadlineMs : active && nowMs > arrivalDeadlineMs,
    startRisk: !leftMs && active && nowMs >= startDeadlineMs-warningMs && nowMs <= startDeadlineMs,
    arrivalRisk: !arrivalMs && active && nowMs >= arrivalDeadlineMs-warningMs && nowMs <= arrivalDeadlineMs,
    startDeadline:new Date(startDeadlineMs).toISOString(), arrivalDeadline:new Date(arrivalDeadlineMs).toISOString(),
  };
}

/* =========================================================
   CENTRAL OPERACIONAL
   ========================================================= */
export async function renderCentral() {
  const env = getEnv();
  const rows = await Deliveries.active(env);
  const [cycles, vehicles, drivers, collaborators, kmLogs, costs] = await Promise.all([
    Cycles.all(), Vehicles.all(), Drivers.all(), Collaborators.all(), OdometerLogs.all(), Costs.all(),
  ]);
  const openCycles = cycles.filter((c) => c.environment === env && c.status === 'aberto' && !c.deletedAt);
  const vName = (id) => vehicles.find((v) => v.id === id)?.label || 'Veículo';
  const dName = (id) => drivers.find((d) => d.id === id)?.name || 'Entregador';

  const naLoja = rows.filter((r) => r.status === 'na_loja');
  const emRota = rows.filter((r) => ['em_rota', 'no_cliente'].includes(r.status));
  const returnEligible = rows.filter((r) => ['em_rota', 'no_cliente'].includes(r.status));
  const prioritarias = rows.filter((r) => r.priority === 'alta' && ['na_loja', 'em_rota', 'no_cliente'].includes(r.status));
  const reentrega = rows.filter((r) => r.status === 'na_loja' && (r.returnAttempts || []).length > 0);
  const agendadas = rows.filter((r) => r.type === 'agendada' && r.status === 'programada');
  const slaRows = rows.map((record) => ({ record, sla:deliverySla(record) }));
  const operationalSlaRows = slaRows.filter(({record})=>['na_loja','em_rota','no_cliente'].includes(record.status));
  const startLateRows = operationalSlaRows.filter(({sla})=>sla.startLate).map(({record})=>record);
  const arrivalLateRows = operationalSlaRows.filter(({sla})=>sla.arrivalLate).map(({record})=>record);
  const startRiskRows = operationalSlaRows.filter(({sla})=>sla.startRisk).map(({record})=>record);
  const arrivalRiskRows = operationalSlaRows.filter(({sla})=>sla.arrivalRisk).map(({record})=>record);
  const lateIds = new Set([...startLateRows,...arrivalLateRows].map((r)=>r.id));
  const atrasadas = rows.filter((r)=>lateIds.has(r.id));
  const pendingKmLogs = kmLogs.filter((k) => k.environment === env && k.kmEnd == null);
  const kmPendente = pendingKmLogs.length;

  const now = new Date();
  const isToday = (value) => {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };
  const todayRows = rows.filter((r) => isToday(r.entryTime));
  const todaySlaRows = todayRows.map((record)=>({record,sla:deliverySla(record)}));
  const startLateTodayRows = todaySlaRows.filter(({sla})=>sla.startLate).map(({record})=>record);
  const arrivalLateTodayRows = todaySlaRows.filter(({sla})=>sla.arrivalLate).map(({record})=>record);
  const todayLateIds = new Set([...startLateTodayRows,...arrivalLateTodayRows].map((r)=>r.id));
  const completedToday = todayRows.filter((r) => (r.status === 'finalizada' && !!r.deliveredAt) || r.status === 'retirada_loja').length;
  const problemsToday = todayRows.filter((r) => r.status === 'cancelada' || (r.returnAttempts || []).length > 0).length;
  const lateToday = todayLateIds.size;
  const startLateToday = startLateTodayRows.length;
  const arrivalLateToday = arrivalLateTodayRows.length;
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

  const activeVehicles = vehicles.filter((v) => v.active);
  const todayKmLogs = kmLogs.filter((l) => l.environment === env && isToday(l.shiftDate));
  const readyKmLogs = todayKmLogs.filter((l) => l.kmStart != null && l.kmEnd == null);
  const closedTodayKmLogs = todayKmLogs.filter((l) => l.kmStart != null && l.kmEnd != null);
  const readyVehicleIds = new Set(readyKmLogs.map((l) => l.vehicleId));
  const vehiclesMissingInitial = activeVehicles.filter((v) => !todayKmLogs.some((l) => l.vehicleId === v.id));
  const vehiclesClosedToday = activeVehicles.filter((v) => todayKmLogs.some((l) => l.vehicleId === v.id && l.kmEnd != null));

  const alerts = [];
  if (startLateRows.length) alerts.push({ text: `⏱ ${startLateRows.length} atraso(s) de saída — limite 2h`, query: 'atraso_inicio' });
  if (arrivalLateRows.length) alerts.push({ text: `⌂ ${arrivalLateRows.length} atraso(s) de chegada — limite 3h30`, query: 'atraso_chegada' });
  if (startRiskRows.length || arrivalRiskRows.length) alerts.push({ text: `◷ ${startRiskRows.length + arrivalRiskRows.length} entrega(s) perto do limite`, query: 'risco_sla' });
  if (prioritarias.length) alerts.push({ text: `⭐ ${prioritarias.length} entrega(s) prioritária(s) aguardando`, query: 'alta' });
  if (kmPendente) alerts.push({ text: `⌁ ${kmPendente} veículo(s) sem KM final registrado`, query: '' });
  if (vehiclesMissingInitial.length) alerts.push({ text: `🚫 ${vehiclesMissingInitial.length} veículo(s) sem KM inicial hoje — ciclo bloqueado`, query: '' });
  if (reentrega.length) alerts.push({ text: `↻ ${reentrega.length} entrega(s) retornaram e já estão disponíveis para novo ciclo`, query: 'na_loja' });

  const finalizedToday = todayRows.filter((r) => r.status === 'finalizada' && r.deliveredAt);
  const todayFees = todayRows.filter((r) => r.status === 'finalizada' || (r.status === 'retirada_loja' && !r.refunded)).reduce((s,r) => s + Number(r.deliveryFee || 0), 0);
  const todayRefunds = todayRows.filter((r) => r.refunded).reduce((s,r) => s + Number(r.deliveryFee || 0), 0);
  const todayCosts = costs.filter((c) => c.environment === env && !c.deletedAt && isToday(c.date)).reduce((s,c) => s + Number(c.amount || 0), 0);
  const todayResult = todayFees - todayRefunds - todayCosts;
  const todayKm = kmLogs.filter((l) => l.environment === env && l.kmEnd != null && isToday(l.shiftDate)).reduce((s,l) => s + Math.max(0, Number(l.kmEnd) - Number(l.kmStart)), 0);
  const avgTodayTotal = averageMinutes(finalizedToday, 'entryTime', 'deliveredAt');
  const avgTodayRoute = averageMinutes(finalizedToday, 'leftStoreAt', 'clientArrivalAt');
  const noCliente = rows.filter((r) => r.status === 'no_cliente');
  const envClosedCycles = cycles.filter((c)=>c.environment===env&&c.status==='fechado'&&!c.deletedAt);
  const avgCycleLoad = envClosedCycles.length ? envClosedCycles.reduce((s,c)=>s+(c.deliveryIds||[]).length,0)/envClosedCycles.length : null;
  const occupiedVehicleIds = new Set(openCycles.map((c)=>c.vehicleId));
  const availableReadyVehicles = readyKmLogs.filter((l)=>!occupiedVehicleIds.has(l.vehicleId)).length;
  const nextWaveCapacity = avgCycleLoad == null ? null : Math.max(0,Math.floor(availableReadyVehicles*avgCycleLoad));
  const tomorrowCentral = new Date(); tomorrowCentral.setDate(tomorrowCentral.getDate()+1);
  const tomorrowHistory = byWeekdayCountOccurrences(rows,tomorrowCentral.getDay());
  const tomorrowForecast = tomorrowHistory.occurrences ? tomorrowHistory.total/tomorrowHistory.occurrences : null;
  const liveLaneCard = (r) => `<article class="live-delivery-card" role="button" tabindex="0" data-delivery-id="${r.id}" data-tip="Compra #${r.purchaseNumber} · ${escapeHtml(r.clientName || 'Sem nome')} · Entrada ${timeBR(r.entryTime)} · Saída ${timeBR(r.leftStoreAt)} · Chegada ${timeBR(r.clientArrivalAt)} · Finalização ${timeBR(r.deliveredAt)} · Clique para abrir.">
    <div><strong>#${r.purchaseNumber}</strong>${r.priority === 'alta' ? '<span>ALTA</span>' : ''}</div>
    <p>${escapeHtml(r.clientName || r.street || 'Cliente sem nome')}</p>
    <small>${timeBR(r.entryTime)} · ${escapeHtml(STATUS_META[r.status]?.label || r.status)}</small>
  </article>`;

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
      <aside class="shift-readiness-panel">
        <div class="readiness-title"><div><span>PRONTIDÃO DO TURNO</span><strong>${readyKmLogs.length ? 'Operação liberada por veículo' : 'Ação necessária antes da saída'}</strong></div><button id="performanceExplainBtn" data-completion="${completionPctToday}" data-punctuality="${Math.round(punctuality*100)}" data-quality="${Math.round(quality*100)}" data-tip="Veja como o desempenho é calculado e o que fazer para melhorá-lo.">Como melhorar?</button></div>
        <div class="readiness-actions">
          <button id="heroKmAction" data-missing="${vehiclesMissingInitial.length}" class="${readyKmLogs.length ? 'ready' : 'blocked'}" data-tip="${readyKmLogs.length} de ${activeVehicles.length} veículo(s) com KM inicial aberto hoje. Veículos sem KM ou com expediente encerrado não iniciam ciclo."><i>⌁</i><span><small>KM PARA CICLO</small><strong>${readyKmLogs.length}/${activeVehicles.length} prontos</strong></span><b>${readyKmLogs.length ? '✓' : '!'}</b></button>
          <button id="heroQueueAction" data-tip="${naLoja.length} entrega(s) aguardando formação de ciclo."><i>▤</i><span><small>FILA AGORA</small><strong>${naLoja.length} na loja</strong></span><b>↓</b></button>
          <button id="heroCycleAction" data-tip="${openCycles.length} ciclo(s) ativo(s). Iniciar ciclo exige KM inicial, veículo, entregador e hora de saída."><i>↗</i><span><small>CICLOS</small><strong>${openCycles.length} ativos</strong></span><b>›</b></button>
        </div>
        <div class="greeting-thermo compact-thermo">${thermometerHTML(score, 'Desempenho')}</div>
        ${vehiclesClosedToday.length ? `<small class="readiness-note">${vehiclesClosedToday.length} veículo(s) com expediente já encerrado hoje.</small>` : ''}
      </aside>
    </div>

    <section class="return-spotlight ${returnEligible.length ? 'has-returns' : ''}" id="returnSpotlight">
      <div class="return-spotlight-icon">↩</div>
      <div class="return-spotlight-copy"><span>RETORNO DE ENTREGA À LOJA</span><h2>${returnEligible.length ? `${returnEligible.length} entrega(s) podem ter o retorno registrado` : 'A entrega não foi concluída no cliente?'}</h2><p>Registre a hora que voltou, o motivo, a situação da mercadoria e se haverá nova tentativa. O ciclo não fecha sem resolver isso.</p></div>
      <div class="return-spotlight-status"><small>${returnEligible.length ? 'AGUARDANDO AÇÃO' : 'ACESSO SEMPRE VISÍVEL'}</small><strong>${returnEligible.length}</strong></div>
      <button type="button" class="return-spotlight-btn" id="returnSpotlightBtn">Registrar retorno agora <b>›</b></button>
    </section>

    ${alerts.length ? `<div class="alert-strip">${alerts.map((a) => `<button type="button" class="alert-chip" data-query="${escapeHtml(a.query)}">${a.text}</button>`).join('')}</div>` : ''}

    <section class="control-room-grid">
      <article class="ops-score-console" id="opsScoreConsole" role="button" tabindex="0" data-tip="O índice combina conclusão (65%), pontualidade (20%) e ausência de ocorrências (15%). Clique para ver os detalhes.">
        <div class="score-ring" style="--score:${score};--score-color:${profile.color}"><strong>${score}</strong><small>/100</small></div>
        <div><span>PULSO DA OPERAÇÃO</span><h2>${profile.label}</h2><p>${phrase}</p></div>
      </article>
      <article class="ops-flow-console">
        <div class="console-title"><span>FLUXO AO VIVO</span><strong>${pendingToday} exigem ação</strong></div>
        <div class="flow-stages">
          ${[['na_loja','Na loja',naLoja.length],['em_andamento','Em rota',rows.filter(r=>r.status==='em_rota').length],['no_cliente','No cliente',noCliente.length],['finalizada','Finalizadas hoje',completedToday]].map(([key,label,value]) => `<button data-central-filter="${key}" data-tip="Clique para filtrar a fila por ${label.toLowerCase()}."><i></i><strong data-count="${value}">0</strong><small>${label}</small></button>`).join('')}
        </div>
      </article>
      <article class="ops-pulse-console" id="opsSlaConsole" role="button" tabindex="0" data-start-late="${startLateToday}" data-arrival-late="${arrivalLateToday}" data-risk="${startRiskRows.length+arrivalRiskRows.length}" data-avg-total="${formatDuration(avgTodayTotal)}" data-avg-route="${formatDuration(avgTodayRoute)}" data-tip="Clique para detalhar os dois tipos de atraso e os riscos do dia.">
        <div class="console-title"><span>VELOCIDADE E SLA</span><strong>hoje</strong></div>
        <div class="pulse-metrics">
          <div data-tip="Tempo médio da entrada até a finalização no cliente."><small>Ciclo completo</small><strong>${formatDuration(avgTodayTotal)}</strong></div>
          <div data-tip="Tempo médio entre a saída da loja e a chegada ao cliente."><small>Em rota</small><strong>${formatDuration(avgTodayRoute)}</strong></div>
          <div data-tip="Quilômetros registrados em expedientes encerrados hoje."><small>Rodagem</small><strong>${todayKm.toFixed(1)} km</strong></div>
          <div data-tip="Entregas finalizadas divididas pelas registradas hoje."><small>Conclusão</small><strong>${completionPctToday}%</strong></div>
        </div>
      </article>
      <article class="ops-finance-console" id="opsFinanceConsole" role="button" tabindex="0" data-fees="${todayFees}" data-refunds="${todayRefunds}" data-costs="${todayCosts}" data-result="${todayResult}" data-tip="Visão financeira operacional somente com lançamentos reais de hoje. Clique para detalhar.">
        <div class="console-title"><span>RESULTADO DO DIA</span><strong class="${todayResult < 0 ? 'negative' : ''}">${money(todayResult)}</strong></div>
        <div class="finance-line"><span>Taxas</span><b>${money(todayFees)}</b></div>
        <div class="finance-line"><span>Reembolsos</span><b>− ${money(todayRefunds)}</b></div>
        <div class="finance-line"><span>Custos</span><b>− ${money(todayCosts)}</b></div>
      </article>
    </section>

    <div class="attention-grid sla-attention-grid">
      <button data-central-filter="atraso_inicio" class="attention-card ${startLateRows.length ? 'critical' : ''}" data-tip="Compras que não saíram em até 2 horas da entrada, incluindo atrasos históricos já realizados."><span>↗</span><div><small>ATRASO DE SAÍDA</small><strong data-count="${startLateRows.length}">0</strong><em>limite: 2 horas</em></div></button>
      <button data-central-filter="atraso_chegada" class="attention-card ${arrivalLateRows.length ? 'critical' : ''}" data-tip="Entregas que não chegaram à casa do cliente em até 3 horas e 30 minutos da entrada."><span>⌂</span><div><small>ATRASO DE CHEGADA</small><strong data-count="${arrivalLateRows.length}">0</strong><em>limite: 3h30</em></div></button>
      <button data-central-filter="risco_sla" class="attention-card ${startRiskRows.length+arrivalRiskRows.length ? 'risk-card' : ''}" data-tip="Entregas a menos de 30 minutos de estourar o limite de saída ou chegada."><span>◷</span><div><small>RISCO NOS PRÓX. 30 MIN</small><strong data-count="${startRiskRows.length+arrivalRiskRows.length}">0</strong><em>agir preventivamente</em></div></button>
      <button data-central-filter="alta" class="attention-card" data-tip="Prioridades altas ainda abertas."><span>★</span><div><small>PRIORIDADE ALTA</small><strong data-count="${prioritarias.length}">0</strong><em>na fila operacional</em></div></button>
      <button data-central-action="close-cycle" class="attention-card" data-tip="Ciclos atualmente em andamento."><span>↻</span><div><small>CICLOS ATIVOS</small><strong data-count="${openCycles.length}">0</strong><em>recursos ocupados</em></div></button>
      <button data-central-action="km" class="attention-card" data-tip="Expedientes abertos que ainda precisam do KM final."><span>⌁</span><div><small>KM FINAL PENDENTE</small><strong data-count="${kmPendente}">0</strong><em>fechar expediente</em></div></button>
    </div>

    <section class="capacity-command" id="capacityCommand" role="button" tabindex="0" data-tip="Capacidade estimada usando apenas a média real de entregas dos ciclos fechados.">
      <div class="capacity-copy"><span>CAPACIDADE DA PRÓXIMA SAÍDA</span><h2>${nextWaveCapacity == null ? 'Aguardando histórico de ciclos' : `${nextWaveCapacity} entrega(s) estimadas`}</h2><p>${availableReadyVehicles} veículo(s) com KM liberado e disponível · ${naLoja.length} entrega(s) na fila</p></div>
      <div class="capacity-metrics">
        <div><small>Veículos disponíveis</small><strong>${availableReadyVehicles}</strong></div>
        <div><small>Média por ciclo</small><strong>${avgCycleLoad == null ? '—' : avgCycleLoad.toFixed(1)}</strong></div>
        <div class="${nextWaveCapacity!=null&&naLoja.length>nextWaveCapacity?'pressure':''}"><small>Fila além da capacidade</small><strong>${nextWaveCapacity == null ? '—' : Math.max(0,naLoja.length-nextWaveCapacity)}</strong></div>
        <div><small>Previsão de amanhã</small><strong>${tomorrowForecast == null ? '—' : tomorrowForecast.toFixed(1)}</strong></div>
      </div>
      <b>›</b>
    </section>

    <section class="operation-launcher">
      <div class="section-heading"><div><span>COMANDOS RÁPIDOS</span><h2>Toda a operação em um só lugar</h2></div><div class="heading-signal"><i></i>Atualização automática</div></div>
      <div class="command-dock">
        <button class="primary-command" id="qaNewDelivery" data-tip="Cadastrar uma nova compra e colocá-la na fila."><span class="cmd-ico">🛒</span><strong>Nova entrega</strong></button>
        <button id="qaStartCycle" data-tip="Pergunta a hora exata de saída antes de confirmar o início."><span class="cmd-ico">🚚</span><strong>Iniciar ciclo</strong></button>
        <button id="qaArrival" data-tip="Registrar a hora exata em que chegou na casa do cliente."><span class="cmd-ico">📍</span><strong>Chegou no cliente</strong></button>
        <button id="qaReturn" data-tip="Registrar quando uma entrega retornou à loja, o motivo e a próxima tentativa."><span class="cmd-ico">↩︎</span><strong>Entrega retornou</strong></button>
        <button id="qaCloseCycle" data-tip="Resolve pendências e pergunta a hora exata antes de confirmar o fim."><span class="cmd-ico">✅</span><strong>Finalizar ciclo</strong></button>
        <button id="qaKm" data-tip="Registrar KM inicial ou final."><span class="cmd-ico">🛣️</span><strong>KM do dia</strong></button>
        <button id="qaCost" data-tip="Lançar custo operacional."><span class="cmd-ico">💰</span><strong>Custo</strong></button>
        <button id="qaCloseDay" data-tip="Confere ciclos, entregas, KM e custos antes de registrar o fechamento do dia."><span class="cmd-ico">🗓️</span><strong>Fechar dia</strong></button>
      </div>
    </section>

    <div class="operation-panels">
      <section class="ops-panel">
        <div class="panel-head"><div><span class="live-mini"></span><strong>Ciclos em andamento</strong></div><button class="text-action" id="panelStartCycle">＋ Novo ciclo</button></div>
        ${openCycles.length ? openCycles.map((c) => `<div class="ops-line cycle-live-line" data-tip="Saída confirmada às ${timeBR(c.startedAt)} · duração até agora ${formatDuration((Date.now()-new Date(c.startedAt))/60000)}"><div><strong>${escapeHtml(vName(c.vehicleId))}</strong><small>${escapeHtml(dName(c.driverId))} · saída ${timeBR(c.startedAt)} · ${formatDuration((Date.now()-new Date(c.startedAt))/60000)}</small></div><button class="btn-ghost btn-small central-cycle-close" data-id="${c.id}">Finalizar</button></div>`).join('') : '<div class="panel-empty">Nenhum ciclo aberto agora.</div>'}
      </section>
      <section class="ops-panel">
        <div class="panel-head"><div><span class="live-mini ${kmPendente ? 'warning' : ''}"></span><strong>Expedientes de KM</strong></div><button class="text-action" id="panelKmStart">＋ Iniciar</button></div>
        ${pendingKmLogs.length ? pendingKmLogs.map((l) => `<div class="ops-line"><div><strong>${escapeHtml(vName(l.vehicleId))}</strong><small>KM inicial ${l.kmStart} · ${dateBR(l.shiftDate)}</small></div><button class="btn-ghost btn-small central-km-close" data-id="${l.id}">KM final</button></div>`).join('') : '<div class="panel-empty">Todos os expedientes estão fechados.</div>'}
        ${closedTodayKmLogs.length ? `<div class="km-correction-strip"><small>KM foi finalizado antes da hora?</small>${closedTodayKmLogs.map((l)=>`<button class="btn-ghost btn-small central-km-reopen" data-id="${l.id}">↺ Corrigir ${escapeHtml(vName(l.vehicleId))}</button>`).join('')}</div>` : ''}
      </section>
    </div>

    <section class="live-board-section">
      <div class="section-heading"><div><span>MAPA OPERACIONAL</span><h2>Onde cada entrega está agora</h2></div><div class="section-heading-actions"><button type="button" class="numbering-repair-btn" id="recalculateDayNumbersBtn">↻ Recalcular numeração</button><div class="heading-signal"><i></i>dados reais</div></div></div>
      <div class="live-board live-board-5">
        ${[['Na loja',naLoja],['Em rota',rows.filter(r=>r.status==='em_rota')],['No cliente',noCliente],['Agendadas',agendadas],['Ocorrências',rows.filter(r=>['retorno','reentrega','cancelada'].includes(r.status))]].map(([label,list]) => `<div class="live-lane"><header><strong>${label}</strong><span>${list.length}</span></header><div>${list.slice(0,5).map(liveLaneCard).join('') || '<p class="lane-empty">Nenhuma entrega</p>'}</div></div>`).join('')}
      </div>
    </section>

    <div class="queue-heading"><div><span>FILA OPERACIONAL</span><h2>Entregas que exigem acompanhamento</h2></div><label class="central-search">⌕<input id="centralQueueSearch" placeholder="Buscar compra, cupom, PDV, DOC ou cliente" /></label></div>
    ${await miniList([...agendadas, ...naLoja, ...emRota])}
  `;
}

async function miniList(rows) {
  if (!rows.length) return `<div class="empty-state"><strong>Nada por aqui agora</strong>As entregas agendadas, na loja e em rota aparecem nesta lista.</div>`;
  const trs = rows.slice(0, 30).map((r) => {
    const sla = deliverySla(r);
    return `
    <tr data-id="${r.id}" class="row-click" data-status="${r.status}" data-priority="${r.priority}" data-late-start="${sla.startLate}" data-late-arrival="${sla.arrivalLate}" data-risk-sla="${sla.startRisk||sla.arrivalRisk}" data-search="${escapeHtml([r.purchaseNumber, r.coupon, r.pdv, r.doc, r.clientName, r.street].join(' ').toLowerCase())}" data-tip="Compra #${r.purchaseNumber} · ${escapeHtml(r.clientName || 'Cliente sem nome')} · Cupom ${escapeHtml(r.coupon || 'não informado')} · PDV ${escapeHtml(r.pdv || '—')} · DOC ${escapeHtml(r.doc || '—')} · Saída limite ${timeBR(sla.startDeadline)} · Chegada limite ${timeBR(sla.arrivalDeadline)} · Saída real ${timeBR(r.leftStoreAt)} · Chegada real ${timeBR(r.clientArrivalAt)} · Finalização ${timeBR(r.deliveredAt)}">
      <td><strong>#${r.purchaseNumber}</strong></td>
      <td>${escapeHtml(r.clientName || 'Sem nome')}<br><span style="color:var(--text-muted);font-size:11px">${escapeHtml(r.street || '')}</span></td>
      <td><strong>${escapeHtml(r.coupon || '—')}</strong><br><span style="color:var(--text-muted);font-size:11px">PDV ${escapeHtml(r.pdv || '—')} · DOC ${escapeHtml(r.doc || '—')}</span></td>
      <td>${badge(r.status)}${sla.startLate?'<span class="badge problema sla-mini-badge">Saída atrasada</span>':''}${sla.arrivalLate?'<span class="badge problema sla-mini-badge">Chegada atrasada</span>':''}${sla.startRisk||sla.arrivalRisk?'<span class="badge pendente sla-mini-badge">Perto do limite</span>':''}<br><span class="delivery-times">Limites: saída ${timeBR(sla.startDeadline)} · chegada ${timeBR(sla.arrivalDeadline)}</span></td>
      <td>${r.priority === 'alta' ? '<span class="badge problema">Alta</span>' : '—'}</td>
      <td>${money(r.deliveryFee)}</td>
      <td>${r.status === 'em_rota' ? `<div class="queue-actions"><button class="btn-primary btn-small arrival-row-btn" data-id="${r.id}">Chegou</button><button class="btn-ghost btn-small return-row-btn" data-id="${r.id}">Retornou</button></div>` : r.status === 'no_cliente' ? `<div class="queue-actions"><button class="btn-primary btn-small completion-row-btn" data-id="${r.id}">Finalizar</button><button class="btn-ghost btn-small return-row-btn" data-id="${r.id}">Retornou</button></div>` : '<span style="color:var(--text-muted)">—</span>'}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap central-queue"><table><thead><tr><th>Compra</th><th>Cliente / endereço</th><th>Cupom / documento</th><th>Status</th><th>Prioridade</th><th>Taxa</th><th>Ação rápida</th></tr></thead><tbody>${trs}</tbody></table><div class="queue-no-result hidden" id="queueNoResult">Nenhuma entrega corresponde a esse filtro.</div></div>`;
}

let _phraseTimer = null;
let _waveTimer = null;
let _nameTimer = null;

async function openRecalculateDayNumbersModal() {
  const env = getEnv();
  const today = localDateKey();
  openModal({
    title: 'Recalcular numeração do dia',
    subtitle: 'Corrige números antigos usando somente a ordem de cadastro no sistema. A hora da compra não interfere.',
    body: `<form id="recalculateNumberingForm" class="recalculate-numbering-form">
      <label>Data a corrigir *<input type="date" name="operationDate" value="${today}" required /></label>
      <div class="numbering-rule-card">
        <span>↻</span>
        <div><strong>Regra da sequência</strong><p>A numeração segue exclusivamente a ordem em que cada entrega normal foi cadastrada no sistema para a data escolhida. A hora informada da compra não é usada. Ex.: se #10 já existia e uma entrega antiga é cadastrada depois, ela será #11. As agendadas mantêm seus números.</p></div>
      </div>
    </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Corrigir todos os dias', kind: 'ghost', onClick: async () => {
        const result = await repairNormalPurchaseNumbers({
          environment: env,
          reason: 'Recálculo manual global da sequência diária pela ordem de cadastro no sistema; hora da compra ignorada',
        });
        closeModal();
        toast(result.changed ? `${result.changed} entrega(s) antiga(s) corrigida(s) em ${result.days.length} dia(s).` : 'Todas as datas já estão com a numeração correta.', 'success');
        refreshApp();
      }},
      { label: 'Recalcular este dia', kind: 'primary', onClick: async () => {
        const form = $('#recalculateNumberingForm');
        if (!form?.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const selectedDay = fd.operationDate;
        const rows = await Deliveries.active(env);
        const hasNormals = rows.some((r) => r.type !== 'agendada' && localDateKey(r.entryTime) === selectedDay);
        if (!hasNormals) {
          toast('Não há entregas normais nessa data para renumerar.', 'error');
          return;
        }
        const result = await repairNormalPurchaseNumbers({
          environment: env,
          selectedDay,
          reason: 'Recálculo manual da sequência diária pela ordem de cadastro no sistema; hora da compra ignorada',
        });
        closeModal();
        toast(result.changed ? `${result.changed} entrega(s) renumerada(s) em ${dateBR(selectedDay)}.` : 'A numeração deste dia já estava correta.', 'success');
        refreshApp();
      }},
    ],
  });
}

export function wireCentralEvents() {
  $$('.row-click').forEach((tr) => tr.addEventListener('click', async () => {
    const rec = await Deliveries.get(tr.dataset.id);
    if (rec) openDeliveryModal(rec);
  }));
  $$('.live-delivery-card').forEach((card) => {
    const open = async () => { const record = await Deliveries.get(card.dataset.deliveryId); if (record) openDeliveryModal(record); };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); open(); } });
  });
  $('#qaNewDelivery')?.addEventListener('click', () => openDeliveryModal());
  $('#recalculateDayNumbersBtn')?.addEventListener('click', () => openRecalculateDayNumbersModal());
  $('#qaStartCycle')?.addEventListener('click', () => openStartCycleModal());
  $('#qaArrival')?.addEventListener('click', () => openArrivalPicker());
  $('#qaReturn')?.addEventListener('click', () => openReturnPicker());
  $('#returnSpotlightBtn')?.addEventListener('click', () => openReturnPicker());
  $('#qaKm')?.addEventListener('click', () => openKmStartModal());
  $('#qaCost')?.addEventListener('click', () => openCostModal());
  $('#qaCloseDay')?.addEventListener('click', () => openDayCloseAssistant());
  $('#heroKmAction')?.addEventListener('click', async (e) => {
    if (Number(e.currentTarget.dataset.missing || 0) > 0) return openKmStartModal();
    const today = localDateKey();
    const openLogs = (await OdometerLogs.all()).filter((l) => l.environment === getEnv() && l.shiftDate === today && l.kmStart != null && l.kmEnd == null);
    if (openLogs.length) return openKmPicker(openLogs);
    toast('Não há veículo liberado: os expedientes de hoje já foram encerrados.', 'error');
  });
  $('#heroQueueAction')?.addEventListener('click', () => $('.queue-heading')?.scrollIntoView({ behavior:'smooth', block:'start' }));
  $('#heroCycleAction')?.addEventListener('click', () => openStartCycleModal());
  $('#performanceExplainBtn')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const completion = Number(btn.dataset.completion || 0), punctualityScore = Number(btn.dataset.punctuality || 0), qualityScore = Number(btn.dataset.quality || 0);
    openModal({
      title:'Como o desempenho é calculado?',
      subtitle:'O termômetro transforma os dados reais do dia em prioridades de ação.',
      body:`<div class="performance-breakdown">
        <div><span>Conclusão · peso 65%</span><strong>${completion}%</strong><i><b style="width:${completion}%"></b></i><small>Finalizar as entregas com os horários corretos tem o maior impacto.</small></div>
        <div><span>Pontualidade · peso 20%</span><strong>${punctualityScore}%</strong><i><b style="width:${punctualityScore}%"></b></i><small>Cumprir os limites de saída em 2h e chegada ao cliente em 3h30.</small></div>
        <div><span>Qualidade · peso 15%</span><strong>${qualityScore}%</strong><i><b style="width:${qualityScore}%"></b></i><small>Reduzir retornos, reentregas e cancelamentos melhora este componente.</small></div>
      </div>`,
      actions:[{label:'Entendi',kind:'primary',onClick:closeModal}],
    });
  });
  const activateCard = (selector, action) => {
    const card = $(selector); if (!card) return;
    card.addEventListener('click', action);
    card.addEventListener('keydown', (e) => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); action(); } });
  };
  activateCard('#opsScoreConsole', () => $('#performanceExplainBtn')?.click());
  activateCard('#opsSlaConsole', () => {
    const card=$('#opsSlaConsole');
    openCentralInsightDrawer('Tempos e SLA de hoje',`<div class="drawer-kpi-grid"><div><small>Atraso de saída</small><strong>${card.dataset.startLate}</strong><span>limite 2 horas</span></div><div><small>Atraso de chegada</small><strong>${card.dataset.arrivalLate}</strong><span>limite 3h30</span></div><div><small>Perto do limite</small><strong>${card.dataset.risk}</strong><span>aviso 30 min antes</span></div><div><small>Tempo completo médio</small><strong>${card.dataset.avgTotal}</strong><span>entrada até finalização</span></div></div><button class="btn-primary drawer-nav-dashboard">Investigar no Centro de Inteligência</button>`);
    $('.drawer-nav-dashboard')?.addEventListener('click',()=>{closeCentralInsightDrawer();document.querySelector('[data-view="dashboard"]')?.click();});
  });
  activateCard('#opsFinanceConsole', () => {
    const card=$('#opsFinanceConsole');
    openCentralInsightDrawer('Resultado financeiro de hoje',`<div class="drawer-finance"><p><span>Taxas</span><strong>${money(card.dataset.fees)}</strong></p><p><span>Reembolsos</span><strong>− ${money(card.dataset.refunds)}</strong></p><p><span>Custos</span><strong>− ${money(card.dataset.costs)}</strong></p><p class="total"><span>Resultado</span><strong>${money(card.dataset.result)}</strong></p></div><button class="btn-primary drawer-nav-costs">Abrir custos e financeiro</button>`);
    $('.drawer-nav-costs')?.addEventListener('click',()=>{closeCentralInsightDrawer();document.querySelector('[data-view="costs"]')?.click();});
  });
  activateCard('#capacityCommand', () => {
    openCentralInsightDrawer('Capacidade da próxima saída',`<p class="drawer-lead">A estimativa usa a média real de entregas dos ciclos fechados e somente veículos com KM inicial aberto e sem ciclo ativo.</p><div class="drawer-kpi-grid">${$$('#capacityCommand .capacity-metrics > div').map((el)=>`<div>${el.innerHTML}</div>`).join('')}</div><button class="btn-primary drawer-start-cycle">Formar próximo ciclo</button>`);
    $('.drawer-start-cycle')?.addEventListener('click',()=>{closeCentralInsightDrawer();openStartCycleModal();});
  });
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
  $$('.central-km-reopen').forEach((btn) => btn.addEventListener('click', async () => {
    const log = await OdometerLogs.get(btn.dataset.id);
    if (log) openKmReopenModal(log);
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
  $$('.return-row-btn').forEach((btn) => btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const record = await Deliveries.get(btn.dataset.id);
    if (!record) return;
    const cycle = record.cycleId ? await Cycles.get(record.cycleId) : null;
    openReturnResolutionFlow(record, { cycle: cycle?.status === 'aberto' ? cycle : null });
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
    if (value === 'finalizada') return window.__orbitaGoToSearch?.('finalizada');
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

function closeCentralInsightDrawer() {
  document.querySelector('.central-drawer-wrap')?.remove();
}

function openCentralInsightDrawer(title, body) {
  closeCentralInsightDrawer();
  const wrap=document.createElement('div');
  wrap.className='central-drawer-wrap';
  wrap.innerHTML=`<button class="central-drawer-backdrop" aria-label="Fechar painel"></button><aside class="central-insight-drawer" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><header><div><span>DETALHAMENTO</span><h2>${escapeHtml(title)}</h2></div><button class="drawer-close" aria-label="Fechar">×</button></header><div class="drawer-body">${body}</div></aside>`;
  document.body.appendChild(wrap);
  wrap.querySelector('.central-drawer-backdrop')?.addEventListener('click',closeCentralInsightDrawer);
  wrap.querySelector('.drawer-close')?.addEventListener('click',closeCentralInsightDrawer);
  wrap.querySelector('.drawer-close')?.focus();
}

async function openDayCloseAssistant() {
  if(!canPerform('day_close'))return toast('Somente Líder ou Administrador pode fechar o dia.','error');
  const env=getEnv(), today=localDateKey();
  const [rows,cycles,logs,costs,closures]=await Promise.all([Deliveries.active(env),Cycles.all(),OdometerLogs.all(),Costs.all(),DayClosures.all()]);
  const openCycles=cycles.filter((c)=>c.environment===env&&c.status==='aberto'&&!c.deletedAt);
  const pending=rows.filter((r)=>['na_loja','em_rota','no_cliente'].includes(r.status));
  const openKm=logs.filter((l)=>l.environment===env&&l.shiftDate===today&&l.kmStart!=null&&l.kmEnd==null);
  const timeIssues=rows.filter((r)=>r.status==='finalizada'&&(!r.clientArrivalAt||!r.deliveredAt));
  const todayCosts=costs.filter((c)=>c.environment===env&&!c.deletedAt&&c.date===today);
  const existing=closures.find((c)=>c.environment===env&&c.date===today&&!c.superseded);
  const blockers=openCycles.length+pending.length+openKm.length+timeIssues.length;
  const check=(ok)=>ok?'<i class="check-ok">✓</i>':'<i class="check-bad">!</i>';
  openModal({
    title:'Fechamento guiado do dia',
    subtitle:existing?`Dia já fechado por ${existing.closedBy||'operador'} às ${timeBR(existing.closedAt)}.`:'Confira cada etapa antes de registrar o encerramento.',
    body:`<div class="day-close-checklist">
      <button type="button" id="dayCloseCycles">${check(!openCycles.length)}<span><strong>Ciclos encerrados</strong><small>${openCycles.length} ciclo(s) aberto(s)</small></span><b>›</b></button>
      <button type="button" id="dayCloseDeliveries">${check(!pending.length)}<span><strong>Entregas resolvidas</strong><small>${pending.length} pendência(s) operacional(is)</small></span><b>›</b></button>
      <button type="button" id="dayCloseKm">${check(!openKm.length)}<span><strong>KM final informado</strong><small>${openKm.length} expediente(s) aberto(s)</small></span><b>›</b></button>
      <button type="button" id="dayCloseTimes">${check(!timeIssues.length)}<span><strong>Horários completos</strong><small>${timeIssues.length} inconsistência(s)</small></span><b>›</b></button>
      <div class="day-close-cost"><span>R$</span><div><strong>Custos lançados hoje</strong><small>${todayCosts.length} lançamento(s) · ${money(todayCosts.reduce((s,c)=>s+Number(c.amount||0),0))}</small></div><button type="button" id="dayCloseCosts">Revisar</button></div>
    </div>
    <form id="dayCloseConfirmForm"><label class="check-line"><input type="checkbox" name="costsReviewed" required ${existing?'checked disabled':''}/> Confirmo que os custos e ocorrências do dia foram revisados.</label></form>
    ${blockers?`<div class="day-close-warning">Existem ${blockers} bloqueio(s). Resolva todos antes de fechar o dia.</div>`:'<div class="day-close-ready">Tudo certo: o dia está pronto para ser encerrado.</div>'}`,
    actions:[
      {label:'Cancelar',kind:'ghost',onClick:closeModal},
      {label:existing?'Dia já fechado':'Confirmar fechamento',kind:'primary',onClick:async()=>{
        if(existing)return toast('O fechamento de hoje já está registrado.','success');
        if(blockers)return toast('Fechamento bloqueado: ainda existem pendências.','error');
        const form=$('#dayCloseConfirmForm');if(!form.reportValidity())return;
        const duplicate=(await DayClosures.all()).some((c)=>c.environment===env&&c.date===today&&!c.superseded);
        if(duplicate)return toast('O fechamento de hoje já foi registrado.','error');
        await DayClosures.add({environment:env,date:today,closedAt:new Date().toISOString(),closedBy:getOperatorName(),costsReviewed:true,summary:{deliveries:rows.filter(r=>isSameLocalDay(r.entryTime,today)).length,costs:todayCosts.length}});
        toast('Dia encerrado e registrado na auditoria.','success');closeModal();refreshApp();
      }},
    ],
  });
  $('#dayCloseCycles')?.addEventListener('click',()=>{if(openCycles.length===1)return openCloseCycleModal(openCycles[0]);if(openCycles.length>1)return openCyclePicker(openCycles);toast('Todos os ciclos estão fechados.','success');});
  $('#dayCloseDeliveries')?.addEventListener('click',()=>{closeModal();$('.queue-heading')?.scrollIntoView({behavior:'smooth',block:'start'});});
  $('#dayCloseKm')?.addEventListener('click',()=>{if(openKm.length===1)return openKmEndModal(openKm[0]);if(openKm.length>1)return openKmPicker(openKm);toast('Todos os KM finais foram registrados.','success');});
  $('#dayCloseTimes')?.addEventListener('click',()=>{if(timeIssues[0])return openDeliveryModal(timeIssues[0]);toast('Todos os horários estão completos.','success');});
  $('#dayCloseCosts')?.addEventListener('click',()=>{closeModal();document.querySelector('[data-view="costs"]')?.click();});
}

function isSameLocalDay(value,dayKey){return localDateKey(value)===dayKey;}

function applyCentralFilter(value) {
  const q = String(value || '').trim().toLowerCase();
  const rows = $$('.central-queue tbody tr');
  let visible = 0;
  rows.forEach((row) => {
    const matches = !q
      || (q === 'atrasada' && (row.dataset.lateStart === 'true' || row.dataset.lateArrival === 'true'))
      || (q === 'atraso_inicio' && row.dataset.lateStart === 'true')
      || (q === 'atraso_chegada' && row.dataset.lateArrival === 'true')
      || (q === 'risco_sla' && row.dataset.riskSla === 'true')
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

async function openReturnPicker() {
  const rows = (await Deliveries.active(getEnv())).filter((r) => ['em_rota', 'no_cliente'].includes(r.status));
  if (!rows.length) {
    return openModal({
      title: 'Registrar retorno à loja',
      subtitle: 'A função está ativa, mas não existe uma entrega elegível neste momento.',
      body: `<div class="return-empty-guide"><span>↩</span><div><strong>Quando esta função fica disponível?</strong><p>A entrega precisa ter saído em um ciclo e estar com o status <b>Em rota</b> ou <b>Na casa do cliente</b>. Depois disso, ela aparecerá aqui automaticamente.</p></div></div><div class="return-guide-steps"><div><i>1</i><span>Inicie o ciclo</span></div><b>›</b><div><i>2</i><span>Entrega não concluída</span></div><b>›</b><div><i>3</i><span>Registrar retorno</span></div></div><p class="return-guide-note">Você também verá a pergunta obrigatória ao clicar em <b>Finalizar ciclo</b> enquanto existir entrega sem os horários completos no cliente.</p>`,
      actions: [{ label: 'Entendi', kind: 'primary', onClick: closeModal }],
    });
  }
  if (rows.length === 1) {
    const cycle = rows[0].cycleId ? await Cycles.get(rows[0].cycleId) : null;
    return openReturnResolutionFlow(rows[0], { cycle: cycle?.status === 'aberto' ? cycle : null });
  }
  openModal({
    title: 'Qual entrega retornou à loja?',
    subtitle: 'Escolha a entrega para registrar horário, motivo e nova tentativa.',
    body: `<div class="picker-list">${rows.map((r) => `<button class="picker-row return-picker-row" data-id="${r.id}"><strong>#${r.purchaseNumber} · ${escapeHtml(r.clientName || r.street || 'Sem nome')}</strong><span>${STATUS_META[r.status]?.label || r.status} · Cupom ${escapeHtml(r.coupon || '—')} · saída ${timeBR(r.leftStoreAt)}</span></button>`).join('')}</div>`,
    actions: [{ label: 'Cancelar', kind: 'ghost', onClick: closeModal }],
  });
  $$('.return-picker-row').forEach((btn) => btn.addEventListener('click', async () => {
    const record = await Deliveries.get(btn.dataset.id);
    if (!record) return;
    const cycle = record.cycleId ? await Cycles.get(record.cycleId) : null;
    openReturnResolutionFlow(record, { cycle: cycle?.status === 'aberto' ? cycle : null });
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

function localDateKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
  const readOnly=!canPerform('delivery_edit');
  if(!record&&readOnly)return toast('Seu perfil não pode cadastrar entregas.','error');
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
      <div class="field-row field-row-date-time">
        <label>Data da entrega *
          <input type="date" name="operationDate" required value="${record ? localDateKey(record.entryTime) : localDateKey()}" />
        </label>
        <label>Hora de entrada *
          <input type="time" name="entryTimeOnly" required value="${record ? new Date(record.entryTime).toTimeString().slice(0,5) : new Date().toTimeString().slice(0,5)}" />
        </label>
        <small class="field-row-help">Informe a data real da compra, mesmo que esteja lançando no sistema em outro dia.${record ? ' Se alterar a data, a numeração será recalculada para o dia escolhido.' : ''}</small>
      </div>
      <label>PDV/Caixa *<input name="pdv" required value="${escapeHtml(record?.pdv || '')}" /></label>
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

  const statusActions = isEdit && !readOnly ? deliveryStatusActionsHtml(record) : '';

  openModal({
    title: isEdit ? `Editar entrega #${record.purchaseNumber}` : 'Registrar entrega',
    subtitle: isEdit ? `Status atual: ${STATUS_META[record.status]?.label}` : 'Preencha os campos obrigatórios (*)',
    body: body + statusActions,
    actions: readOnly ? [{label:'Fechar',kind:'ghost',onClick:closeModal}] : isEdit
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
  if (record.status === 'na_loja') buttons.push('<button type="button" class="btn-ghost btn-small" data-action="formar_ciclo">Adicionar em um ciclo</button>');
  if (record.status === 'em_rota') {
    buttons.push('<button type="button" class="btn-ghost btn-small" data-action="chegou_cliente">Chegou ao cliente</button>');
    buttons.push('<button type="button" class="btn-primary btn-small" data-action="finalizada">Finalizar na casa do cliente</button>');
    buttons.push('<button type="button" class="btn-ghost btn-small" data-action="retorno">Registrar retorno à loja</button>');
    buttons.push('<button type="button" class="btn-ghost btn-small" data-action="retirada">Retirada na loja</button>');
  }
  if (record.status === 'no_cliente') {
    buttons.push('<button type="button" class="btn-primary btn-small" data-action="finalizada">Finalizar na casa do cliente</button>');
    buttons.push('<button type="button" class="btn-ghost btn-small" data-action="retorno">Registrar retorno à loja</button>');
  }
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
      if (action === 'formar_ciclo') { closeModal(); openStartCycleModal(); }
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
  const [opYear, opMonth, opDay] = String(fd.operationDate || localDateKey()).split('-').map(Number);
  const entryTime = new Date(opYear, (opMonth || 1) - 1, opDay || 1, Number(hh), Number(mm), 0, 0);
  if (Number.isNaN(entryTime.getTime())) return toast('Informe uma data e hora válidas para a entrega.', 'error');

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
    if (payload.leftStoreAt && !record.leftStoreAt && !record.cycleId) return toast('A saída da loja só pode ser criada ao iniciar um ciclo com KM inicial liberado.', 'error');
    if (payload.clientArrivalAt && payload.deliveredAt && new Date(payload.deliveredAt) < new Date(payload.clientArrivalAt)) return toast('A finalização não pode ser anterior à chegada no cliente.', 'error');
    if (record.status === 'finalizada' && !payload.deliveredAt) return toast('Uma entrega finalizada precisa ter a hora de finalização na casa do cliente.', 'error');
  }

  try {
    if (record) {
      const previousOperationDay = localDateKey(record.entryTime);
      const nextOperationDay = localDateKey(payload.entryTime);
      const typeChanged = record.type !== fd.type;
      const dayChanged = previousOperationDay !== nextOperationDay;
      if (typeChanged || dayChanged) {
        const existingDeliveries = await Deliveries.active(env);
        if (fd.type === 'agendada') {
          payload.purchaseNumber = typeChanged ? nextScheduledPurchaseNumber(existingDeliveries, record.id) : record.purchaseNumber;
        } else {
          payload.purchaseNumber = nextDailyPurchaseNumber(existingDeliveries, payload.entryTime, record.id);
        }
        payload.arrivalNumber = nextArrivalNumber(existingDeliveries, payload.entryTime, record.id);
      }
      await Deliveries.update(record.id, payload);
      const targetStatus = payload.deliveredAt ? 'finalizada' : (payload.clientArrivalAt && record.status === 'em_rota' ? 'no_cliente' : null);
      if (targetStatus && targetStatus !== record.status) await Deliveries.changeStatus(record.id, targetStatus, { note: 'Horários operacionais informados na edição.' });
      toast('Entrega atualizada.', 'success');
    } else {
      const existingDeliveries = await Deliveries.active(env);
      if (fd.type === 'agendada') {
        payload.purchaseNumber = nextScheduledPurchaseNumber(existingDeliveries);
      } else {
        payload.purchaseNumber = nextDailyPurchaseNumber(existingDeliveries, payload.entryTime);
      }
      payload.arrivalNumber = nextArrivalNumber(existingDeliveries, payload.entryTime);
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
  const cycle = record.cycleId ? await Cycles.get(record.cycleId) : null;
  return openReturnResolutionFlow(record, { cycle: cycle?.status === 'aberto' ? cycle : null });
}

async function openReturnResolutionFlow(record, { cycle = null, onBack = null, continueClose = false } = {}) {
  const reasons = (await ReturnReasons.all()).filter((r) => r.active);
  openModal({
    title: 'Registrar retorno à loja',
    subtitle: `Entrega #${record.purchaseNumber} — o ciclo só será liberado depois deste registro.`,
    body: `
      <div class="return-alert"><span>↩</span><div><strong>${record.deliveredAt ? 'Registrar uma ocorrência de retorno à loja' : 'Esta entrega voltou sem ser finalizada no cliente'}</strong><small>Informe quando voltou, por que voltou e se haverá uma nova tentativa.</small></div></div>
      <form id="retornoForm" class="return-resolution-form">
        <label>Quando retornou à loja? *
          <input type="datetime-local" name="returnedAt" required value="${localDateTimeValue(new Date())}" />
        </label>
        <label>Por que retornou? *
          <select name="reasonId" required>
            <option value="">Selecione…</option>
            ${reasons.map((r) => `<option value="${r.id}">${escapeHtml(r.label)}</option>`).join('')}
          </select>
        </label>
        <label>Observação do ocorrido<textarea name="note" rows="2" placeholder="Ex.: número incorreto, cliente não atendeu, mercadoria voltou completa…"></textarea></label>
        <label>Situação da mercadoria *
          <select name="merchandiseSituation" id="returnMerchandiseSelect" required>
            <option value="">Selecione…</option>
            <option value="completa">Voltou completa para a loja</option>
            <option value="parcial">Voltou parcialmente</option>
            <option value="sem_mercadoria">Não havia mercadoria para retornar</option>
          </select>
        </label>
        <label id="returnedItemsWrap" class="hidden">O que retornou e o que foi entregue? *
          <textarea name="returnedItems" rows="2" placeholder="Descreva os itens ou volumes que retornaram e os que ficaram no cliente"></textarea>
        </label>
        <label>Haverá outra tentativa de entrega? *
          <select name="retryPlanned" id="returnRetrySelect" required>
            <option value="">Selecione…</option>
            <option value="sim">Sim, tentar novamente em outro horário</option>
            <option value="nao">Não haverá nova tentativa</option>
          </select>
        </label>
        <label id="returnRetryAtWrap" class="hidden">Quando será a nova tentativa? *
          <input type="datetime-local" name="retryAt" />
        </label>
      </form>`,
    actions: [
      { label: cycle ? 'Voltar à pergunta' : 'Cancelar', kind: 'ghost', onClick: onBack || closeModal },
      { label: 'Confirmar retorno', kind: 'primary', onClick: async () => {
        const form = $('#retornoForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const reason = reasons.find((item) => item.id === fd.reasonId);
        const note = fd.note?.trim() || '';
        if (reason?.label?.toLowerCase().includes('outro') && !note) return toast('Descreva o motivo quando escolher “Outros”.', 'error');
        const returnedAt = new Date(fd.returnedAt).toISOString();
        if (record.leftStoreAt && new Date(returnedAt) < new Date(record.leftStoreAt)) return toast('O retorno não pode ser anterior à saída da loja.', 'error');
        const retryPlanned = fd.retryPlanned === 'sim';
        if (retryPlanned && !fd.retryAt) return toast('Informe quando será a nova tentativa.', 'error');
        const retryAt = retryPlanned ? new Date(fd.retryAt).toISOString() : null;
        if (retryAt && new Date(retryAt) <= new Date(returnedAt)) return toast('A nova tentativa precisa ser posterior ao retorno à loja.', 'error');
        const merchandiseSituation = fd.merchandiseSituation;
        const returnedItems = fd.returnedItems?.trim() || '';
        if (merchandiseSituation === 'parcial' && !returnedItems) return toast('Descreva o que retornou e o que foi entregue.', 'error');
        const attempt = {
          id: `ret_${Date.now().toString(36)}`,
          cycleId: cycle?.id || record.cycleId || null,
          returnedAt, reasonId: fd.reasonId, reasonLabel: reason?.label || '', note,
          merchandiseSituation, returnedItems,
          retryPlanned, retryAt,
          leftStoreAt: record.leftStoreAt || null,
          clientArrivalAt: record.clientArrivalAt || null,
          deliveredAt: record.deliveredAt || null,
          registeredBy: getOperatorName(), registeredAt: new Date().toISOString(),
        };
        const nextStatus = 'na_loja';
        const merchandiseLabel = merchandiseSituation === 'completa' ? 'mercadoria completa' : merchandiseSituation === 'parcial' ? 'retorno parcial' : 'sem mercadoria retornada';
        const historyNote = `${reason?.label || 'Motivo não informado'} · retorno ${timeBR(returnedAt)} · ${merchandiseLabel}${retryPlanned ? ` · nova tentativa ${dateTimeBR(retryAt)}` : ' · sem nova tentativa'}${note ? ` · ${note}` : ''}`;
        await Deliveries.changeStatus(record.id, nextStatus, {
          reasonId: fd.reasonId, note: historyNote,
          returnedAt, returnReasonId: fd.reasonId, returnReasonLabel: reason?.label || '', returnNote: note,
          merchandiseSituation, returnedItems,
          returnAttempts: [...(record.returnAttempts || []), attempt],
          returnRegisteredBy: getOperatorName(), returnRegisteredAt: new Date().toISOString(),
          cycleId: null, vehicleId: null, driverId: null,
          leftStoreAt: null, clientArrivalAt: null, deliveredAt: null,
          retryPlanned, nextAttemptAt: retryAt,
          scheduledAt: record.scheduledAt || null,
          type: record.type || 'hoje',
        });
        toast('Retorno registrado. A entrega voltou para “Na loja” e já está disponível para outro ciclo.', 'success');
        if (cycle && continueClose) return advanceCloseCycle(cycle);
        closeModal(); refreshApp();
      }},
    ],
  });
  $('#returnRetrySelect')?.addEventListener('change', (event) => {
    const retry = event.target.value === 'sim';
    $('#returnRetryAtWrap')?.classList.toggle('hidden', !retry);
    const input = $('#returnRetryAtWrap input');
    if (input) { input.required = retry; if (retry && !input.value) input.value = localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)); }
  });
  $('#returnMerchandiseSelect')?.addEventListener('change', (event) => {
    const partial = event.target.value === 'parcial';
    $('#returnedItemsWrap')?.classList.toggle('hidden', !partial);
    const input = $('#returnedItemsWrap textarea');
    if (input) input.required = partial;
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
    const pending = items.filter((i) => i && !isCycleDeliveryResolved(i, c)).length;
    return `<tr data-id="${c.id}" class="row-click-cycle">
      <td>${dateTimeBR(c.startedAt)}</td>
      <td>${escapeHtml(vName(c.vehicleId))}</td>
      <td>${escapeHtml(dName(c.driverId))}</td>
      <td>${items.length}</td>
      <td>${c.status === 'aberto' ? `<span class="badge transito">Aberto · ${pending} pendente(s)</span>` : `<span class="badge entregue">Fechado</span>`}</td>
      <td>${c.status === 'aberto' ? `<button class="btn-ghost btn-small cycle-close-btn">Finalizar</button><small class="delivery-times">${formatDuration((Date.now()-new Date(c.startedAt))/60000)}</small>` : `${dateTimeBR(c.closedAt)}<small class="delivery-times">${formatDuration((new Date(c.closedAt)-new Date(c.startedAt))/60000)}</small>`}</td>
    </tr>`;
  }));

  return `<div class="table-wrap"><table><thead><tr><th>Início exato</th><th>Veículo</th><th>Entregador</th><th>Entregas</th><th>Status</th><th>Fim exato / duração</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

export function wireCyclesEvents() {
  $$('.cycle-close-btn').forEach((btn) => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('tr').dataset.id;
    const cycle = await Cycles.get(id);
    openCloseCycleModal(cycle);
  }));
}

export async function openStartCycleModal() {
  if(!canPerform('cycle'))return toast('Seu perfil não pode iniciar ciclos.','error');
  const env = getEnv();
  const todayKey = localDateKey();
  const openCycles = (await Cycles.all()).filter((c) => c.environment === env && c.status === 'aberto' && !c.deletedAt);
  const busyVehicles = new Set(openCycles.map((c) => c.vehicleId));
  const busyDrivers = new Set(openCycles.map((c) => c.driverId));
  const allActiveDeliveries = await Deliveries.active(env);
  const deliveryById = new Map(allActiveDeliveries.map((d) => [d.id, d]));
  const busyDeliveryIds = new Set(openCycles.flatMap((c) => (c.deliveryIds || []).filter((id) => {
    const delivery = deliveryById.get(id);
    if (!delivery) return true;
    if (delivery.status === 'na_loja' && !delivery.cycleId) return false;
    const returnedInCycle = (delivery.returnAttempts || []).some((attempt) => attempt.returnedAt && attempt.cycleId === c.id);
    return !(delivery.status === 'na_loja' && returnedInCycle);
  })));

  const vehicles = (await Vehicles.all()).filter((v) => v.active);
  const drivers = (await Drivers.all()).filter((d) => d.active);
  const kmLogs = (await OdometerLogs.all()).filter((l) => l.environment === env && l.shiftDate === todayKey);
  const activeKmByVehicle = new Map(kmLogs.filter((l) => l.kmStart != null && l.kmEnd == null).map((l) => [l.vehicleId, l]));
  const neighborhoods = await Neighborhoods.all();
  const neighOrder = Object.fromEntries(neighborhoods.map((n) => [n.id, n.routeOrder ?? 0]));

  const candidates = allActiveDeliveries
    .filter((d) => !busyDeliveryIds.has(d.id) && ['na_loja', 'programada'].includes(d.status))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === 'alta' ? -1 : 1;
      if (a.status !== b.status) return a.status === 'na_loja' ? -1 : 1;
      if (a.status === 'programada' && b.status === 'programada') {
        return new Date(a.scheduledAt || a.entryTime).getTime() - new Date(b.scheduledAt || b.entryTime).getTime();
      }
      return (neighOrder[a.neighborhoodId] || 0) - (neighOrder[b.neighborhoodId] || 0);
    });

  if (!candidates.length) return toast('Não há entregas disponíveis na loja ou agendadas para formar um ciclo.', 'error');

  const body = `
    <form id="startCycleForm">
      <div class="cycle-time-confirm">
        <div class="cycle-time-icon">↗</div>
        <div>
          <strong>Qual foi a hora exata da saída?</strong>
          <small>Este horário inicia o ciclo e será aplicado como saída da loja em todas as entregas selecionadas.</small>
        </div>
        <label>Início do ciclo *
          <input type="datetime-local" name="startedAt" required value="${localDateTimeValue(new Date())}" />
        </label>
      </div>
      <div class="field-row">
        <label>Veículo *
          <select name="vehicleId" id="cycleVehicleSelect" required>
            <option value="">Selecione…</option>
            ${vehicles.map((v) => {
              const kmReady = activeKmByVehicle.has(v.id);
              const disabled = busyVehicles.has(v.id) || !kmReady;
              const reason = busyVehicles.has(v.id) ? 'em uso' : kmReady ? `KM ${activeKmByVehicle.get(v.id).kmStart} pronto` : kmLogs.some((l)=>l.vehicleId===v.id&&l.kmEnd!=null) ? 'expediente encerrado' : 'KM inicial obrigatório';
              return `<option value="${v.id}" ${disabled ? 'disabled' : ''}>${escapeHtml(v.label)} · ${escapeHtml(reason)}</option>`;
            }).join('')}
          </select>
        </label>
        <label>Entregador *
          <select name="driverId" required>
            <option value="">Selecione…</option>
            ${drivers.map((d) => `<option value="${d.id}" ${busyDrivers.has(d.id) ? 'disabled' : ''}>${escapeHtml(d.name)}${busyDrivers.has(d.id) ? ' (em uso)' : ''}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="cycle-km-gate ${activeKmByVehicle.size ? 'ready' : 'blocked'}" id="cycleKmGate">
        <span>${activeKmByVehicle.size ? '✓' : '!'}</span>
        <div><strong>${activeKmByVehicle.size ? 'Há veículo com KM inicial liberado' : 'Nenhum veículo pode sair ainda'}</strong><small>O ciclo só será confirmado para um veículo com KM inicial registrado hoje e expediente ainda aberto.</small></div>
        <button type="button" class="btn-ghost btn-small" id="cycleRegisterKmBtn">Registrar KM inicial</button>
      </div>
      <label>Entregas do ciclo (ordem sugerida: prioridade e bairro — arraste com os botões)</label><p class="cycle-scheduled-help">As entregas agendadas aparecem nesta lista também. Elas iniciam desmarcadas para evitar saída antecipada; marque a agendada quando ela fizer parte deste ciclo.</p>
      <div id="cycleItemsList" style="display:grid;gap:6px">
        ${candidates.map((d, i) => {
          const scheduled = d.status === 'programada';
          const scheduledLabel = scheduled ? `Agendada ${dateTimeBR(d.scheduledAt || d.entryTime)}` : '';
          return `
          <div class="cycle-item ${scheduled ? 'cycle-item-scheduled' : ''}" data-id="${d.id}">
            <input type="checkbox" ${scheduled ? '' : 'checked'} />
            <div class="cycle-item-copy">
              <div class="cycle-item-title"><strong>#${d.purchaseNumber} · ${escapeHtml(d.clientName || d.street)}</strong>${scheduled ? '<span class="cycle-scheduled-badge">AGENDADA</span>' : ''}</div>
              <div class="cycle-item-meta">${d.priority === 'alta' ? 'Prioridade alta · ' : ''}${escapeHtml(neighborhoods.find(n=>n.id===d.neighborhoodId)?.name || '')}${scheduledLabel ? ` · ${escapeHtml(scheduledLabel)}` : ''}</div>
            </div>
            <button type="button" class="btn-ghost btn-small move-up">↑</button>
            <button type="button" class="btn-ghost btn-small move-down">↓</button>
          </div>`;
        }).join('')}
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
        const currentKmLogs = (await OdometerLogs.all()).filter((l) => l.environment === env && l.shiftDate === todayKey && l.vehicleId === fd.vehicleId && l.kmStart != null && l.kmEnd == null);
        if (!currentKmLogs.length) return toast('Ciclo bloqueado: registre primeiro o KM inicial de hoje para este veículo.', 'error');
        const odometerLog = currentKmLogs[0];
        const startedAt = new Date(fd.startedAt).toISOString();
        const latestEntry = Math.max(...checked.map((id) => new Date(candidates.find((d) => d.id === id)?.entryTime || 0).getTime()));
        if (new Date(startedAt).getTime() < latestEntry) return toast('O início do ciclo não pode ser anterior à entrada de uma entrega selecionada.', 'error');

        const cycle = await Cycles.add({
          environment: env, vehicleId: fd.vehicleId, driverId: fd.driverId,
          status: 'aberto', startedAt, closedAt: null,
          startedAtRegisteredBy: getOperatorName(), startedAtRecordedAt: new Date().toISOString(),
          odometerLogId: odometerLog.id, shiftKmStart: odometerLog.kmStart,
          deliveryIds: checked, deletedAt: null,
        });
        const leftStoreAt = cycle.startedAt;
        for (const id of checked) {
          await Deliveries.changeStatus(id, 'em_rota', { cycleId: cycle.id, vehicleId: fd.vehicleId, driverId: fd.driverId, leftStoreAt, note: `Saída da loja registrada às ${timeBR(leftStoreAt)}.` });
        }
        toast(`Ciclo iniciado às ${timeBR(startedAt)}.`, 'success');
        closeModal();
        refreshApp();
      }},
    ],
  });

  $('#cycleRegisterKmBtn')?.addEventListener('click', () => openKmStartModal());

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
function isCycleDeliveryResolved(delivery, cycle) {
  if (!delivery) return false;
  const returnedInThisCycle = (delivery.returnAttempts || []).some((attempt) => attempt.returnedAt && (!cycle?.id || attempt.cycleId === cycle.id));
  if (returnedInThisCycle) return true;
  if (delivery.status === 'finalizada') return !!delivery.clientArrivalAt && !!delivery.deliveredAt;
  if (delivery.status === 'retirada_loja') return true;
  if (['programada', 'cancelada'].includes(delivery.status)) return true;
  return false;
}

async function unresolvedCycleDeliveries(cycle) {
  const items = await Promise.all((cycle.deliveryIds || []).map((id) => Deliveries.get(id)));
  return items.filter((item) => item && !isCycleDeliveryResolved(item, cycle));
}

export async function openCloseCycleModal(cycle) {
  if(!canPerform('cycle'))return toast('Seu perfil não pode finalizar ciclos.','error');
  const pending = await unresolvedCycleDeliveries(cycle);

  if (!pending.length) {
    return openCycleEndTimeModal(cycle);
  }

  showPendingOne(cycle, pending[0], pending.length);
}

function showPendingOne(cycle, delivery, remainingCount) {
  openModal({
    title: `Finalizar ciclo — ${remainingCount} pendente(s)`,
    subtitle: `Entrega #${delivery.purchaseNumber} · ${escapeHtml(delivery.clientName || delivery.street)}`,
    body: `<div class="cycle-pending-alert"><span>!</span><div><strong>Esta entrega está sem horário de chegada ou finalização no cliente</strong><p>O ciclo permanece bloqueado até você informar o que aconteceu.</p></div></div><div class="cycle-return-question"><span>↩</span><div><strong>Esta entrega voltou? SIM ou NÃO?</strong><small>SIM registra o retorno à loja. NÃO exige chegada e finalização no cliente. Uma pendência por vez.</small></div></div>`,
    actions: [
      { label: 'Sim, voltou', kind: 'ghost', onClick: async () => {
        openReturnResolutionFlow(delivery, { cycle, continueClose: true, onBack: () => showPendingOne(cycle, delivery, remainingCount) });
      }},
      { label: 'Não, foi entregue', kind: 'primary', onClick: async () => {
        openDeliveryCompletionFlow(delivery, { cycle });
      }},
    ],
  });
}

async function advanceCloseCycle(cycle) {
  const pending = await unresolvedCycleDeliveries(cycle);
  if (pending.length) {
    showPendingOne(cycle, pending[0], pending.length);
  } else {
    openCycleEndTimeModal(cycle);
  }
}

async function openCycleEndTimeModal(cycle) {
  const items = await Promise.all((cycle.deliveryIds || []).map((id) => Deliveries.get(id)));
  const unresolved = items.filter((item) => item && !isCycleDeliveryResolved(item, cycle));
  if (unresolved.length) return showPendingOne(cycle, unresolved[0], unresolved.length);
  const returnedCycleItems = items.filter((item) => (item?.returnAttempts || []).some((attempt) => attempt.cycleId === cycle.id));
  const deliveredCycleItems = items.filter((item) => {
    const returnedInCycle = (item?.returnAttempts || []).some((attempt) => attempt.cycleId === cycle.id);
    return !returnedInCycle && item?.status === 'finalizada' && item.clientArrivalAt && item.deliveredAt;
  });
  const retryCycleItems = returnedCycleItems.filter((item) => (item.returnAttempts || []).some((attempt) => attempt.cycleId === cycle.id && attempt.retryPlanned));
  const latestOperationalAt = items.reduce((latest, item) => {
    const cycleReturn = (item?.returnAttempts || []).find((attempt) => attempt.cycleId === cycle.id && attempt.returnedAt);
    const value = cycleReturn?.returnedAt || item?.deliveredAt || item?.clientArrivalAt || item?.leftStoreAt;
    return value && new Date(value) > new Date(latest) ? value : latest;
  }, cycle.startedAt);
  openModal({
    title: 'Confirmar fim do ciclo',
    subtitle: 'A hora exata é obrigatória antes de liberar o veículo e o entregador.',
    body: `
      <form id="cycleEndTimeForm">
        <div class="cycle-time-confirm end-cycle">
          <div class="cycle-time-icon">✓</div>
          <div>
            <strong>Qual foi a hora exata do fim do ciclo?</strong>
            <small>Início registrado: ${dateTimeBR(cycle.startedAt)} · ${items.length} entrega(s) no ciclo.</small>
          </div>
          <label>Fim do ciclo *
            <input type="datetime-local" name="closedAt" required value="${localDateTimeValue(new Date())}" />
          </label>
        </div>
        <div class="cycle-resolution-summary">
          <div><span>✓</span><small>Entregues no cliente</small><strong>${deliveredCycleItems.length}</strong></div>
          <div><span>↩</span><small>Retornaram à loja</small><strong>${returnedCycleItems.length}</strong></div>
          <div><span>↻</span><small>Com nova tentativa</small><strong>${retryCycleItems.length}</strong></div>
          <div><span>☑</span><small>Pendências abertas</small><strong>0</strong></div>
        </div>
        <label>Observação do encerramento<textarea name="closeNote" rows="2" placeholder="Opcional"></textarea></label>
      </form>`,
    actions: [
      { label: 'Voltar', kind: 'ghost', onClick: () => openCloseCycleModal(cycle) },
      { label: 'Confirmar fim do ciclo', kind: 'primary', onClick: async () => {
        const form = $('#cycleEndTimeForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const stillUnresolved = await unresolvedCycleDeliveries(cycle);
        if (stillUnresolved.length) {
          toast('Ciclo bloqueado: ainda existe entrega sem finalização ou retorno completo.', 'error');
          return showPendingOne(cycle, stillUnresolved[0], stillUnresolved.length);
        }
        const closedAt = new Date(fd.closedAt).toISOString();
        if (new Date(closedAt) < new Date(cycle.startedAt)) return toast('O fim do ciclo não pode ser anterior ao início.', 'error');
        if (latestOperationalAt && new Date(closedAt) < new Date(latestOperationalAt)) return toast(`O fim do ciclo não pode ser anterior ao último evento, às ${timeBR(latestOperationalAt)}.`, 'error');
        await Cycles.update(cycle.id, {
          status: 'fechado', closedAt,
          closedAtRegisteredBy: getOperatorName(), closedAtRecordedAt: new Date().toISOString(),
          closeNote: fd.closeNote?.trim() || '',
        });
        toast(`Ciclo encerrado às ${timeBR(closedAt)}. Veículo e entregador liberados.`, 'success');
        closeModal();
        refreshApp();
      }},
    ],
  });
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
      <td>${l.kmEnd != null && l.kmStart != null ? formatKm(Math.max(0, Number(l.kmEnd) - Number(l.kmStart))) : '—'}</td>
      <td><div class="km-actions">
        <button class="btn-ghost btn-small km-edit-all-btn">Editar KM inicial/final</button>
        ${l.kmEnd == null ? '<button class="btn-ghost btn-small km-close-btn">Registrar KM final</button>' : ''}
        ${l.kmEnd != null && l.shiftDate === localDateKey() ? '<button class="btn-ghost btn-small km-reopen-btn">Corrigir fechamento antecipado</button>' : ''}
      </div></td>
    </tr>`).join('');

  return `
    <div class="km-toolbar">
      <button class="btn-primary" id="kmNewBtn">＋ Iniciar expediente</button>
      <div class="km-history-edit-note"><span>✎</span><div><strong>Edição histórica liberada</strong><small>Você pode corrigir o KM inicial e o KM final de qualquer dia. Toda alteração fica registrada na auditoria.</small></div></div>
    </div>
    ${logs.length ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Veículo</th><th>KM inicial</th><th>KM final</th><th>Quilometragem percorrida</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="empty-state"><strong>Nenhum registro de KM</strong>Clique em "Iniciar expediente" para o primeiro veículo do dia.</div>`}
  `;
}

export function wireKmEvents() {
  $('#kmNewBtn')?.addEventListener('click', openKmStartModal);
  $$('.km-edit-all-btn').forEach((btn) => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('tr').dataset.id;
    const log = await OdometerLogs.get(id);
    openKmFullEditModal(log);
  }));
  $$('.km-close-btn').forEach((btn) => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('tr').dataset.id;
    const log = await OdometerLogs.get(id);
    openKmEndModal(log);
  }));
  $$('.km-reopen-btn').forEach((btn) => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('tr').dataset.id;
    const log = await OdometerLogs.get(id);
    openKmReopenModal(log);
  }));
}

async function openKmStartModal() {
  if(!canPerform('km'))return toast('Seu perfil não pode registrar quilometragem.','error');
  const vehicles = (await Vehicles.all()).filter((v) => v.active);
  const todayKey = localDateKey();
  const todayLogs = (await OdometerLogs.all()).filter((l) => l.environment === getEnv() && l.shiftDate === todayKey);
  const alreadyLogged = new Set(todayLogs.map((l) => l.vehicleId));
  const availableVehicles = vehicles.filter((v) => !alreadyLogged.has(v.id));
  if (!availableVehicles.length) {
    const openLogs = todayLogs.filter((l) => l.kmStart != null && l.kmEnd == null);
    if (openLogs.length) return toast('Todos os veículos disponíveis já têm KM inicial registrado hoje.', 'success');
    return toast('Os expedientes de KM de hoje já foram encerrados. Não é permitido abrir outro no mesmo veículo e data.', 'error');
  }
  openModal({
    title: 'Registrar KM inicial do dia',
    subtitle: 'Este registro libera o veículo para iniciar ciclos. Só pode existir um expediente por veículo e dia.',
    body: `
      <form id="kmStartForm">
        <label>Veículo *
          <select name="vehicleId" required>${availableVehicles.map((v) => `<option value="${v.id}">${escapeHtml(v.label)}</option>`).join('')}</select>
        </label>
        <label>KM inicial *<input name="kmStart" type="number" step="0.1" min="0" required /></label>
      </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Salvar', kind: 'primary', onClick: async () => {
        const form = $('#kmStartForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const duplicate = (await OdometerLogs.all()).some((l) => l.environment === getEnv() && l.shiftDate === todayKey && l.vehicleId === fd.vehicleId);
        if (duplicate) return toast('Este veículo já possui registro de KM hoje.', 'error');
        await OdometerLogs.add({ environment: getEnv(), vehicleId: fd.vehicleId, shiftDate: todayKey, kmStart: Number(fd.kmStart), kmEnd: null, startedBy: getOperatorName() });
        toast('KM inicial registrado. Veículo liberado para ciclos.', 'success');
        closeModal(); refreshApp();
      }},
    ],
  });
}

function openKmFullEditModal(log) {
  if (!canPerform('km')) return toast('Seu perfil não pode corrigir quilometragem.', 'error');
  if (!log) return toast('Registro de KM não encontrado.', 'error');
  openModal({
    title: 'Editar KM inicial e final',
    subtitle: `${dateBR(log.shiftDate)} · correção permitida para qualquer data`,
    body: `<form id="kmFullEditForm">
      <div class="km-edit-history-head"><span>✎</span><div><strong>Correção completa de quilometragem</strong><small>Você pode alterar o KM inicial e o KM final deste expediente. O registro original ficará preservado na auditoria.</small></div></div>
      <div class="field-row">
        <label>KM inicial *<input name="kmStart" type="number" step="0.1" min="0" required value="${log.kmStart ?? ''}" /></label>
        <label>KM final ${log.kmEnd != null ? '*' : ''}<input name="kmEnd" type="number" step="0.1" min="0" ${log.kmEnd != null ? 'required' : ''} value="${log.kmEnd ?? ''}" placeholder="Ainda não informado" /></label>
      </div>
      <label>Motivo da correção *<textarea name="reason" rows="3" required placeholder="Ex.: KM inicial digitado incorretamente; conferência do odômetro; correção de lançamento anterior"></textarea></label>
      <div class="km-edit-note"><span>✓</span><div><strong>Auditoria automática</strong><small>Serão guardados os valores anteriores, os novos valores, quem fez a alteração, o motivo e a data/hora.</small></div></div>
    </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Salvar correção', kind: 'primary', onClick: async () => {
        const form = $('#kmFullEditForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const kmStart = Number(fd.kmStart);
        const hasKmEnd = String(fd.kmEnd ?? '').trim() !== '';
        const kmEnd = hasKmEnd ? Number(fd.kmEnd) : null;
        const reason = String(fd.reason || '').trim();
        if (!Number.isFinite(kmStart) || kmStart < 0) return toast('Informe um KM inicial válido.', 'error');
        if (hasKmEnd && (!Number.isFinite(kmEnd) || kmEnd < kmStart)) return toast('O KM final deve ser igual ou maior que o KM inicial.', 'error');
        if (!reason) return toast('Informe o motivo da correção.', 'error');

        // Se o expediente ainda está aberto, editar o KM inicial é permitido. Informar um novo KM final
        // por esta tela só é permitido quando não existir ciclo ativo para o veículo.
        if (log.kmEnd == null && hasKmEnd) {
          const activeCycle = (await Cycles.all()).find((c) => c.environment === getEnv() && c.vehicleId === log.vehicleId && c.status === 'aberto' && !c.deletedAt);
          if (activeCycle) return toast('Não é possível informar KM final enquanto este veículo estiver em um ciclo ativo.', 'error');
        }

        const now = new Date().toISOString();
        const changedStart = Number(log.kmStart) !== kmStart;
        const oldEnd = log.kmEnd == null ? null : Number(log.kmEnd);
        const changedEnd = oldEnd !== kmEnd;
        if (!changedStart && !changedEnd) return toast('Nenhum valor foi alterado.', 'success');

        const correction = {
          type: 'full_edit',
          from: { kmStart: Number(log.kmStart), kmEnd: oldEnd },
          to: { kmStart, kmEnd },
          reason,
          by: getOperatorName(),
          at: now,
          shiftDate: log.shiftDate,
        };
        const corrections = [...(log.kmCorrections || []), correction];
        const patch = {
          kmStart,
          kmEnd,
          kmCorrections: corrections,
          lastKmEditedBy: getOperatorName(),
          lastKmEditedAt: now,
          lastKmEditReason: reason,
        };
        if (changedStart) {
          patch.kmStartCorrections = [...(log.kmStartCorrections || []), {
            from: Number(log.kmStart), to: kmStart, reason, by: getOperatorName(), at: now,
          }];
        }
        if (changedEnd) {
          patch.kmEndCorrections = [...(log.kmEndCorrections || []), {
            type: 'edit', from: oldEnd, to: kmEnd, reason, by: getOperatorName(), at: now,
          }];
          if (kmEnd != null) {
            patch.endedAt = log.endedAt || now;
            patch.endedBy = log.endedBy || getOperatorName();
          } else {
            patch.endedAt = null;
            patch.endedBy = null;
          }
        }
        await OdometerLogs.update(log.id, patch);
        toast(`KM de ${dateBR(log.shiftDate)} corrigido e registrado na auditoria.`, 'success');
        closeModal(); refreshApp();
      }},
    ],
  });
}

function openKmEndModal(log) {
  if(!canPerform('km'))return toast('Seu perfil não pode registrar quilometragem.','error');
  const editing = log.kmEnd != null;
  openModal({
    title: editing ? 'Editar KM final' : 'Registrar KM final',
    subtitle: editing ? `KM inicial: ${log.kmStart} · KM final atual: ${log.kmEnd}` : `KM inicial: ${log.kmStart}`,
    body: `<form id="kmEndForm">
      <label>KM final *<input name="kmEnd" type="number" step="0.1" min="0" required value="${editing ? log.kmEnd : ''}" /></label>
      ${editing ? `<label>Motivo da correção (opcional)<textarea name="correctionReason" rows="2" placeholder="Ex.: KM final foi informado antes do encerramento real do expediente"></textarea></label><div class="km-edit-note"><span>↺</span><div><strong>Correção rastreável</strong><small>O valor anterior continuará preservado na auditoria do sistema.</small></div></div>` : ''}
    </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: editing ? 'Salvar correção' : 'Salvar', kind: 'primary', onClick: async () => {
        const form = $('#kmEndForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const kmEnd = Number(fd.kmEnd);
        if (kmEnd < log.kmStart) return toast('KM final não pode ser menor que o KM inicial.', 'error');
        if (!editing) {
          const activeCycle = (await Cycles.all()).find((c) => c.environment === getEnv() && c.vehicleId === log.vehicleId && c.status === 'aberto' && !c.deletedAt);
          if (activeCycle) return toast('KM final bloqueado: finalize primeiro o ciclo ativo deste veículo.', 'error');
        }
        const now = new Date().toISOString();
        const corrections = editing && kmEnd !== Number(log.kmEnd) ? [...(log.kmEndCorrections || []), {
          from: Number(log.kmEnd), to: kmEnd, reason: (fd.correctionReason || '').trim(), by: getOperatorName(), at: now,
        }] : (log.kmEndCorrections || []);
        await OdometerLogs.update(log.id, {
          kmEnd, endedBy: editing ? (log.endedBy || getOperatorName()) : getOperatorName(), endedAt: editing ? (log.endedAt || now) : now,
          kmEndCorrections: corrections,
          ...(editing ? { lastKmEndEditedBy: getOperatorName(), lastKmEndEditedAt: now } : {}),
        });
        toast(editing ? 'KM final corrigido e registrado na auditoria.' : 'KM final registrado.', 'success');
        closeModal(); refreshApp();
      }},
    ],
  });
}


function openKmReopenModal(log) {
  if (!canPerform('km')) return toast('Seu perfil não pode corrigir quilometragem.', 'error');
  if (!log || log.kmEnd == null) return toast('Este expediente já está aberto.', 'success');
  if (log.shiftDate !== localDateKey()) return toast('A reabertura do expediente só pode ser feita no mesmo dia. Para datas anteriores, use Editar KM final.', 'error');

  openModal({
    title: 'Corrigir fechamento antecipado do KM',
    subtitle: `KM inicial ${log.kmStart} · KM final informado por engano: ${log.kmEnd}`,
    body: `<form id="kmReopenForm">
      <div class="km-edit-note"><span>↺</span><div><strong>O expediente será reaberto</strong><small>O KM final lançado por engano continuará guardado na auditoria. O veículo voltará a ficar disponível para novos ciclos e, no fim do expediente, será necessário registrar o KM final correto.</small></div></div>
      <label>Motivo da correção *<textarea name="reason" rows="3" required placeholder="Ex.: colaborador finalizou o KM no meio do expediente"></textarea></label>
    </form>`,
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: closeModal },
      { label: 'Reabrir expediente', kind: 'primary', onClick: async () => {
        const form = $('#kmReopenForm');
        if (!form.reportValidity()) return;
        const fd = Object.fromEntries(new FormData(form).entries());
        const reason = String(fd.reason || '').trim();
        if (!reason) return toast('Informe o motivo da correção.', 'error');

        const current = await OdometerLogs.get(log.id);
        if (!current || current.kmEnd == null) return toast('Este expediente já foi reaberto.', 'success');
        const now = new Date().toISOString();
        const corrections = [...(current.kmEndCorrections || []), {
          type: 'reopen', from: Number(current.kmEnd), to: null,
          reason, by: getOperatorName(), at: now,
          originalEndedAt: current.endedAt || null, originalEndedBy: current.endedBy || null,
        }];
        await OdometerLogs.update(current.id, {
          kmEnd: null, endedAt: null, endedBy: null,
          kmEndCorrections: corrections,
          reopenedAt: now, reopenedBy: getOperatorName(), reopenReason: reason,
        });

        // Se o fechamento geral do dia também já tinha sido registrado, ele deixa de valer
        // até que o KM final verdadeiro seja lançado e o fechamento seja confirmado novamente.
        const activeClosure = (await DayClosures.all()).find((c) => c.environment === getEnv() && c.date === current.shiftDate && !c.superseded);
        if (activeClosure) {
          await DayClosures.update(activeClosure.id, {
            superseded: true, reopenedAt: now, reopenedBy: getOperatorName(),
            reopenReason: `KM reaberto: ${reason}`,
          });
        }

        toast('Expediente reaberto. O veículo pode continuar a operação; registre o KM final correto no fim do dia.', 'success');
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
  if(!canPerform('cost'))return toast('Seu perfil não pode lançar custos.','error');
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
let dashboardSection = 'tudo';

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

function previousDashboardRange(range) {
  if (!range.start || !range.end) return null;
  const duration = range.end.getTime() - range.start.getTime() + 1;
  const end = new Date(range.start.getTime() - 1);
  const start = new Date(end.getTime() - duration + 1);
  return { start, end };
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

function durationValues(rows, fromField, toField) {
  return rows.map((r) => r[fromField] && r[toField] ? (new Date(r[toField]) - new Date(r[fromField])) / 60000 : null).filter((v) => Number.isFinite(v) && v >= 0).sort((a,b) => a-b);
}

function percentile(values, pct) {
  if (!values.length) return null;
  return values[Math.min(values.length-1, Math.max(0, Math.ceil(values.length*pct)-1))];
}

function changePercent(current, previous) {
  if (!previous) return null;
  return ((current-previous)/Math.abs(previous))*100;
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
  const [allRows, allCycles, allCosts, allKm, drivers, vehicles, neighborhoods, costCategories] = await Promise.all([
    Deliveries.active(env), Cycles.all(), Costs.all(), OdometerLogs.all(), Drivers.all(), Vehicles.all(), Neighborhoods.all(), CostCategories.all(),
  ]);
  const range = dashboardRange();
  const rows = allRows.filter((r) => dashboardInRange(r.entryTime, range));
  const cycles = allCycles.filter((c) => c.environment === env && !c.deletedAt && dashboardInRange(c.startedAt, range));
  const costs = allCosts.filter((c) => c.environment === env && !c.deletedAt && dashboardInRange(c.date, range));
  const kmLogs = allKm.filter((l) => l.environment === env && dashboardInRange(l.shiftDate, range));
  const finalized = rows.filter((r) => r.status === 'finalizada' && r.deliveredAt);
  const problems = rows.filter((r) => r.status === 'cancelada' || (r.returnAttempts || []).length || (r.statusHistory || []).some((h) => ['retorno','reentrega'].includes(h.to)));
  const refunded = rows.filter((r) => r.refunded);
  const closedCycles = cycles.filter((c) => c.status === 'fechado');
  const pending = rows.filter((r) => ['na_loja','em_rota','no_cliente','programada'].includes(r.status));
  const dashboardSla = rows.map((record)=>({record,sla:deliverySla(record)}));
  const startLateDashboard = dashboardSla.filter(({sla})=>sla.startLate).map(({record})=>record);
  const arrivalLateDashboard = dashboardSla.filter(({sla})=>sla.arrivalLate).map(({record})=>record);
  const riskDashboard = dashboardSla.filter(({sla})=>sla.startRisk||sla.arrivalRisk).map(({record})=>record);
  const lateDashboardIds = new Set([...startLateDashboard,...arrivalLateDashboard].map((r)=>r.id));
  const late = rows.filter((r)=>lateDashboardIds.has(r.id));
  const priority = rows.filter((r) => r.priority === 'alta');
  const scheduled = rows.filter((r) => r.type === 'agendada' || r.status === 'programada');

  const feeRows = rows.filter((r) => r.status === 'finalizada' || (r.status === 'retirada_loja' && !r.refunded));
  const grossFees = feeRows.reduce((s,r) => s + Number(r.deliveryFee || 0), 0);
  const refunds = refunded.reduce((s,r) => s + Number(r.deliveryFee || 0), 0);
  const netRevenue = grossFees - refunds;
  const costTotal = costs.reduce((s,c) => s + Number(c.amount || 0), 0);
  const balance = netRevenue - costTotal;
  const validKmLogs = kmLogs.filter((l) => l.kmStart != null && l.kmEnd != null && Number(l.kmEnd) >= Number(l.kmStart));
  const kmTotal = validKmLogs.reduce((s,l) => s + Math.max(0, Number(l.kmEnd) - Number(l.kmStart)), 0);

  // produtividade
  const successRate = rows.length ? Math.round((finalized.length / rows.length) * 100) : 0;
  const avgPerCycle = closedCycles.length ? (finalized.length / closedCycles.length).toFixed(1) : '—';
  const avgStoreWait = averageMinutes(rows, 'entryTime', 'leftStoreAt');
  const avgRoute = averageMinutes(rows, 'leftStoreAt', 'clientArrivalAt');
  const avgAtClient = averageMinutes(rows, 'clientArrivalAt', 'deliveredAt');
  const avgTotal = averageMinutes(rows, 'entryTime', 'deliveredAt');
  const bottleneck = [['Espera na loja',avgStoreWait,'tempos'],['Tempo em rota',avgRoute,'tempos'],['Atendimento no cliente',avgAtClient,'tempos']].filter(([,value])=>value!=null).sort((a,b)=>b[1]-a[1])[0] || null;
  const totalDurations = durationValues(rows, 'entryTime', 'deliveredAt');
  const medianTotal = percentile(totalDurations, .5);
  const p90Total = percentile(totalDurations, .9);
  const maxTotal = totalDurations.length ? totalDurations[totalDurations.length-1] : null;
  const avgCycleDuration = averageMinutes(closedCycles, 'startedAt', 'closedAt');
  const cycleDurations = durationValues(closedCycles, 'startedAt', 'closedAt');
  const maxCycleDuration = cycleDurations.length ? cycleDurations[cycleDurations.length-1] : null;
  const arrivedClient = rows.filter((r) => r.clientArrivalAt).length;
  const leftStore = rows.filter((r) => r.leftStoreAt).length;
  const withdrawn = rows.filter((r) => r.status === 'retirada_loja').length;
  const largeDeliveries = rows.filter((r) => r.size === 'grande').length;
  const firstAttempt = finalized.filter((r) => !(r.statusHistory || []).some((h) => ['retorno','reentrega'].includes(h.to))).length;
  const firstAttemptRate = finalized.length ? Math.round(firstAttempt/finalized.length*100) : 0;
  const returnEvents = rows.reduce((total, row) => total + ((row.returnAttempts || []).length || (row.statusHistory || []).filter((h) => ['retorno','reentrega'].includes(h.to)).length), 0);
  const returnRate = rows.length ? returnEvents/rows.length*100 : 0;
  const startEvaluated = dashboardSla.filter(({record,sla})=>record.leftStoreAt||sla.startLate);
  const arrivalEvaluated = dashboardSla.filter(({record,sla})=>record.clientArrivalAt||sla.arrivalLate);
  const startOnTimeRate = startEvaluated.length ? Math.round(startEvaluated.filter(({record,sla})=>record.leftStoreAt&&!sla.startLate).length/startEvaluated.length*100) : 0;
  const arrivalOnTimeRate = arrivalEvaluated.length ? Math.round(arrivalEvaluated.filter(({record,sla})=>record.clientArrivalAt&&!sla.arrivalLate).length/arrivalEvaluated.length*100) : 0;
  const marginRate = netRevenue ? (balance/netRevenue)*100 : 0;
  const avgFee = feeRows.length ? grossFees/feeRows.length : 0;
  const deliveriesPerKm = kmTotal ? finalized.length/kmTotal : null;
  const kmPerCycle = closedCycles.length ? kmTotal/closedCycles.length : null;

  const previousRange = previousDashboardRange(range);
  const previousRows = previousRange ? allRows.filter((r) => dashboardInRange(r.entryTime, previousRange)) : [];
  const previousFinalized = previousRows.filter((r) => r.status === 'finalizada' && r.deliveredAt);
  const previousCosts = previousRange ? allCosts.filter((c) => c.environment === env && !c.deletedAt && dashboardInRange(c.date, previousRange)) : [];
  const previousGross = previousRows.filter((r) => r.status === 'finalizada' || (r.status === 'retirada_loja' && !r.refunded)).reduce((s,r)=>s+Number(r.deliveryFee||0),0);
  const previousRefunds = previousRows.filter((r)=>r.refunded).reduce((s,r)=>s+Number(r.deliveryFee||0),0);
  const previousBalance = previousGross-previousRefunds-previousCosts.reduce((s,c)=>s+Number(c.amount||0),0);
  const volumeChange = changePercent(rows.length, previousRows.length);
  const resultChange = changePercent(balance, previousBalance);
  const previousAvgTotal = averageMinutes(previousFinalized, 'entryTime', 'deliveredAt');
  const timeChange = previousAvgTotal == null || avgTotal == null ? null : changePercent(avgTotal, previousAvgTotal);

  // qualidade dos dados
  const missingPhone = rows.filter((r) => !r.phone).length;
  const missingClient = rows.filter((r) => !r.clientName).length;
  const missingVehicleOrDriver = rows.filter((r) => !r.vehicleId || !r.driverId).length;
  const missingCompletionTime = rows.filter((r) => r.status === 'finalizada' && !r.deliveredAt).length;
  const missingStartTime = cycles.filter((c) => !c.startedAt).length;
  const missingEndTime = closedCycles.filter((c) => !c.closedAt).length;
  const missingArrivalTime = finalized.filter((r) => !r.clientArrivalAt).length;
  const dataCompletenessBase = rows.length*4 + cycles.length*2;
  const dataIssues = missingPhone + missingClient + missingVehicleOrDriver + missingCompletionTime + missingArrivalTime + missingStartTime + missingEndTime;
  const dataCompleteness = dataCompletenessBase ? Math.max(0,Math.round((1-dataIssues/dataCompletenessBase)*100)) : 100;

  // rankings
  const rank = (items, keyFn, nameFn) => {
    const map = {};
    items.forEach((it) => { const k = keyFn(it); if (k) map[k] = (map[k] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, count]) => [nameFn(id), count]);
  };
  const rankingDriver = rank(finalized, (d) => d.driverId, (id) => drivers.find((d) => d.id === id)?.name || 'Sem entregador');
  const rankingVehicle = rank(finalized, (d) => d.vehicleId, (id) => vehicles.find((v) => v.id === id)?.label || 'Sem veículo');
  const rankingNeighborhood = rank(rows, (d) => d.neighborhoodId, (id) => neighborhoods.find((n) => n.id === id)?.name || 'Sem bairro');
  const driverPerformance = drivers.map((driver) => {
    const driverRows = rows.filter((r) => r.driverId === driver.id);
    const done = driverRows.filter((r) => r.status === 'finalizada' && r.deliveredAt);
    return {
      name: driver.name, total: driverRows.length, done: done.length,
      success: driverRows.length ? Math.round(done.length/driverRows.length*100) : 0,
      avg: averageMinutes(done, 'leftStoreAt', 'deliveredAt'),
    };
  }).filter((r)=>r.total).sort((a,b)=>b.done-a.done).slice(0,8);

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
  const hourWindows = [
    ['00–05h',byHour.slice(0,6).reduce((s,v)=>s+v,0)],['06–08h',byHour.slice(6,9).reduce((s,v)=>s+v,0)],
    ['09–11h',byHour.slice(9,12).reduce((s,v)=>s+v,0)],['12–14h',byHour.slice(12,15).reduce((s,v)=>s+v,0)],
    ['15–17h',byHour.slice(15,18).reduce((s,v)=>s+v,0)],['18–23h',byHour.slice(18).reduce((s,v)=>s+v,0)],
  ];
  const costByCategory = costCategories.map((category) => [category.name, costs.filter((c)=>c.categoryId===category.id).reduce((s,c)=>s+Number(c.amount||0),0)]).filter(([,value])=>value>0).sort((a,b)=>b[1]-a[1]).slice(0,7);

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

  const metric = (title, value, tip, tone = '', context = '') => `<article class="intel-metric ${tone}" data-tip="${escapeHtml(tip)}"><small>${title}</small><strong>${value}</strong>${context ? `<span>${context}</span>` : ''}</article>`;
  const delta = (value, inverse = false) => value == null ? '<span>sem período anterior comparável</span>' : `<span class="metric-delta ${(inverse ? value<=0 : value>=0) ? 'up' : 'down'}">${value>=0?'↑':'↓'} ${Math.abs(value).toFixed(1)}% vs. período anterior</span>`;
  const rankingPanel = (title, data, unit = '') => `<article class="ranking-panel"><header><strong>${title}</strong><small>TOP ${data.length || 0}</small></header>${data.length ? data.map(([name,value],index)=>`<div class="ranking-line"><i>${index+1}</i><span>${escapeHtml(name)}</span><b>${typeof value==='number' ? value.toLocaleString('pt-BR') : value}${unit}</b></div>`).join('') : '<p class="panel-empty">Sem dados suficientes.</p>'}</article>`;
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
        <button class="btn-ghost btn-small" id="dashboardGoalsBtn" data-tip="Configure os limites operacionais. Padrão atual: saída em 2h e chegada em 3h30.">Metas / SLA</button>
      </div>
    </div>

    ${!rows.length ? `<div class="dashboard-empty-notice">Não existem entregas neste período. Troque o filtro para visualizar outros dados.</div>` : ''}

    <section class="intel-command-banner">
      <div class="intel-command-copy"><span>INTELIGÊNCIA OPERACIONAL · AO VIVO</span><h2>Decisões mais rápidas, em uma leitura.</h2><p>O painel cruza volume, SLA, ocorrências, frota, custos e qualidade para destacar o que merece ação.</p></div>
      <div class="intel-command-signals">
        <article><small>SAÚDE</small><strong>${successRate}/100</strong><span>${performanceProfile(successRate).label}</span></article>
        <article class="${late.length?'signal-alert':''}"><small>ALERTAS</small><strong>${late.length}</strong><span>SLA vencido</span></article>
        <article class="${problems.length?'signal-warning':''}"><small>OCORRÊNCIAS</small><strong>${problems.length}</strong><span>exigem leitura</span></article>
        <article class="${balance<0?'signal-alert':'signal-good'}"><small>RESULTADO</small><strong>${money(balance)}</strong><span>${range.label}</span></article>
      </div>
    </section>

    <section class="intel-hero">
      <article class="intel-score" data-tip="Desempenho: finalizadas com horário dividido pelo total registrado."><div class="score-ring" style="--score:${successRate};--score-color:${performanceProfile(successRate).color}"><strong>${successRate}</strong><small>/100</small></div><div><span>DESEMPENHO</span><h2>${performanceProfile(successRate).label}</h2><p>${motivationalPhrase(successRate)}</p></div></article>
      <article class="intel-hero-metric"><small>Volume</small><strong>${rows.length}</strong>${delta(volumeChange)}</article>
      <article class="intel-hero-metric"><small>Tempo completo médio</small><strong>${formatDuration(avgTotal)}</strong>${delta(timeChange,true)}</article>
      <article class="intel-hero-metric ${balance<0?'negative':''}"><small>Resultado operacional</small><strong>${money(balance)}</strong>${delta(resultChange)}</article>
    </section>

    <section class="decision-brief">
      <header><div><span>LEITURA AUTOMÁTICA</span><strong>O que merece atenção neste período</strong></div><small>clique para investigar</small></header>
      <div>
        <button data-insight-group="fluxo" class="${late.length?'critical':'positive'}"><i>${late.length?'!':'✓'}</i><span><small>OPERAÇÃO</small><strong>${late.length ? `${startLateDashboard.length} saída(s) e ${arrivalLateDashboard.length} chegada(s) atrasadas` : 'Nenhum SLA vencido'}</strong></span><b>›</b></button>
        <button data-insight-group="tempos" class="${bottleneck?'warning':''}"><i>◷</i><span><small>MAIOR GARGALO</small><strong>${bottleneck ? `${bottleneck[0]} · ${formatDuration(bottleneck[1])}` : 'Aguardando horários completos'}</strong></span><b>›</b></button>
        <button data-insight-group="financeiro" class="${balance<0?'critical':'positive'}"><i>R$</i><span><small>RESULTADO</small><strong>${balance<0?'Prejuízo de ':'Saldo de '}${money(Math.abs(balance))}</strong></span><b>›</b></button>
        <button data-insight-group="qualidade" class="${dataCompleteness<95?'warning':'positive'}"><i>◇</i><span><small>CONFIABILIDADE</small><strong>${dataCompleteness}% dos dados críticos completos</strong></span><b>›</b></button>
      </div>
    </section>

    <nav class="dashboard-scope" aria-label="Áreas do dashboard">
      ${[['tudo','Tudo'],['geral','Visão geral'],['fluxo','Fluxo'],['tempos','Tempos / SLA'],['ciclos','Ciclos / Frota'],['financeiro','Financeiro'],['qualidade','Qualidade']].map(([key,label])=>`<button data-dashboard-section="${key}" class="${dashboardSection===key?'active':''}">${label}</button>`).join('')}
    </nav>

    <section class="intel-section" data-dashboard-group="geral">
      <div class="intel-section-head"><div><span>VISÃO GERAL</span><h2>Demanda e andamento</h2></div><small>${range.label}</small></div>
      <div class="intel-metric-grid">
        ${metric('Registradas', rows.length, 'Todas as entregas que entraram no período.', '', 'demanda total')}
        ${metric('Finalizadas', finalized.length, 'Finalizadas com hora exata no cliente.', 'good', `${successRate}% do volume`)}
        ${metric('Pendentes', pending.length, 'Na loja, em rota, no cliente, programadas ou em reentrega.', pending.length?'warning':'good')}
        ${metric('Atraso de saída', startLateDashboard.length, 'Não saíram em até 2 horas da entrada.', startLateDashboard.length?'bad':'good')}
        ${metric('Atraso de chegada', arrivalLateDashboard.length, 'Não chegaram ao cliente em até 3 horas e 30 minutos da entrada.', arrivalLateDashboard.length?'bad':'good')}
        ${metric('Risco nos próximos 30 min', riskDashboard.length, 'Ainda dentro do prazo, mas perto de vencer um dos SLAs.', riskDashboard.length?'warning':'good')}
        ${metric('Saíram da loja', leftStore, 'Entregas com hora de saída registrada.')}
        ${metric('Chegaram no cliente', arrivedClient, 'Entregas com hora de chegada na casa do cliente.')}
        ${metric('Prioridade alta', priority.length, 'Entregas de prioridade alta no período.')}
        ${metric('Agendadas', scheduled.length, 'Entregas agendadas ou programadas.')}
      </div>
      <div class="forecast-strip">
        <article data-tip="Média real do mesmo dia da semana."><span>AMANHÃ</span><strong>${forecastTomorrow??'—'}</strong><small>entregas previstas</small></article>
        <article data-tip="Média semanal do histórico real."><span>PRÓXIMA SEMANA</span><strong>${forecastWeek??'—'}</strong><small>entregas previstas</small></article>
        <article data-tip="Média mensal do histórico real."><span>PRÓXIMO MÊS</span><strong>${forecastMonth??'—'}</strong><small>entregas previstas</small></article>
        <article data-tip="Hora com mais entradas no período."><span>PICO</span><strong>${rows.length?String(peakHour).padStart(2,'0')+'h':'—'}</strong><small>maior movimento</small></article>
      </div>
      <div class="dashboard-chart-grid">
        <article class="chart-card featured-chart"><div class="chart-title"><div><span>VOLUME</span><strong>Evolução das entradas</strong></div><small>${range.label}</small></div>${lineChartSVG({labels:trend.labels,values:trend.values})}</article>
        <article class="chart-card"><div class="chart-title"><div><span>STATUS</span><strong>Distribuição operacional</strong></div><small>agora</small></div>${barChartSVG({labels:statusLabels,values:statusCounts,color:'var(--accent)'})}</article>
      </div>
    </section>

    <section class="intel-section" data-dashboard-group="fluxo">
      <div class="intel-section-head"><div><span>FLUXO OPERACIONAL</span><h2>Volume, perfil e exceções</h2></div><small>todos os movimentos</small></div>
      <div class="intel-metric-grid">
        ${metric('Ocorrências', problems.length, 'Retornos, reentregas e cancelamentos.', problems.length?'bad':'good')}
        ${metric('Taxa de retorno', `${returnRate.toFixed(1)}%`, 'Ocorrências divididas pelo total.')}
        ${metric('Primeira tentativa', `${firstAttemptRate}%`, 'Finalizações sem retorno ou reentrega no histórico.', 'good')}
        ${metric('Retiradas na loja', withdrawn, 'Entregas retiradas diretamente na loja.')}
        ${metric('Entregas grandes', largeDeliveries, 'Entregas classificadas como grandes.')}
        ${metric('Média por ciclo', avgPerCycle, 'Finalizadas divididas pelos ciclos fechados.')}
        ${metric('Média por dia', rows.length ? (rows.length/Math.max(1,new Set(rows.map(r=>dashboardDayKey(r.entryTime))).size)).toFixed(1) : '—', 'Volume médio nos dias que tiveram entrada.')}
        ${metric('Saídas no prazo', `${startOnTimeRate}%`, 'Percentual avaliado que saiu em até 2 horas.', startOnTimeRate>=operationalTargets().successTarget?'good':'warning')}
        ${metric('Chegadas no prazo', `${arrivalOnTimeRate}%`, 'Percentual avaliado que chegou em até 3 horas e 30 minutos.', arrivalOnTimeRate>=operationalTargets().successTarget?'good':'warning')}
      </div>
      <div class="dashboard-chart-grid">
        <article class="chart-card"><div class="chart-title"><div><span>SEMANA</span><strong>Demanda por dia</strong></div><small>volume</small></div>${barChartSVG({labels:weekdayNames,values:byWeekday,color:'var(--status-entregue)'})}</article>
        <article class="chart-card"><div class="chart-title"><div><span>HORÁRIOS</span><strong>Faixas de entrada</strong></div><small>volume</small></div>${barChartSVG({labels:hourWindows.map(x=>x[0]),values:hourWindows.map(x=>x[1]),color:'var(--ink-2)'})}</article>
      </div>
    </section>

    <section class="intel-section" data-dashboard-group="tempos">
      <div class="intel-section-head"><div><span>TEMPOS E SLA</span><h2>Onde o tempo está sendo gasto</h2></div><small>compra → retorno</small></div>
      <div class="intel-metric-grid">
        ${metric('Espera na loja', formatDuration(avgStoreWait), 'Entrada da compra até saída da loja.')}
        ${metric('Tempo em rota', formatDuration(avgRoute), 'Saída da loja até chegada ao cliente.')}
        ${metric('Tempo no cliente', formatDuration(avgAtClient), 'Chegada até finalização no cliente.')}
        ${metric('Tempo completo médio', formatDuration(avgTotal), 'Entrada até finalização.')}
        ${metric('Mediana completa', formatDuration(medianTotal), 'Metade das entregas levou até este tempo.')}
        ${metric('P90 completo', formatDuration(p90Total), '90% das entregas levou até este tempo.')}
        ${metric('Maior tempo', formatDuration(maxTotal), 'Maior duração completa registrada.', maxTotal>120?'bad':'')}
        ${metric('Saídas dentro de 2h', `${startOnTimeRate}%`, 'Percentual das saídas avaliadas que cumpriu o SLA.', startOnTimeRate>=operationalTargets().successTarget?'good':'warning')}
        ${metric('Chegadas dentro de 3h30', `${arrivalOnTimeRate}%`, 'Percentual das chegadas avaliadas que cumpriu o SLA.', arrivalOnTimeRate>=operationalTargets().successTarget?'good':'warning')}
      </div>
      <article class="chart-card full-chart"><div class="chart-title"><div><span>GARGALOS</span><strong>Tempo médio por etapa</strong></div><small>minutos</small></div>${barChartSVG({labels:['Espera loja','Em rota','No cliente','Total'],values:[avgStoreWait,avgRoute,avgAtClient,avgTotal].map(v=>Math.round(v||0)),color:'var(--status-transito)',unit:' min'})}</article>
      <article class="chart-card full-chart"><div class="chart-title"><div><span>CUMPRIMENTO DE SLA</span><strong>No prazo versus atrasadas</strong></div><small>entregas</small></div>${barChartSVG({labels:['Saída no prazo','Saída atrasada','Chegada no prazo','Chegada atrasada'],values:[Math.max(0,startEvaluated.length-startLateDashboard.length),startLateDashboard.length,Math.max(0,arrivalEvaluated.length-arrivalLateDashboard.length),arrivalLateDashboard.length],color:'var(--status-pendente)'})}</article>
    </section>

    <section class="intel-section" data-dashboard-group="ciclos">
      <div class="intel-section-head"><div><span>CICLOS E FROTA</span><h2>Uso dos recursos</h2></div><small>saída e retorno exatos</small></div>
      <div class="intel-metric-grid">
        ${metric('Ciclos iniciados', cycles.length, 'Todos os ciclos iniciados no período.')}
        ${metric('Ciclos fechados', closedCycles.length, 'Ciclos com hora exata de fim.')}
        ${metric('Ciclos abertos', cycles.filter(c=>c.status==='aberto').length, 'Ciclos ainda em andamento.', cycles.some(c=>c.status==='aberto')?'warning':'good')}
        ${metric('Duração média', formatDuration(avgCycleDuration), 'Média entre início e fim dos ciclos.')}
        ${metric('Ciclo mais longo', formatDuration(maxCycleDuration), 'Maior duração de ciclo registrada.')}
        ${metric('Produtividade/ciclo', avgPerCycle, 'Entregas finalizadas por ciclo fechado.')}
        ${metric('Quilometragem rodada', formatKm(kmTotal), 'Soma do KM final menos o KM inicial dos expedientes fechados.')}
        ${metric('Média de km por ciclo', kmPerCycle==null?'—':formatKm(kmPerCycle), 'Quilometragem rodada dividida pelos ciclos fechados.')}
        ${metric('Entregas por km', deliveriesPerKm==null?'—':formatPerKm(deliveriesPerKm), 'Quantidade de entregas finalizadas para cada quilômetro rodado.')}
        ${metric('Expedientes de km', kmLogs.length, 'Registros de quilometragem no período.')}
        ${metric('KM ainda aberto', kmLogs.filter(k=>k.kmEnd==null).length, 'Expedientes sem KM final.', kmLogs.some(k=>k.kmEnd==null)?'warning':'good')}
        ${metric('Recursos vinculados', rows.filter(r=>r.vehicleId&&r.driverId).length, 'Entregas com veículo e entregador informados.')}
      </div>
      <article class="driver-table-panel"><header><div><span>DESEMPENHO POR ENTREGADOR</span><strong>Volume, sucesso e velocidade</strong></div></header><div class="table-wrap"><table><thead><tr><th>Entregador</th><th>Entregas</th><th>Finalizadas</th><th>Sucesso</th><th>Tempo médio</th></tr></thead><tbody>${driverPerformance.length?driverPerformance.map(d=>`<tr><td><strong>${escapeHtml(d.name)}</strong></td><td>${d.total}</td><td>${d.done}</td><td>${d.success}%</td><td>${formatDuration(d.avg)}</td></tr>`).join(''):'<tr><td colspan="5">Sem dados suficientes.</td></tr>'}</tbody></table></div></article>
    </section>

    <section class="intel-section" data-dashboard-group="financeiro">
      <div class="intel-section-head"><div><span>FINANCEIRO</span><h2>Receita, custo e eficiência</h2></div><small>lançamentos reais</small></div>
      <div class="intel-metric-grid">
        ${metric('Taxas brutas', money(grossFees), 'Soma das taxas contabilizadas.')}
        ${metric('Reembolsos', money(refunds), 'Taxas reembolsadas.', refunds?'warning':'')}
        ${metric('Receita líquida', money(netRevenue), 'Taxas menos reembolsos.', 'good')}
        ${metric('Custos operacionais', money(costTotal), 'Custos lançados no período.')}
        ${metric('Resultado', money(balance), 'Receita líquida menos custos.', balance>=0?'good':'bad')}
        ${metric('Margem operacional', netRevenue?`${marginRate.toFixed(1)}%`:'—', 'Resultado dividido pela receita líquida.', marginRate>=0?'good':'bad')}
        ${metric('Taxa média', feeRows.length?money(avgFee):'—', 'Valor médio de taxa por entrega contabilizada.')}
        ${metric('Custo/entrega', finalized.length?money(costTotal/finalized.length):'—', 'Custos divididos pelas finalizadas.')}
        ${metric('Receita/entrega', finalized.length?money(netRevenue/finalized.length):'—', 'Receita líquida dividida pelas finalizadas.')}
        ${metric('Resultado/entrega', finalized.length?money(balance/finalized.length):'—', 'Resultado dividido pelas finalizadas.')}
        ${metric('Custo/KM', kmTotal?money(costTotal/kmTotal):'—', 'Custos divididos pelo KM.')}
        ${metric('Receita/KM', kmTotal?money(netRevenue/kmTotal):'—', 'Receita líquida dividida pelo KM.')}
      </div>
      <div class="dashboard-chart-grid">
        <article class="chart-card"><div class="chart-title"><div><span>COMPOSIÇÃO</span><strong>Receita e custos</strong></div><small>R$</small></div>${barChartSVG({labels:['Taxas','Reembolsos','Custos','Resultado +'],values:[grossFees,refunds,costTotal,Math.max(0,balance)].map(v=>Number(v.toFixed(2))),color:'var(--accent)',unit:' R$'})}</article>
        <article class="chart-card"><div class="chart-title"><div><span>CUSTOS</span><strong>Por categoria</strong></div><small>R$</small></div>${barChartSVG({labels:costByCategory.length?costByCategory.map(x=>x[0]):['Sem custos'],values:costByCategory.length?costByCategory.map(x=>Number(x[1].toFixed(2))):[0],color:'var(--status-problema)',unit:' R$'})}</article>
      </div>
    </section>

    <section class="intel-section" data-dashboard-group="qualidade">
      <div class="intel-section-head"><div><span>QUALIDADE E CLIENTES</span><h2>Confiabilidade dos dados e recorrência</h2></div><small>${dataCompleteness}% completo</small></div>
      <div class="intel-metric-grid">
        ${metric('Completude dos dados', `${dataCompleteness}%`, 'Proporção estimada dos campos críticos preenchidos.', dataCompleteness>=95?'good':'warning')}
        ${metric('Sem telefone', missingPhone, 'Entregas sem telefone.', missingPhone?'warning':'good')}
        ${metric('Sem nome', missingClient, 'Entregas sem nome do cliente.', missingClient?'warning':'good')}
        ${metric('Sem veículo/entregador', missingVehicleOrDriver, 'Entregas sem recurso vinculado.', missingVehicleOrDriver?'warning':'good')}
        ${metric('Sem chegada', missingArrivalTime, 'Finalizadas sem hora de chegada.', missingArrivalTime?'bad':'good')}
        ${metric('Sem finalização', missingCompletionTime, 'Finalizadas sem hora final.', missingCompletionTime?'bad':'good')}
        ${metric('Ciclo sem início/fim', missingStartTime+missingEndTime, 'Ciclos sem horários obrigatórios.', missingStartTime+missingEndTime?'bad':'good')}
        ${metric('Clientes únicos', uniqueClients, 'Clientes distintos por telefone ou nome.')}
        ${metric('Clientes recorrentes', recurringClients, 'Clientes com mais de uma entrega.')}
        ${metric('Primeira tentativa', `${firstAttemptRate}%`, 'Finalizações sem retorno ou reentrega.', 'good')}
        ${metric('Ocorrências', problems.length, 'Retornos, reentregas e cancelamentos.', problems.length?'warning':'good')}
        ${metric('Reembolsos', refunded.length, 'Entregas com reembolso.')}
      </div>
      <div class="ranking-grid">
        ${rankingPanel('Entregadores',rankingDriver)}
        ${rankingPanel('Veículos',rankingVehicle)}
        ${rankingPanel('Bairros',rankingNeighborhood)}
        ${rankingPanel('Clientes recorrentes',topClients,'x')}
      </div>
    </section>
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
  $('#dashboardGoalsBtn')?.addEventListener('click',openOperationalTargetsModal);
  $$('[data-dashboard-section]').forEach((btn) => btn.addEventListener('click', () => {
    dashboardSection = btn.dataset.dashboardSection;
    $$('[data-dashboard-section]').forEach((item)=>item.classList.toggle('active',item===btn));
    $$('[data-dashboard-group]').forEach((section)=>section.classList.toggle('dashboard-section-hidden',dashboardSection!=='tudo'&&section.dataset.dashboardGroup!==dashboardSection));
  }));
  $$('[data-insight-group]').forEach((btn) => btn.addEventListener('click', () => {
    const target = $(`[data-dashboard-section="${btn.dataset.insightGroup}"]`);
    target?.click();
    $('.dashboard-scope')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  $$('[data-dashboard-group]').forEach((section)=>section.classList.toggle('dashboard-section-hidden',dashboardSection!=='tudo'&&section.dataset.dashboardGroup!==dashboardSection));
}

function openOperationalTargetsModal(){
  const targets=operationalTargets();
  openModal({
    title:'Metas e limites operacionais',
    subtitle:'Os atrasos e alertas da Central e do Centro de Inteligência usam estes valores.',
    body:`<form id="operationalTargetsForm">
      <div class="sla-rule-summary"><div><span>SAÍDA</span><strong>${formatDuration(targets.startMinutes)}</strong><small>entrada → início do ciclo</small></div><div><span>CHEGADA</span><strong>${formatDuration(targets.arrivalMinutes)}</strong><small>entrada → casa do cliente</small></div></div>
      <div class="field-row"><label>Limite para iniciar/sair (minutos) *<input type="number" name="startMinutes" min="30" step="30" required value="${targets.startMinutes}" /></label><label>Limite para chegar ao cliente (minutos) *<input type="number" name="arrivalMinutes" min="60" step="30" required value="${targets.arrivalMinutes}" /></label></div>
      <div class="field-row"><label>Avisar com antecedência (minutos) *<input type="number" name="warningMinutes" min="5" max="120" step="5" required value="${targets.warningMinutes}" /></label><label>Meta de cumprimento (%) *<input type="number" name="successTarget" min="1" max="100" required value="${targets.successTarget}" /></label></div>
    </form>`,
    actions:[{label:'Cancelar',kind:'ghost',onClick:closeModal},{label:'Salvar metas',kind:'primary',onClick:()=>{
      const form=$('#operationalTargetsForm');if(!form.reportValidity())return;
      const fd=Object.fromEntries(new FormData(form).entries());
      const next={startMinutes:Number(fd.startMinutes),arrivalMinutes:Number(fd.arrivalMinutes),warningMinutes:Number(fd.warningMinutes),successTarget:Number(fd.successTarget)};
      if(next.arrivalMinutes<=next.startMinutes)return toast('O limite de chegada precisa ser maior que o limite de saída.','error');
      localStorage.setItem('orbita_operational_targets',JSON.stringify(next));
      toast('Metas operacionais atualizadas.','success');closeModal();refreshApp();
    }}],
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
        <p style="font-size:12.5px;color:var(--text-muted);margin:8px 0">Excel completo no mesmo padrão do relatório de referência: um único arquivo com múltiplas abas analíticas. Os CSVs avulsos continuam disponíveis abaixo.</p>
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
          <button class="btn-primary btn-small" id="exportAllBtn">⇩ Excel completo · 31 abas</button>
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
    const header = ['Compra','Chegada','Data entrada','PDV','DOC','Cupom','Cliente','Telefone','Endereço','Nº','Complemento','Referência','Bairro','Taxa','Tamanho','Viagens','Prioridade','Tipo','Agendado para','Status','Saída da loja','Limite da saída','SLA da saída','Chegada na casa do cliente','Limite da chegada','SLA da chegada','Finalizada na casa do cliente','Retornou à loja em','Motivo do retorno','Situação da mercadoria','Itens/volumes retornados','Nova tentativa','Próxima tentativa','Quantidade de retornos','Veículo','Entregador','Reembolsado','Observações'];
    const lines = rows.map((r) => {const sla=deliverySla(r);return [r.purchaseNumber, r.arrivalNumber, dateTimeBR(r.entryTime), r.pdv, r.doc, r.coupon, r.clientName, r.phone, r.street, r.houseNumber, r.complement, r.reference, nName(r.neighborhoodId), r.deliveryFee, r.size, r.tripCount, r.priority, r.type, r.scheduledAt ? dateTimeBR(r.scheduledAt) : '', STATUS_META[r.status]?.label, r.leftStoreAt ? dateTimeBR(r.leftStoreAt) : '', dateTimeBR(sla.startDeadline),sla.startLate?'Atrasada':'No prazo',r.clientArrivalAt ? dateTimeBR(r.clientArrivalAt) : '',dateTimeBR(sla.arrivalDeadline),sla.arrivalLate?'Atrasada':'No prazo',r.deliveredAt ? dateTimeBR(r.deliveredAt) : '',r.returnedAt ? dateTimeBR(r.returnedAt) : '',r.returnReasonLabel || '',r.merchandiseSituation || '',r.returnedItems || '',r.retryPlanned ? 'Sim' : r.returnedAt ? 'Não' : '',r.nextAttemptAt ? dateTimeBR(r.nextAttemptAt) : '',(r.returnAttempts || []).length, vName(r.vehicleId), dName(r.driverId), r.refunded ? 'Sim' : 'Não', r.notes];});
    return { name: 'entregas', header, lines };
  }
  if (kind === 'cycles') {
    const rows = (await Cycles.all()).filter((c) => c.environment === env && !c.deletedAt && inReportPeriod(c.startedAt, period));
    const header = ['Início exato', 'Fim exato', 'Duração', 'Início registrado por', 'Fim registrado por', 'Veículo', 'Entregador', 'Status', 'Qtd. entregas'];
    const lines = rows.map((c) => [dateTimeBR(c.startedAt), c.closedAt ? dateTimeBR(c.closedAt) : '', c.closedAt ? formatDuration((new Date(c.closedAt)-new Date(c.startedAt))/60000) : '', c.startedAtRegisteredBy || '', c.closedAtRegisteredBy || '', vName(c.vehicleId), dName(c.driverId), c.status, (c.deliveryIds || []).length]);
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
    const slaRows=rows.map((record)=>({record,sla:deliverySla(record)}));
    const startLateCount=slaRows.filter(({sla})=>sla.startLate).length;
    const arrivalLateCount=slaRows.filter(({sla})=>sla.arrivalLate).length;
    const header = ['Indicador', 'Valor'];
    const lines = [
      ['Ambiente', env === 'treino' ? 'Treinamento' : 'Operação real'],
      ['Gerado em', dateTimeBR(new Date().toISOString())],
      ['Total de entregas', rows.length],
      ['Entregues no cliente', finalized.length],
      ['Em rota', rows.filter((r) => r.status === 'em_rota').length],
      ['Na loja', rows.filter((r) => r.status === 'na_loja').length],
      ['Retornos registrados', rows.filter((r) => (r.returnAttempts || []).length > 0).length],
      ['Retiradas na loja', rows.filter((r) => r.status === 'retirada_loja').length],
      ['Canceladas', rows.filter((r) => r.status === 'cancelada').length],
      ['Taxa de sucesso %', rows.length ? Math.round((finalized.length / rows.length) * 100) : 0],
      ['Atrasos de saída (limite 2h)',startLateCount],
      ['Atrasos de chegada (limite 3h30)',arrivalLateCount],
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

  $('#exportAllBtn')?.addEventListener('click', async (e) => {
    const env = getEnv();
    const period = readReportPeriod();
    if (period.start && period.end && period.start > period.end) return toast('A data inicial não pode ser maior que a final.', 'error');
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Gerando Excel…';
    try {
      const result = await exportFullExcelReport(env, period);
      toast(`Excel completo gerado com ${result.sheetCount} abas.`, 'success');
    } catch (err) {
      console.error(err);
      toast('Não foi possível gerar o Excel completo.', 'error');
    } finally {
      if (btn.isConnected) { btn.disabled = false; btn.textContent = original; }
    }
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
    const reportSla=rows.map((record)=>({record,sla:deliverySla(record)}));
    const reportStartLate=reportSla.filter(({sla})=>sla.startLate).length;
    const reportArrivalLate=reportSla.filter(({sla})=>sla.arrivalLate).length;

    const area = $('#printArea');
    area.innerHTML = `
      <div class="print-report-head"><img src="assets/brand/nilo-logo.png" alt="Nilo" /><div><span>ÓRBITA · CONTROLE DE ENTREGAS</span><h2>Relatório gerencial</h2><p>${env === 'treino' ? 'Ambiente de treinamento' : 'Operação Real'} · Período: ${period.start ? dateBR(period.start + 'T12:00:00') : 'início'} a ${period.end ? dateBR(period.end + 'T12:00:00') : 'hoje'}</p></div><strong>${dateTimeBR(new Date().toISOString())}</strong></div>
      <h3>Indicadores gerais</h3>
      <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin-bottom:16px">
        <tr><td>Total de entregas</td><td>${rows.length}</td></tr>
        <tr><td>Finalizadas</td><td>${finalized.length}</td></tr>
        <tr><td>Taxa de sucesso</td><td>${rows.length ? Math.round(finalized.length/rows.length*100) : 0}%</td></tr>
        <tr><td>Atrasos de saída (limite 2h)</td><td>${reportStartLate}</td></tr>
        <tr><td>Atrasos de chegada (limite 3h30)</td><td>${reportArrivalLate}</td></tr>
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
    <tr><td>${dateTimeBR(e.at)}</td><td>${escapeHtml(e.operator || 'Não identificado')}<br><small class="delivery-times">${escapeHtml(e.operatorRole || '')}</small></td><td>${escapeHtml(e.entityTable)}</td><td>${e.action}</td><td style="font-family:monospace;font-size:11px">${escapeHtml(e.entityId).slice(0,14)}</td></tr>
  `).join('');
  return `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Operador</th><th>Entidade</th><th>Ação</th><th>ID</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
  const roles = ['Equipe Operacional', 'Líder', 'Consulta', 'Administrador'];
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
  const { listAutoBackups } = await import('./db.js?v=5.4');
  const autoBackups = await listAutoBackups();
  const backupReasonLabel = (reason = '') => reason === 'abertura' ? 'Abertura do sistema' : reason === 'periodico-1min' ? 'Segurança · 1 minuto' : reason ? 'Alteração salva' : 'Automático';
  const autoList = autoBackups.length
    ? autoBackups.map((b) => `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-bottom:1px dashed var(--line)">
          <span style="font-size:12.5px;display:grid;gap:2px"><b>${dateTimeBR(b.at)}</b><small style="color:var(--text-muted)">${backupReasonLabel(b.reason)}</small></span>
          <button class="btn-ghost btn-small auto-restore-btn" data-id="${b.id}">Restaurar este</button>
        </div>`).join('')
    : '<p style="font-size:12px;color:var(--text-muted)">Ainda não rodou nenhum backup automático — o primeiro acontece ao abrir o app.</p>';

  return `
    <div class="stat-card" style="margin-bottom:16px">
      <small>Backup automático reforçado</small>
      <p style="font-size:12.5px;color:var(--text-muted);margin:8px 0">O sistema cria um backup sempre que uma informação é adicionada, editada ou excluída e também faz um snapshot de segurança a cada 1 minuto. Os 50 backups automáticos mais recentes ficam guardados neste aparelho.</p>
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
    const { restoreAutoBackup } = await import('./db.js?v=5.4');
    await restoreAutoBackup(btn.dataset.id);
    toast('Backup automático restaurado.', 'success');
    refreshApp();
  }));
  $('#settingsBackupBtn')?.addEventListener('click', async () => {
    const data = await (await import('./db.js?v=5.4')).exportAll();
    downloadJSON(`orbita-backup-completo-${new Date().toISOString().slice(0,10)}.json`, data);
    toast('Backup completo gerado.', 'success');
  });
  $('#settingsRestoreInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Isso vai substituir os dados atuais pelo conteúdo do backup. Um backup de segurança dos dados atuais será baixado antes. Continuar?')) { e.target.value = ''; return; }
    const currentBackup = await (await import('./db.js?v=5.4')).exportAll();
    downloadJSON(`orbita-backup-seguranca-antes-restauracao-${Date.now()}.json`, currentBackup);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await (await import('./db.js?v=5.4')).importAll(data);
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
