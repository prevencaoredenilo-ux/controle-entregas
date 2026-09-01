import { ensureSeed, saveAutoBackup } from './db.js';
import { $, $$, toast, initTooltips, animateStatCards } from './helpers.js';
import * as V from './views.js';

let currentView = 'central';
let currentRegistryTab = 'vehicles';
let environment = localStorage.getItem('orbita_env') || 'real';
let operatorName = localStorage.getItem('orbita_operator') || '';

export function getEnv() { return environment; }
export function getOperatorName() { return operatorName; }

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
  $('#operatorLabel').textContent = operatorName ? `👤 ${operatorName}` : 'Quem está operando?';
}

function wireNav() {
  $$('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
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
  const { Collaborators } = await import('./db.js');
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
      { label: 'Sair', kind: 'ghost', onClick: () => { operatorName = ''; localStorage.removeItem('orbita_operator'); renderEnvPill(); closeModal(); render(); } },
      { label: 'Confirmar', kind: 'primary', onClick: () => {
        const fd = Object.fromEntries(new FormData($('#operatorForm')).entries());
        const name = (fd.existing || fd.freeName || '').trim();
        if (!name) return toast('Escolha ou digite um nome.', 'error');
        operatorName = name;
        localStorage.setItem('orbita_operator', name);
        renderEnvPill();
        closeModal();
        render();
      }},
    ],
  });
}
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }

function wireGlobalActions() {
  $('#newDeliveryBtn').addEventListener('click', () => V.openDeliveryModal());
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
    central: ['Central Operacional', 'O essencial da operação de hoje.', V.renderCentral, V.wireCentralEvents],
    dashboard: ['Dashboard', 'Panorama geral da operação.', V.renderDashboard, null],
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
  const { Deliveries, Cycles } = await import('./db.js');
  const rows = await Deliveries.active(environment);
  $('#pendingBadge').textContent = rows.filter((r) => r.status === 'na_loja').length;
  const trashed = await Deliveries.trashed(environment);
  $('#trashBadge').textContent = trashed.length;
  const cycles = (await Cycles.all()).filter((c) => c.status === 'aberto' && !c.deletedAt);
  $('#cyclesBadge').textContent = cycles.length;
}

/* ---------- mascote (humor conforme desempenho do dia) ---------- */
async function updateMascot() {
  const box = $('#mascotMood');
  if (!box) return;
  const { Deliveries } = await import('./db.js');
  const rows = await Deliveries.active(environment);
  const finalized = rows.filter((r) => r.status === 'finalizada').length;
  const problems = rows.filter((r) => ['retorno', 'cancelada'].includes(r.status)).length;
  const total = rows.length || 1;
  const ratio = finalized / total;
  const mood = problems > finalized ? '😟' : ratio > 0.7 ? '😄' : ratio > 0.3 ? '🙂' : '😐';
  box.textContent = mood;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

boot();
