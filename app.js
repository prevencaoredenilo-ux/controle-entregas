import { ensureSeed, saveAutoBackup } from './db.js?v=2.8';
import { $, $$, toast, initTooltips, animateStatCards, performanceProfile } from './helpers.js?v=2.8';
import * as V from './views.js?v=2.8';

let currentView = 'central';
let currentRegistryTab = 'vehicles';
let environment = localStorage.getItem('orbita_env') || 'real';
let operatorName = localStorage.getItem('orbita_operator') || '';
let operatorRole = localStorage.getItem('orbita_operator_role') || 'Administrador';

export function getEnv() { return environment; }
export function getOperatorName() { return operatorName; }
export function getOperatorRole() { return operatorRole; }

function roleKey(role=operatorRole){
  const value=String(role||'').toLowerCase();
  if(value.includes('admin'))return'administrador';
  if(value.includes('líder')||value.includes('lider'))return'lider';
  if(value.includes('consulta'))return'consulta';
  return'equipe';
}
const VIEW_ACCESS={
  administrador:['central','dashboard','search','cycles','km','costs','reports','audit','trash','registry','settings'],
  lider:['central','dashboard','search','cycles','km','costs','reports','registry'],
  equipe:['central','search','cycles','km'],
  consulta:['central','dashboard','search','reports'],
};
export function canAccessView(view){return VIEW_ACCESS[roleKey()]?.includes(view)??false;}
export function canPerform(action){
  const role=roleKey();
  if(role==='administrador'||role==='lider')return true;
  if(role==='consulta')return false;
  return ['delivery_edit','cycle','km'].includes(action);
}

/* ---------- boot ---------- */
function boot() {
  setTimeout(async () => {
    $('#bootScreen').classList.add('hidden');
    await ensureSeed();
    startApp();
  }, 450);

  updateConnection();
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
}

function updateConnection() {
  const dot = $('#connDot'), label = $('#connLabel');
  if (!dot) return;
  if (navigator.onLine) { dot.className = 'conn-dot online'; label.textContent = 'Online • salvo neste aparelho'; }
  else { dot.className = 'conn-dot offline'; label.textContent = 'Offline • salvo neste aparelho'; }
}

/* ---------- app shell ---------- */
function startApp() {
  $('#appShell').classList.remove('hidden');
  renderEnvPill();
  wireNav();
  wireGlobalActions();
  initTooltips(document);
  startLiveClock();
  startAutoBackup();
  render();
}

function startLiveClock() {
  const el = $('#liveClockText');
  const tick = () => { if (el) el.textContent = new Date().toLocaleTimeString('pt-BR'); };
  tick();
  setInterval(tick, 1000);
}

// backup automático: primeiro logo na abertura, depois a cada 10 minutos —
// silencioso, sem download, guardado no próprio IndexedDB (rolling, últimos 5)
function startAutoBackup() {
  saveAutoBackup().catch(() => {});
  setInterval(() => saveAutoBackup().catch(() => {}), 10 * 60 * 1000);
}

function renderEnvPill() {
  $('#envPill').textContent = environment === 'treino' ? '🎓 Treinamento' : '● Operação Real';
  $('#envPill').classList.toggle('treino', environment === 'treino');
  $('#operatorLabel').textContent = operatorName ? `👤 ${operatorName} · ${operatorRole}` : 'Quem está operando?';
  document.body.dataset.operatorRole=roleKey();
  $$('.nav-item[data-view]').forEach((btn)=>btn.classList.toggle('role-hidden',!canAccessView(btn.dataset.view)));
  $('#newDeliveryBtn')?.classList.toggle('role-hidden',!canPerform('delivery_edit'));
}

function wireNav() {
  $$('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if(!canAccessView(btn.dataset.view))return toast('Seu perfil não possui acesso a esta área.','error');
      currentView = btn.dataset.view;
      $$('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b === btn));
      $('#sidebar').classList.remove('open');
      render();
    });
  });
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#envToggleBtn').addEventListener('click', () => {
    environment = environment === 'real' ? 'treino' : 'real';
    localStorage.setItem('orbita_env', environment);
    renderEnvPill();
    toast(environment === 'treino' ? 'Modo Treinamento ativado.' : 'Voltou para Operação Real.', '');
    render();
  });
  $('#operatorBtn').addEventListener('click', openOperatorPicker);
}

async function openOperatorPicker() {
  const { Collaborators } = await import('./db.js?v=2.8');
  const list = (await Collaborators.all()).filter((c) => c.active !== false);
  openModal({
    title: 'Quem está operando agora?',
    subtitle: 'Usado para personalizar a saudação e identificar quem fez cada lançamento.',
    body: `
      <form id="operatorForm">
        ${list.length ? `<label>Colaborador cadastrado
          <select name="existing">
            <option value="">— Escolher da lista —</option>
            ${list.map((c) => `<option value="${escapeAttr(c.name)}">${escapeAttr(c.name)}${c.role ? ' — ' + escapeAttr(c.role) : ''}</option>`).join('')}
          </select>
        </label>` : '<p style="font-size:12.5px;color:var(--text-muted)">Nenhum colaborador cadastrado ainda — cadastre em Cadastros → Colaboradores, ou digite o nome abaixo.</p>'}
        <label>Ou digite o nome<input name="freeName" placeholder="Seu nome" value="${escapeAttr(operatorName)}" /></label>
      </form>`,
    actions: [
      { label: 'Sair', kind: 'ghost', onClick: () => { operatorName = ''; operatorRole='Administrador';localStorage.removeItem('orbita_operator');localStorage.removeItem('orbita_operator_role'); renderEnvPill(); closeModal(); render(); } },
      { label: 'Confirmar', kind: 'primary', onClick: () => {
        const fd = Object.fromEntries(new FormData($('#operatorForm')).entries());
        const name = (fd.existing || fd.freeName || '').trim();
        if (!name) return toast('Escolha ou digite um nome.', 'error');
        operatorName = name;
        operatorRole = list.find((c)=>c.name===fd.existing)?.role || 'Líder';
        localStorage.setItem('orbita_operator', name);
        localStorage.setItem('orbita_operator_role',operatorRole);
        renderEnvPill();
        closeModal();
        render();
      }},
    ],
  });
}
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }

function wireGlobalActions() {
  $('#newDeliveryBtn').addEventListener('click', () => canPerform('delivery_edit')?V.openDeliveryModal():toast('Seu perfil possui acesso somente para consulta.','error'));
  $('#funBreakBtn')?.addEventListener('click', openFunBreak);
}

/* ---------- Cadê o Nilo?: minijogo sem qualquer dado operacional ---------- */
function openFunBreak() {
  openModal({
    title: '🐾 Cadê o Nilo?',
    subtitle: 'O mascote se escondeu em uma das caixas. Você tem uma tentativa!',
    body: `<div class="nilo-hunt-head"><div class="hunt-mascot-peek"><img src="assets/brand/mascote.png" alt="Mascote Nilo" /></div><div><strong>Encontre o mascote</strong><p>As caixas vão embaralhar. Depois, escolha uma delas.</p></div></div><div class="nilo-hunt-stage" id="niloHuntStage"></div>`,
    actions: [{ label: 'Fechar brincadeira', kind: 'ghost', onClick: closeModal }],
  });
  startNiloHunt();
}

function startNiloHunt() {
  const stage = $('#niloHuntStage');
  if (!stage) return;
  const hidingPlace = Math.floor(Math.random() * 3);
  stage.innerHTML = `<div class="hunt-message" id="huntMessage"><span>👀</span><strong>Olhe bem… embaralhando!</strong></div><div class="hunt-boxes">${[0,1,2].map((index) => `<button type="button" class="hunt-box shuffling" data-hunt-box="${index}" disabled><span class="hunt-gift">🎁</span><small>Caixa ${index + 1}</small></button>`).join('')}</div><div class="hunt-replay hidden" id="huntReplay"><button type="button" class="btn-primary">Jogar outra vez</button></div>`;
  setTimeout(() => {
    $$('#niloHuntStage .hunt-box').forEach((box) => { box.disabled = false; box.classList.remove('shuffling'); box.classList.add('ready'); });
    const message = $('#huntMessage');
    if (message) message.innerHTML = '<span>👇</span><strong>Agora escolha uma caixa!</strong>';
  }, 850);
  $$('#niloHuntStage [data-hunt-box]').forEach((box) => box.addEventListener('click', () => {
    if (stage.dataset.finished === '1') return;
    stage.dataset.finished = '1';
    const selected = Number(box.dataset.huntBox);
    $$('#niloHuntStage .hunt-box').forEach((item) => {
      item.disabled = true;
      const index = Number(item.dataset.huntBox);
      item.classList.remove('ready');
      item.classList.add('revealed', index === hidingPlace ? 'winner' : 'empty-box');
      item.querySelector('.hunt-gift').innerHTML = index === hidingPlace ? '<img src="assets/brand/mascote.png" alt="Nilo encontrado" />' : '✨';
    });
    const won = selected === hidingPlace;
    const message = $('#huntMessage');
    if (message) message.innerHTML = won ? '<span>🏆</span><strong>Você encontrou o Nilo!</strong><small>Boa memória! O mascote não escapou desta vez.</small>' : `<span>😄</span><strong>Quase! Ele estava na caixa ${hidingPlace + 1}.</strong><small>O Nilo foi mais rápido nesta rodada.</small>`;
    if (won) stage.insertAdjacentHTML('beforeend', `<div class="hunt-confetti" aria-hidden="true">${new Array(18).fill('<i></i>').join('')}</div>`);
    $('#huntReplay')?.classList.remove('hidden');
    $('#huntReplay button')?.addEventListener('click', () => { stage.dataset.finished = '0'; startNiloHunt(); });
  }));
}

/* ---------- modal genérico ---------- */
export function openModal({ title, subtitle = '', body, actions = [] }) {
  $('#modalTitle').textContent = title;
  $('#modalSubtitle').textContent = subtitle;
  $('#modalBody').innerHTML = body;
  $('#modalActions').innerHTML = actions.map((a, i) => `<button class="btn-${a.kind === 'primary' ? 'primary' : a.kind === 'danger' ? 'danger-text' : 'ghost'}" data-idx="${i}">${a.label}</button>`).join('');
  $$('#modalActions button').forEach((btn, i) => {
    let busy = false;
    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true; btn.disabled = true;
      try { await actions[i].onClick(); } finally { busy = false; if (btn.isConnected) btn.disabled = false; }
    });
  });
  $('#modalWrap').classList.remove('hidden');
  $('#modalWrap').setAttribute('aria-hidden', 'false');
}
export function closeModal() {
  $('#modalWrap').classList.add('hidden');
  $('#modalWrap').setAttribute('aria-hidden', 'true');
}
$_modalBackdropClose();
function $_modalBackdropClose() {
  document.addEventListener('DOMContentLoaded', () => {
    $('#modalWrap')?.addEventListener('click', (e) => { if (e.target.id === 'modalWrap') closeModal(); });
    $('#modalClose')?.addEventListener('click', closeModal);
  });
}

export function refreshApp() { render(); }

window.__orbitaGoToSearch = (query) => {
  currentView = 'search';
  $$('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === 'search'));
  render().then(() => {
    const input = $('#searchInput');
    if (input && query) { input.value = query; input.dispatchEvent(new Event('input')); }
  });
};

/* ---------- router ---------- */
async function render() {
  const view = $('#view');
  const title = $('#viewTitle');
  const sub = $('#viewSubtitle');

  const routes = {
    central: ['Central Operacional', 'Sala de controle: SLAs, ciclos, retornos assistidos, KM e fechamento do dia.', V.renderCentral, V.wireCentralEvents],
    dashboard: ['Centro de Inteligência', 'Operação, SLA de saída e chegada, ciclos, frota, financeiro, qualidade e previsões.', V.renderDashboard, V.wireDashboardEvents],
    search: ['Busca geral', 'Pesquise por qualquer campo da entrega.', V.renderSearch, V.wireSearchEvents],
    cycles: ['Ciclos', 'Saídas em andamento e finalizadas.', V.renderCycles, V.wireCyclesEvents],
    km: ['Quilometragem', 'Controle de KM por veículo e expediente.', V.renderKm, V.wireKmEvents],
    costs: ['Custos e financeiro', 'Lançamentos e resultado financeiro.', V.renderCosts, V.wireCostsEvents],
    reports: ['Relatórios', 'Gerencial (impressão/PDF) e analítico (Excel/CSV).', V.renderReports, V.wireReportsEvents],
    audit: ['Auditoria', 'Todo evento relevante fica registrado, sem edição posterior.', V.renderAudit, null],
    trash: ['Lixeira', 'Nada é apagado de verdade até você restaurar ou excluir de vez.', V.renderTrash, V.wireTrashEvents],
    registry: ['Cadastros', 'Veículos, entregadores, bairros, categorias e motivos.', () => V.renderRegistry(currentRegistryTab), () => V.wireRegistryEvents(currentRegistryTab, (tab) => { currentRegistryTab = tab; render(); })],
    settings: ['Configurações', 'Empresa, backup e restauração.', V.renderSettings, V.wireSettingsEvents],
  };

  if(!canAccessView(currentView)){currentView='central';$$('.nav-item[data-view]').forEach((b)=>b.classList.toggle('active',b.dataset.view==='central'));}
  const [t, s, renderFn, wireFn] = routes[currentView] || routes.central;
  title.textContent = t;
  sub.textContent = s;
  view.innerHTML = await renderFn();
  if (wireFn) wireFn();
  updateBadges();
  updateMascot();
  animateStatCards(view);
}

async function updateBadges() {
  const { Deliveries, Cycles } = await import('./db.js?v=2.8');
  const rows = await Deliveries.active(environment);
  $('#pendingBadge').textContent = rows.filter((r) => r.status === 'na_loja').length;
  const trashed = await Deliveries.trashed(environment);
  $('#trashBadge').textContent = trashed.length;
  const cycles = (await Cycles.all()).filter((c) => c.environment === environment && c.status === 'aberto' && !c.deletedAt);
  $('#cyclesBadge').textContent = cycles.length;
}

/* ---------- mascote (humor conforme desempenho do dia) ---------- */
async function updateMascot() {
  const box = $('#mascotMood');
  if (!box) return;
  box.textContent = performanceProfile(Number(box.dataset.score || 0)).mood;
}

if ('serviceWorker' in navigator) {
  let refreshingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshingForUpdate) return;
    refreshingForUpdate = true;
    window.location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=2.8', { updateViaCache: 'none' }).then((registration) => registration.update()).catch(() => {}));
}

boot();
