import { ensureSeed, saveAutoBackup } from './db.js?v=2.9';
import { $, $$, toast, initTooltips, animateStatCards, performanceProfile } from './helpers.js?v=2.9';
import * as V from './views.js?v=2.9';

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
  const { Collaborators } = await import('./db.js?v=2.9');
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

/* ---------- Prevenção em Foco: conhecimento rápido + curiosidades ---------- */
const PREVENTION_QUESTIONS = [
  { q:'Ao identificar divergência entre o cupom e a mercadoria que está saindo, qual é a melhor primeira ação?', options:['Liberar a saída e conferir depois','Pausar a saída, conferir os itens e seguir o procedimento de divergência','Pedir ao cliente para resolver no caixa','Ignorar se a diferença for pequena'], correct:1, note:'Divergências devem ser tratadas antes da saída. A conferência e o registro evitam perda financeira e retrabalho.' },
  { q:'Um produto avariado é encontrado na área de venda. O que fazer?', options:['Deixar no local até o fim do turno','Descartar imediatamente sem registro','Segregar o item, identificar a ocorrência e encaminhar conforme o procedimento','Colocar em promoção sem autorização'], correct:2, note:'Segregar e registrar preserva rastreabilidade e evita que um item impróprio volte à venda.' },
  { q:'Qual atitude é mais adequada diante de um comportamento suspeito na loja?', options:['Confrontar a pessoa imediatamente','Observar com discrição e acionar o protocolo/responsável de Prevenção','Filmar com o celular pessoal','Comentar com outros clientes'], correct:1, note:'A atuação deve ser discreta, segura e baseada no procedimento interno, evitando confronto desnecessário.' },
  { q:'Por que a saída de emergência precisa permanecer livre?', options:['Apenas por estética','Para facilitar reposição','Para permitir evacuação rápida e segura em uma emergência','Somente durante auditorias'], correct:2, note:'Rotas de fuga desobstruídas são essenciais para a segurança de clientes e colaboradores.' },
  { q:'Ao perceber diferença de estoque, qual prática é mais segura?', options:['Ajustar a quantidade sem registrar','Registrar a divergência e investigar a causa antes do ajuste definitivo','Aguardar o próximo inventário','Apagar o histórico antigo'], correct:1, note:'Rastreabilidade é central em Prevenção de Perdas: registrar, investigar e só então corrigir.' },
  { q:'Na liberação de uma entrega, o que ajuda a prevenir perdas?', options:['Conferir documento/cupom, volumes e destino antes da saída','Liberar primeiro e preencher depois','Conferir apenas o valor da taxa','Usar somente a memória do entregador'], correct:0, note:'A conferência de documentos, volumes e destino reduz trocas, faltas, sobras e retornos.' },
  { q:'Um prestador desconhecido pede acesso a uma área restrita. Qual conduta é adequada?', options:['Liberar se ele estiver uniformizado','Direcionar à recepção/responsável e validar autorização','Entregar a chave para agilizar','Pedir que entre por outra porta'], correct:1, note:'Acesso restrito exige validação de identidade e autorização, mesmo quando a pessoa aparenta pertencer a uma empresa conhecida.' },
  { q:'Uma diferença de caixa é identificada. O que deve ser priorizado?', options:['Esconder a diferença para evitar conflito','Preservar informações, conferir os registros e comunicar o responsável','Dividir o valor entre a equipe','Alterar o fechamento para zerar'], correct:1, note:'Preservar evidências e registros permite identificar a origem da divergência e corrigi-la de forma justa.' },
  { q:'Qual é um objetivo amplo da Prevenção de Perdas?', options:['Somente impedir furtos','Proteger pessoas, processos, mercadorias e reduzir perdas operacionais','Apenas controlar o caixa','Substituir a liderança da loja'], correct:1, note:'Prevenção de Perdas vai além de furtos: envolve segurança, processos, estoque, avarias, fraudes, erros e eficiência.' },
  { q:'Ao encontrar mercadoria fora da validade, qual ação é correta?', options:['Esconder atrás de produtos novos','Retirar da venda e seguir o processo de segregação/registro','Vender com desconto automaticamente','Manter até o fim do dia'], correct:1, note:'Produto vencido deve ser retirado de exposição e tratado conforme o procedimento interno, com registro quando aplicável.' },
  { q:'Por que registrar ocorrências de forma detalhada é importante?', options:['Apenas para preencher relatório','Para criar histórico, identificar padrões e apoiar ações preventivas','Para aumentar o número de tarefas','Somente quando houver prejuízo alto'], correct:1, note:'Dados bem registrados permitem encontrar causas recorrentes e agir antes que a perda se repita.' },
  { q:'Qual atitude ajuda a reduzir perdas por erro operacional?', options:['Padronizar conferências e seguir etapas críticas','Mudar o processo todos os dias','Evitar registrar pequenos erros','Depender de uma única pessoa'], correct:0, note:'Processos padronizados e conferências em pontos críticos reduzem falhas e tornam a operação mais previsível.' },
];
const GENERAL_CURIOSITIES = [
  { q:'Qual planeta é conhecido como Planeta Vermelho?', options:['Vênus','Marte','Júpiter','Mercúrio'], correct:1, note:'Marte tem aparência avermelhada por causa de óxidos de ferro presentes em sua superfície.' },
  { q:'Qual é o maior oceano da Terra?', options:['Atlântico','Índico','Pacífico','Ártico'], correct:2, note:'O Oceano Pacífico é o maior e também o mais profundo do planeta.' },
  { q:'Quantos lados tem um hexágono?', options:['5','6','7','8'], correct:1, note:'“Hexa” indica seis; por isso, um hexágono tem seis lados.' },
  { q:'Qual gás as plantas absorvem principalmente durante a fotossíntese?', options:['Oxigênio','Nitrogênio','Dióxido de carbono','Hidrogênio'], correct:2, note:'Na fotossíntese, as plantas utilizam dióxido de carbono, água e luz para produzir energia química.' },
  { q:'Em qual continente fica o Egito?', options:['África','Ásia','Europa','América'], correct:0, note:'A maior parte do território egípcio fica no nordeste da África; a Península do Sinai fica na Ásia.' },
  { q:'Qual é o animal terrestre mais rápido em curtas distâncias?', options:['Leão','Guepardo','Antílope','Cavalo'], correct:1, note:'O guepardo pode atingir velocidades acima de 90 km/h em acelerações curtas.' },
  { q:'Qual instrumento mede a temperatura?', options:['Barômetro','Termômetro','Higrômetro','Anemômetro'], correct:1, note:'O termômetro mede temperatura; barômetro mede pressão e anemômetro mede velocidade do vento.' },
  { q:'Qual é a capital do Brasil?', options:['Rio de Janeiro','São Paulo','Brasília','Salvador'], correct:2, note:'Brasília é a capital federal desde 21 de abril de 1960.' },
  { q:'Qual é o maior órgão do corpo humano?', options:['Fígado','Pulmão','Pele','Cérebro'], correct:2, note:'A pele é o maior órgão do corpo humano e atua como barreira de proteção.' },
  { q:'Quantos minutos há em duas horas e meia?', options:['120','130','150','180'], correct:2, note:'Duas horas = 120 minutos; mais 30 minutos = 150.' },
];

function openFunBreak() {
  openModal({
    title: '🛡️ Prevenção em Foco',
    subtitle: 'Treino rápido de Prevenção de Perdas e curiosidades gerais — escolha uma resposta e veja a explicação.',
    body: `<div class="knowledge-quiz" id="knowledgeQuiz">
      <div class="quiz-mode-row">
        <button type="button" class="quiz-mode-btn active" data-quiz-mode="prevencao"><span>🛡️</span><strong>Prevenção de Perdas</strong><small>Situações do dia a dia</small></button>
        <button type="button" class="quiz-mode-btn" data-quiz-mode="geral"><span>💡</span><strong>Curiosidades gerais</strong><small>Conhecimento rápido</small></button>
      </div>
      <div class="quiz-card" id="quizCard"></div>
    </div>`,
    actions: [{ label: 'Fechar', kind: 'ghost', onClick: closeModal }],
  });
  startKnowledgeQuiz('prevencao');
  $$('.quiz-mode-btn').forEach((btn)=>btn.addEventListener('click',()=>{
    $$('.quiz-mode-btn').forEach((b)=>b.classList.toggle('active',b===btn));
    startKnowledgeQuiz(btn.dataset.quizMode);
  }));
}

let quizState = { mode:'prevencao', index:0, score:0, answered:false, order:[] };
function startKnowledgeQuiz(mode='prevencao') {
  const bank = mode === 'geral' ? GENERAL_CURIOSITIES : PREVENTION_QUESTIONS;
  const order = bank.map((_,i)=>i).sort(()=>Math.random()-.5);
  quizState = { mode, index:0, score:0, answered:false, order };
  renderKnowledgeQuestion();
}
function renderKnowledgeQuestion() {
  const card=$('#quizCard'); if(!card)return;
  const bank=quizState.mode==='geral'?GENERAL_CURIOSITIES:PREVENTION_QUESTIONS;
  const q=bank[quizState.order[quizState.index % quizState.order.length]];
  card.innerHTML=`<div class="quiz-progress"><span>${quizState.mode==='geral'?'CURIOSIDADE GERAL':'PREVENÇÃO DE PERDAS'}</span><strong>${quizState.index+1}/${Math.min(quizState.order.length,10)}</strong></div>
    <h3>${escapeAttr(q.q)}</h3>
    <div class="quiz-options">${q.options.map((opt,i)=>`<button type="button" class="quiz-option" data-answer="${i}"><i>${String.fromCharCode(65+i)}</i><span>${escapeAttr(opt)}</span></button>`).join('')}</div>
    <div class="quiz-feedback hidden" id="quizFeedback"></div>
    <div class="quiz-footer"><span>Acertos: <strong id="quizScore">${quizState.score}</strong></span><button type="button" class="btn-primary btn-small hidden" id="quizNextBtn">Próxima pergunta ›</button></div>`;
  $$('.quiz-option').forEach((btn)=>btn.addEventListener('click',()=>answerKnowledgeQuestion(Number(btn.dataset.answer),q)));
}
function answerKnowledgeQuestion(selected,q){
  if(quizState.answered)return; quizState.answered=true;
  const correct=selected===q.correct; if(correct)quizState.score++;
  $$('.quiz-option').forEach((btn)=>{const i=Number(btn.dataset.answer);btn.disabled=true;if(i===q.correct)btn.classList.add('correct');else if(i===selected)btn.classList.add('wrong');});
  const feedback=$('#quizFeedback'); feedback?.classList.remove('hidden');
  if(feedback)feedback.innerHTML=`<div class="${correct?'quiz-hit':'quiz-miss'}"><span>${correct?'✓':'!'}</span><div><strong>${correct?'Resposta correta!':'Quase — veja a resposta certa.'}</strong><p>${escapeAttr(q.note)}</p></div></div>`;
  if($('#quizScore'))$('#quizScore').textContent=quizState.score;
  const next=$('#quizNextBtn'); next?.classList.remove('hidden');
  next?.addEventListener('click',()=>{quizState.index=(quizState.index+1)%Math.min(quizState.order.length,10);quizState.answered=false;renderKnowledgeQuestion();});
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
    dashboard: ['Central de Inteligência', 'Operação, SLA de saída e chegada, ciclos, frota, financeiro, qualidade e previsões.', V.renderDashboard, V.wireDashboardEvents],
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
  const { Deliveries, Cycles } = await import('./db.js?v=2.9');
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
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=2.9', { updateViaCache: 'none' }).then((registration) => registration.update()).catch(() => {}));
}

boot();
