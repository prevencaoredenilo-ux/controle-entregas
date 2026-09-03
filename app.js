import { ensureSeed, saveAutoBackup, enableWriteThroughAutoBackup } from './db.js?v=5.12';
import { $, $$, toast, initTooltips, animateStatCards, performanceProfile } from './helpers.js?v=5.12';
import * as V from './views.js?v=5.12';

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
    await startApp();
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
async function startApp() {
  $('#appShell').classList.remove('hidden');
  renderEnvPill();
  wireNav();
  wireGlobalActions();
  await V.normalizeReturnQueueStatus?.();
  enableWriteThroughAutoBackup();
  startKnowledgeTicker();
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

// backup automático v5.6:
// 1) um snapshot logo na abertura;
// 2) um snapshot a cada alteração relevante, disparado pela camada de dados;
// 3) um snapshot de segurança a cada 1 minuto, mesmo sem novas alterações.
function startAutoBackup() {
  saveAutoBackup('abertura').catch(() => {});
  setInterval(() => saveAutoBackup('periodico-1min').catch(() => {}), 60 * 1000);
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
  const { Collaborators } = await import('./db.js?v=5.12');
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

/* ---------- Perguntas automáticas: 100 Prevenção + 100 Curiosidades ---------- */
const PREVENTION_QUESTIONS = [{"q":"O que é Prevenção de Perdas no varejo?","answer":"É o conjunto de ações para reduzir perdas financeiras, operacionais e de estoque.","difficulty":"FÁCIL","note":"Vai muito além de furto: envolve processos, validade, avarias, estoque, caixa, segurança e auditoria."},{"q":"O que significa FIFO?","answer":"First In, First Out — primeiro que entra, primeiro que sai.","difficulty":"FÁCIL","note":"É útil quando a ordem de entrada deve orientar a saída do estoque."},{"q":"O que significa FEFO?","answer":"First Expire, First Out — primeiro que vence, primeiro que sai.","difficulty":"FÁCIL","note":"É especialmente importante para alimentos, medicamentos e outros itens com validade."},{"q":"Qual sigla em português corresponde ao FIFO?","answer":"PEPS — Primeiro que Entra, Primeiro que Sai.","difficulty":"FÁCIL","note":"PEPS e FIFO expressam a mesma lógica de movimentação por ordem de entrada."},{"q":"Qual sigla em português corresponde ao FEFO?","answer":"PVPS — Primeiro que Vence, Primeiro que Sai.","difficulty":"FÁCIL","note":"PVPS prioriza a data de validade, não apenas a data de recebimento."},{"q":"O que é ruptura de estoque?","answer":"É quando o cliente procura um item e ele não está disponível para venda.","difficulty":"FÁCIL","note":"Ruptura pode ocorrer mesmo havendo saldo no sistema, por erro de estoque, reposição ou localização."},{"q":"O que é uma avaria?","answer":"É um dano que reduz ou elimina a condição de venda de um produto.","difficulty":"FÁCIL","note":"Amassados, vazamentos, quebras e embalagens comprometidas são exemplos comuns."},{"q":"O que deve ser feito com um produto vencido encontrado na área de venda?","answer":"Retirar da venda, segregar e seguir o procedimento de registro/destinação.","difficulty":"FÁCIL","note":"Produto vencido não deve permanecer disponível ao cliente."},{"q":"O que significa segregar uma mercadoria?","answer":"Separá-la fisicamente dos produtos aptos para venda, com identificação adequada.","difficulty":"FÁCIL","note":"Segregação evita que itens vencidos, avariados ou em análise retornem à venda por engano."},{"q":"O que é rastreabilidade?","answer":"É a capacidade de reconstruir o histórico e o caminho de um produto ou ocorrência.","difficulty":"MÉDIA","note":"Lote, datas, documentos, responsáveis e movimentações tornam a investigação mais confiável."},{"q":"Para que serve um inventário de estoque?","answer":"Para comparar o estoque físico com o saldo registrado no sistema.","difficulty":"FÁCIL","note":"A diferença encontrada ajuda a medir acuracidade e identificar perdas ou erros."},{"q":"O que é inventário rotativo?","answer":"É a contagem periódica de partes do estoque, sem esperar um inventário geral.","difficulty":"MÉDIA","note":"Permite encontrar desvios mais cedo e corrigir causas recorrentes."},{"q":"Ao encontrar uma divergência de estoque, qual deve ser a primeira atitude?","answer":"Registrar e investigar a causa antes de fazer um ajuste definitivo.","difficulty":"FÁCIL","note":"Ajustar sem investigar pode esconder o problema e fazê-lo se repetir."},{"q":"O que é perda conhecida ou identificada?","answer":"É uma perda cuja causa foi registrada, como avaria, vencimento ou quebra.","difficulty":"MÉDIA","note":"Quando a causa é conhecida, fica mais fácil agir sobre o processo que gerou a perda."},{"q":"O que é perda desconhecida ou não identificada?","answer":"É a diferença de estoque cuja causa não foi comprovada ou registrada.","difficulty":"MÉDIA","note":"Pode envolver erros de processo, cadastro, contagem, fraude ou outras causas ainda não identificadas."},{"q":"O que é quebra operacional?","answer":"É uma perda causada pela própria operação, como manuseio inadequado, armazenamento ou processo incorreto.","difficulty":"MÉDIA","note":"Nem toda perda é furto; muitos prejuízos nascem de falhas simples de rotina."},{"q":"No recebimento, o que deve ser confrontado antes de aceitar a mercadoria?","answer":"Pedido/nota fiscal, quantidade, condição física e produto efetivamente recebido.","difficulty":"FÁCIL","note":"Conferir na entrada impede que uma divergência já nasça dentro do estoque."},{"q":"Por que um lacre violado em uma carga merece atenção?","answer":"Porque pode indicar abertura não autorizada ou comprometimento da integridade da carga.","difficulty":"FÁCIL","note":"O correto é registrar a condição e seguir o protocolo antes de liberar o recebimento."},{"q":"Para que serve o número do lote de um produto?","answer":"Para identificar um conjunto de produção e permitir rastreamento.","difficulty":"MÉDIA","note":"O lote é essencial em recalls, investigação de qualidade e controle de validade."},{"q":"O que significa shelf life?","answer":"É o período em que o produto mantém condições adequadas dentro de sua vida útil.","difficulty":"DIFÍCIL","note":"No varejo, conhecer a vida útil ajuda a planejar compra, exposição e giro antes da validade."},{"q":"Qual regra deve prevalecer para produtos com validade curta: FIFO ou FEFO?","answer":"FEFO/PVPS.","difficulty":"MÉDIA","note":"Se dois lotes chegaram em ordem diferente, deve sair primeiro o que vence antes."},{"q":"Uma embalagem está violada, mas o produto ainda está dentro da validade. Pode continuar à venda?","answer":"Não automaticamente; deve ser retirado, segregado e avaliado conforme o procedimento.","difficulty":"FÁCIL","note":"Validade não substitui integridade de embalagem e segurança do produto."},{"q":"Por que controlar a temperatura de produtos refrigerados ajuda a prevenir perdas?","answer":"Porque desvios de temperatura podem reduzir a vida útil e comprometer a segurança/qualidade.","difficulty":"MÉDIA","note":"Um produto pode parecer normal e ainda assim ter sido afetado por quebra da cadeia fria."},{"q":"O que é cadeia fria?","answer":"É a manutenção contínua da faixa adequada de temperatura do produto, do fornecedor até o consumidor.","difficulty":"MÉDIA","note":"Uma interrupção pode gerar descarte, reclamação e risco à qualidade."},{"q":"O que é endereçamento de estoque?","answer":"É a definição de locais identificados para guardar e localizar produtos.","difficulty":"MÉDIA","note":"Bom endereçamento reduz extravios, tempo de procura e divergências de contagem."},{"q":"O que é uma contagem cega de estoque?","answer":"É uma contagem em que o conferente não vê previamente o saldo esperado.","difficulty":"DIFÍCIL","note":"Isso reduz a tendência de “ajustar mentalmente” a contagem ao número do sistema."},{"q":"Por que a dupla conferência pode ser útil em processos críticos?","answer":"Porque reduz a chance de um único erro passar sem ser percebido.","difficulty":"MÉDIA","note":"Ela deve ser aplicada onde o risco justifica o custo de uma segunda checagem."},{"q":"O que deve acompanhar uma transferência de mercadoria entre setores ou lojas?","answer":"Registro da origem, destino, itens, quantidades e responsáveis.","difficulty":"MÉDIA","note":"Movimentação sem registro pode criar sobra em um local e falta em outro."},{"q":"Ao devolver mercadoria ao fornecedor, por que a contagem na saída é importante?","answer":"Para garantir que a quantidade física corresponda ao documento de devolução.","difficulty":"FÁCIL","note":"A divergência na devolução também é uma fonte de perda."},{"q":"Ao detectar diferença de caixa, o que deve ser feito?","answer":"Preservar os registros, conferir as operações e comunicar o responsável.","difficulty":"FÁCIL","note":"Alterar valores apenas para “zerar” a diferença elimina a rastreabilidade."},{"q":"O que é sangria de caixa?","answer":"É a retirada controlada de valores do caixa, com registro e procedimento definido.","difficulty":"MÉDIA","note":"Sangrias reduzem exposição de numerário, mas precisam ser rastreáveis."},{"q":"Por que cancelamentos frequentes no caixa merecem acompanhamento?","answer":"Porque podem indicar erro de processo, treinamento insuficiente ou comportamento fora do padrão.","difficulty":"MÉDIA","note":"O indicador não prova fraude sozinho; ele sinaliza onde investigar."},{"q":"Uma troca ou devolução deve ocorrer sem registro porque o cliente tem razão?","answer":"Não. Mesmo quando legítima, a movimentação precisa ser registrada.","difficulty":"FÁCIL","note":"O registro protege cliente, operador e estoque."},{"q":"Por que áreas restritas precisam de controle de acesso?","answer":"Para limitar o acesso a pessoas autorizadas e reduzir riscos a pessoas, ativos e informações.","difficulty":"FÁCIL","note":"Uniforme ou aparência conhecida não substituem autorização."},{"q":"Um prestador desconhecido pede acesso ao estoque. O que fazer?","answer":"Validar identidade e autorização com o responsável antes de liberar.","difficulty":"FÁCIL","note":"Pressa ou uniforme não são prova suficiente de autorização."},{"q":"Qual é a conduta adequada diante de comportamento suspeito na loja?","answer":"Observar com discrição e seguir o protocolo interno, acionando o responsável.","difficulty":"FÁCIL","note":"Confronto improvisado pode aumentar o risco para clientes e equipe."},{"q":"Prevenção de Perdas significa abordar qualquer pessoa que pareça suspeita?","answer":"Não. A atuação deve seguir fatos, procedimentos e critérios objetivos.","difficulty":"MÉDIA","note":"Prevenção eficiente evita julgamentos pessoais e prioriza segurança e evidências."},{"q":"Antes de uma entrega sair da loja, o que deve ser conferido?","answer":"Documento/cupom, volumes, destino e identificação da entrega.","difficulty":"FÁCIL","note":"Uma conferência curta na saída evita trocas, faltas e retornos."},{"q":"Por que contar volumes de uma entrega é importante?","answer":"Para confirmar que tudo que deveria sair realmente saiu e chegou ao destino correto.","difficulty":"FÁCIL","note":"Volume perdido ou trocado gera retrabalho e perda financeira."},{"q":"Qual a utilidade de registrar PDV, DOC e cupom na entrega?","answer":"Aumentar a rastreabilidade entre a compra, o caixa e a entrega.","difficulty":"MÉDIA","note":"Identificadores facilitam localizar rapidamente uma ocorrência específica."},{"q":"Um endereço está incompleto antes da saída. Qual a melhor decisão?","answer":"Corrigir ou confirmar o endereço antes de colocar a entrega em rota.","difficulty":"FÁCIL","note":"Sair com dado incompleto aumenta atraso, retorno e custo operacional."},{"q":"Quando uma entrega retorna à loja, por que registrar o motivo?","answer":"Para manter o histórico e identificar causas recorrentes de retorno.","difficulty":"FÁCIL","note":"Sem motivo registrado, o retorno vira apenas um número e não gera aprendizado."},{"q":"Uma reentrega deve apagar o histórico da primeira tentativa?","answer":"Não. A nova tentativa deve manter o histórico anterior.","difficulty":"FÁCIL","note":"Rastreabilidade exige saber quantas tentativas ocorreram e por quê."},{"q":"Por que entregas de alto valor ou muitos volumes merecem conferência reforçada?","answer":"Porque o impacto de um erro tende a ser maior.","difficulty":"MÉDIA","note":"Controles podem ser proporcionais ao risco da operação."},{"q":"O que é um produto de alto risco de perda?","answer":"É um item com maior probabilidade ou impacto de perda, conforme histórico, valor, tamanho ou demanda.","difficulty":"MÉDIA","note":"A classificação deve usar dados e contexto da loja, não apenas impressão pessoal."},{"q":"Por que a exposição excessiva de itens de alto risco pode aumentar perdas?","answer":"Porque aumenta a quantidade disponível sem controle direto e dificulta perceber desvios rapidamente.","difficulty":"MÉDIA","note":"A quantidade exposta pode ser equilibrada com reposição mais frequente."},{"q":"O que é planograma?","answer":"É uma orientação de como os produtos devem ser organizados e posicionados na área de venda.","difficulty":"MÉDIA","note":"Além de venda, um bom planograma pode facilitar contagem, reposição e identificação de ruptura."},{"q":"Qual é o papel principal do CFTV na Prevenção de Perdas?","answer":"Apoiar monitoramento, investigação e verificação de ocorrências conforme as regras da empresa.","difficulty":"MÉDIA","note":"Câmeras são uma ferramenta; processos e pessoas continuam essenciais."},{"q":"Por que preservar evidências de uma ocorrência é importante?","answer":"Para permitir análise confiável do que aconteceu.","difficulty":"MÉDIA","note":"Alterar documentos, imagens ou registros pode inviabilizar a apuração correta."},{"q":"O que um bom registro de ocorrência deve responder?","answer":"O que ocorreu, quando, onde, quem participou e quais ações foram tomadas.","difficulty":"FÁCIL","note":"Quanto mais objetivo e verificável o registro, mais útil ele será depois."},{"q":"Para que serve uma auditoria de processo?","answer":"Para verificar se o procedimento está sendo cumprido e se os controles funcionam.","difficulty":"MÉDIA","note":"Auditoria não é só procurar erro; também identifica oportunidades de melhoria."},{"q":"O que é causa raiz?","answer":"É a causa fundamental que, se tratada, reduz a chance de o problema se repetir.","difficulty":"MÉDIA","note":"Corrigir apenas o efeito pode fazer o mesmo desvio voltar no dia seguinte."},{"q":"Como funciona a técnica dos “5 Porquês”?","answer":"Pergunta-se sucessivamente por que o problema ocorreu até chegar a uma causa mais profunda.","difficulty":"DIFÍCIL","note":"Não precisa haver exatamente cinco perguntas; o objetivo é sair do sintoma e chegar à causa."},{"q":"Se a perda em reais caiu, mas as vendas também caíram muito, qual indicador ajuda a comparar melhor?","answer":"A perda percentual sobre vendas ou outro denominador relevante.","difficulty":"DIFÍCIL","note":"Indicadores relativos ajudam a comparar períodos de tamanhos diferentes."},{"q":"O que significa shrinkage no varejo?","answer":"É a redução/perda de estoque em relação ao que deveria existir, por causas identificadas ou não.","difficulty":"DIFÍCIL","note":"O termo é comum em gestão de perdas e pode incluir furto, erro, avaria e falhas de processo."},{"q":"Por que uma pequena perda repetida diariamente pode ser mais grave que uma perda grande isolada?","answer":"Porque a recorrência acumula impacto e indica falha estrutural.","difficulty":"MÉDIA","note":"Frequência e tendência são tão importantes quanto o valor de uma ocorrência."},{"q":"O que é giro de estoque?","answer":"É a velocidade com que o estoque é vendido e reposto em determinado período.","difficulty":"MÉDIA","note":"Giro baixo pode elevar risco de vencimento, obsolescência e capital parado."},{"q":"Como excesso de estoque pode gerar perda?","answer":"Pode aumentar vencimento, avaria, manuseio, ocupação e dificuldade de controle.","difficulty":"MÉDIA","note":"Comprar mais nem sempre significa vender mais."},{"q":"O que pode indicar um estoque negativo no sistema?","answer":"Movimentação registrada fora de ordem, cadastro incorreto, falha de integração ou divergência física.","difficulty":"DIFÍCIL","note":"Estoque negativo é um sinal para investigar o processo, não apenas um número para zerar."},{"q":"Por que ajustes manuais de estoque devem ser controlados?","answer":"Porque alteram o saldo sem representar necessariamente uma movimentação física normal.","difficulty":"MÉDIA","note":"Motivo, responsável e evidência aumentam a confiabilidade do ajuste."},{"q":"O que é reconciliação de estoque?","answer":"É confrontar diferentes fontes e movimentações para explicar o saldo final.","difficulty":"DIFÍCIL","note":"Recebimentos, vendas, transferências, devoluções e ajustes precisam “fechar” com o físico."},{"q":"O que é Curva ABC de estoque?","answer":"É uma classificação que separa itens conforme importância, valor ou impacto para priorizar gestão.","difficulty":"DIFÍCIL","note":"Itens A normalmente merecem controles e frequência de análise maiores que itens de menor impacto."},{"q":"Em uma Curva ABC por valor, qual grupo costuma exigir maior atenção?","answer":"Os itens da classe A.","difficulty":"MÉDIA","note":"Eles representam parcela relevante do valor, mesmo podendo ser poucos em quantidade."},{"q":"O que é acuracidade de estoque?","answer":"É o grau de correspondência entre o estoque registrado e o estoque físico.","difficulty":"MÉDIA","note":"Alta acuracidade melhora compra, reposição, venda e investigação de perdas."},{"q":"Qual a principal diferença entre inventário geral e inventário rotativo?","answer":"O geral conta grande parte ou todo o estoque de uma vez; o rotativo conta grupos ao longo do tempo.","difficulty":"MÉDIA","note":"Os dois podem coexistir dentro de uma estratégia de controle."},{"q":"O que é lead time de reposição?","answer":"É o tempo entre solicitar/repor um item e ele estar disponível novamente.","difficulty":"DIFÍCIL","note":"Lead time alto exige planejamento melhor para evitar ruptura sem criar excesso."},{"q":"Por que FIFO pode ser insuficiente para produtos com validades diferentes?","answer":"Porque o primeiro recebido nem sempre é o primeiro a vencer.","difficulty":"DIFÍCIL","note":"Nesse caso, FEFO/PVPS é mais adequado para reduzir vencimentos."},{"q":"Dois lotes chegaram hoje: um vence em 5 dias e outro em 12 dias. Qual deve sair primeiro pelo FEFO?","answer":"O lote que vence em 5 dias.","difficulty":"FÁCIL","note":"FEFO olha a validade, independentemente de terem chegado no mesmo dia."},{"q":"Por que o lote é essencial em um recall?","answer":"Porque permite localizar e bloquear especificamente os produtos afetados.","difficulty":"MÉDIA","note":"Sem lote, pode ser necessário bloquear uma quantidade muito maior de mercadoria."},{"q":"O que é recall?","answer":"É o processo de retirar ou corrigir produtos que apresentem problema identificado pelo fabricante ou autoridade competente.","difficulty":"MÉDIA","note":"A rapidez na identificação e segregação reduz exposição e risco."},{"q":"O que significa colocar um produto em quarentena no estoque?","answer":"Mantê-lo separado e bloqueado para uso/venda até decisão ou análise.","difficulty":"DIFÍCIL","note":"Quarentena evita movimentação acidental de um item sob suspeita."},{"q":"O que é um data logger de temperatura?","answer":"É um dispositivo que registra temperatura ao longo do tempo.","difficulty":"DIFÍCIL","note":"Ele permite verificar se houve desvio mesmo quando ninguém estava olhando o equipamento."},{"q":"Uma câmara fria ficou acima da faixa por algum tempo. Basta baixar a temperatura e vender tudo normalmente?","answer":"Não. É preciso avaliar tempo, temperatura, produto e procedimento antes da liberação.","difficulty":"DIFÍCIL","note":"Voltar à temperatura correta não desfaz automaticamente o efeito do desvio anterior."},{"q":"Qual vantagem da conferência cega no recebimento?","answer":"Reduz o viés de contar “o que deveria ter chegado” em vez do que realmente chegou.","difficulty":"DIFÍCIL","note":"O resultado físico é comparado ao esperado somente depois da contagem."},{"q":"O que é conluio em um contexto de fraude?","answer":"É a cooperação entre duas ou mais pessoas para burlar controles.","difficulty":"DIFÍCIL","note":"Controles que dependem de uma única aprovação podem ficar mais vulneráveis a combinações indevidas."},{"q":"Por que separar funções críticas pode reduzir risco?","answer":"Porque evita que a mesma pessoa controle todas as etapas de uma operação sensível.","difficulty":"DIFÍCIL","note":"Exemplo: quem solicita uma alteração não deveria ser sempre a única pessoa que a aprova e confere."},{"q":"Por que exceções de processo devem ter autorização registrada?","answer":"Porque exceções sem rastreabilidade podem virar atalhos permanentes ou esconder desvios.","difficulty":"MÉDIA","note":"A autorização deixa claro quem decidiu, por quê e em qual contexto."},{"q":"Uma alteração de preço no cadastro pode gerar perda mesmo sem furto?","answer":"Sim. Preço incorreto pode causar venda abaixo do previsto ou divergências no caixa.","difficulty":"MÉDIA","note":"Cadastro mestre é parte importante da prevenção operacional."},{"q":"Por que descontos manuais muito frequentes merecem análise?","answer":"Porque podem sinalizar treinamento, cadastro, processo promocional ou uso indevido.","difficulty":"MÉDIA","note":"O objetivo é investigar padrão e causa, não presumir fraude."},{"q":"Se a gôndola mostra uma promoção e o sistema cobra outro valor, que tipo de risco existe?","answer":"Risco de perda financeira, reclamação e falha de conformidade da operação.","difficulty":"MÉDIA","note":"Comunicação, cadastro e caixa precisam estar sincronizados."},{"q":"Por que o descarte de mercadoria deve ser registrado?","answer":"Para que a saída física tenha causa, quantidade e responsável rastreáveis.","difficulty":"FÁCIL","note":"Descartar sem registro cria diferença entre o físico e o sistema."},{"q":"O que é um mapa de perdas por setor?","answer":"É uma análise que mostra onde e quanto cada área contribui para as perdas.","difficulty":"MÉDIA","note":"Ajuda a direcionar ações para onde o impacto é maior."},{"q":"O que é análise de anomalias em Prevenção de Perdas?","answer":"É procurar comportamentos ou indicadores fora do padrão esperado.","difficulty":"DIFÍCIL","note":"Anomalia é um sinal para investigar; não é prova automática de irregularidade."},{"q":"Para que servem relatórios de exceção?","answer":"Para destacar operações que fogem de regras ou padrões definidos.","difficulty":"DIFÍCIL","note":"Cancelamentos, ajustes e descontos fora do comum podem ser priorizados para análise."},{"q":"O que caracteriza uma boa cultura de Prevenção de Perdas?","answer":"Todos entenderem que reduzir perdas faz parte da operação, não apenas de um setor.","difficulty":"FÁCIL","note":"Processos bem executados por toda a equipe evitam mais perdas do que ações isoladas."},{"q":"Se um erro pequeno é encontrado, vale a pena registrar mesmo sem grande prejuízo?","answer":"Sim, principalmente se ele puder se repetir.","difficulty":"FÁCIL","note":"Pequenos sinais ajudam a corrigir a causa antes que o impacto cresça."},{"q":"Uma loja tem perda alta em um único produto. Qual é a melhor primeira análise?","answer":"Ver histórico, estoque, recebimento, venda, ajustes, avarias e localização desse item.","difficulty":"DIFÍCIL","note":"Investigar o fluxo completo é melhor do que assumir uma causa sem evidência."},{"q":"Por que comparar perdas por unidade vendida pode ser útil?","answer":"Porque relaciona a perda ao volume de operação daquele item ou setor.","difficulty":"DIFÍCIL","note":"Isso ajuda a diferenciar aumento de perda causado apenas por maior movimento de um problema real de eficiência."},{"q":"Se a acuracidade melhora após inventários, mas volta a cair rapidamente, o que isso sugere?","answer":"Que a causa operacional da divergência ainda não foi corrigida.","difficulty":"DIFÍCIL","note":"Inventário corrige o saldo; processo corrigido evita que a divergência renasça."},{"q":"Qual é o risco de usar sempre a mesma senha compartilhada em uma operação?","answer":"Perder a capacidade de saber quem executou cada ação e aumentar acesso indevido.","difficulty":"FÁCIL","note":"Identificação individual fortalece responsabilização e auditoria."},{"q":"Por que data e hora exatas são importantes em auditoria?","answer":"Porque permitem reconstruir a sequência dos acontecimentos.","difficulty":"FÁCIL","note":"Tempo, usuário e ação formam uma linha do tempo confiável."},{"q":"Em auditoria, o que é trilha de auditoria?","answer":"É o histórico rastreável de ações e alterações realizadas no sistema ou processo.","difficulty":"MÉDIA","note":"Uma boa trilha mostra o que mudou, quando e por quem."},{"q":"Por que apagar registros antigos para “limpar” o sistema é uma má prática de auditoria?","answer":"Porque elimina evidências e impede reconstruir o histórico.","difficulty":"FÁCIL","note":"O ideal é manter histórico e, quando necessário, usar cancelamento, inativação ou correção rastreada."},{"q":"O que é controle preventivo?","answer":"É um controle criado para evitar que o erro ou perda aconteça.","difficulty":"MÉDIA","note":"Exemplo: validação obrigatória antes de liberar uma saída."},{"q":"O que é controle detectivo?","answer":"É um controle que identifica um erro ou perda depois ou durante a ocorrência.","difficulty":"MÉDIA","note":"Inventários e relatórios de exceção são exemplos de mecanismos detectivos."},{"q":"Qual tende a custar menos: prevenir um erro recorrente ou corrigir suas consequências todos os dias?","answer":"Normalmente prevenir a causa recorrente.","difficulty":"FÁCIL","note":"A prevenção reduz retrabalho, perda direta e desgaste operacional."},{"q":"Em FEFO, o lote A vence dia 10 e o lote B vence dia 8. Qual deve ser exposto/expedido primeiro?","answer":"O lote B, que vence dia 8.","difficulty":"FÁCIL","note":"A data de vencimento define a prioridade no FEFO/PVPS."},{"q":"Um produto chegou primeiro, mas vence depois de outro lote que chegou mais tarde. Qual regra reduz melhor o risco de vencimento?","answer":"FEFO/PVPS.","difficulty":"MÉDIA","note":"Esse cenário mostra por que ordem de entrada e ordem de validade podem ser diferentes."},{"q":"Qual é a melhor pergunta ao analisar uma perda recorrente: “quem errou?” ou “qual processo permitiu que isso se repetisse?”","answer":"“Qual processo permitiu que isso se repetisse?”","difficulty":"DIFÍCIL","note":"Responsabilidade é importante, mas corrigir o processo reduz a reincidência para toda a equipe."},{"q":"Se um indicador melhora apenas nos dias de auditoria, o controle é realmente sustentável?","answer":"Provavelmente não; o processo precisa funcionar de forma consistente todos os dias.","difficulty":"DIFÍCIL","note":"Controle eficaz faz parte da rotina, não de uma preparação temporária para inspeção."}];
const GENERAL_CURIOSITIES = [{"q":"Qual planeta é conhecido como Planeta Vermelho?","answer":"Marte.","difficulty":"FÁCIL","note":"A cor avermelhada vem principalmente de óxidos de ferro na superfície."},{"q":"Qual é o maior oceano da Terra?","answer":"Oceano Pacífico.","difficulty":"FÁCIL","note":"Ele cobre uma área maior do que todos os continentes juntos individualmente."},{"q":"Quantos lados tem um hexágono?","answer":"Seis.","difficulty":"FÁCIL","note":"O prefixo “hexa” significa seis."},{"q":"Qual gás as plantas absorvem principalmente para a fotossíntese?","answer":"Dióxido de carbono (CO₂).","difficulty":"FÁCIL","note":"Elas usam CO₂, água e energia luminosa para produzir matéria orgânica."},{"q":"Qual é a capital do Brasil?","answer":"Brasília.","difficulty":"FÁCIL","note":"Brasília tornou-se a capital federal em 21 de abril de 1960."},{"q":"Qual é o maior órgão do corpo humano?","answer":"A pele.","difficulty":"FÁCIL","note":"Ela protege o corpo, ajuda a regular temperatura e participa da percepção sensorial."},{"q":"Quantos minutos há em duas horas e meia?","answer":"150 minutos.","difficulty":"FÁCIL","note":"Duas horas são 120 minutos; somando 30, chegamos a 150."},{"q":"Qual é o animal terrestre mais rápido em curtas distâncias?","answer":"O guepardo.","difficulty":"FÁCIL","note":"Ele é especializado em acelerações muito rápidas por distâncias curtas."},{"q":"Qual instrumento mede a temperatura?","answer":"Termômetro.","difficulty":"FÁCIL","note":"Barômetro mede pressão e anemômetro mede velocidade do vento."},{"q":"A quantos graus Celsius a água pura congela, aproximadamente, ao nível do mar?","answer":"0 °C.","difficulty":"FÁCIL","note":"Pressão e impurezas podem alterar ligeiramente o ponto de congelamento."},{"q":"Qual é o maior planeta do Sistema Solar?","answer":"Júpiter.","difficulty":"FÁCIL","note":"Sua massa é maior que a de todos os outros planetas somados, embora ainda muito menor que a do Sol."},{"q":"Qual é o idioma oficial do Brasil?","answer":"Português.","difficulty":"FÁCIL","note":"O Brasil é o país com maior número de falantes de português no mundo."},{"q":"Quantos gramas existem em 1 quilograma?","answer":"1.000 gramas.","difficulty":"FÁCIL","note":"“Quilo” indica mil unidades."},{"q":"Qual órgão bombeia sangue pelo corpo?","answer":"O coração.","difficulty":"FÁCIL","note":"Ele funciona como uma bomba muscular ligada aos sistemas pulmonar e sistêmico."},{"q":"Qual parte do sangue transporta grande parte do oxigênio?","answer":"As hemácias, por meio da hemoglobina.","difficulty":"MÉDIA","note":"A hemoglobina contém ferro e se liga ao oxigênio nos pulmões."},{"q":"Qual molécula carrega a maior parte da informação genética dos seres vivos?","answer":"DNA.","difficulty":"FÁCIL","note":"DNA significa ácido desoxirribonucleico."},{"q":"Quanto tempo a Terra leva aproximadamente para completar uma rotação?","answer":"Cerca de 24 horas.","difficulty":"FÁCIL","note":"A rotação é responsável pela alternância entre dia e noite."},{"q":"Quanto tempo a Terra leva aproximadamente para dar uma volta ao redor do Sol?","answer":"Cerca de 365 dias e 6 horas.","difficulty":"MÉDIA","note":"As horas extras ajudam a explicar a necessidade dos anos bissextos."},{"q":"Qual é a capital da França?","answer":"Paris.","difficulty":"FÁCIL","note":"A cidade é cortada pelo rio Sena."},{"q":"Em qual continente fica o Deserto do Saara?","answer":"África.","difficulty":"FÁCIL","note":"É o maior deserto quente do mundo."},{"q":"Em qual hemisfério vivem naturalmente todos os pinguins selvagens?","answer":"No Hemisfério Sul ou em regiões próximas ao Equador do lado sul.","difficulty":"MÉDIA","note":"Não existem pinguins selvagens no Ártico."},{"q":"Mamíferos respiram principalmente por qual órgão?","answer":"Pulmões.","difficulty":"FÁCIL","note":"Até baleias e golfinhos precisam subir à superfície para respirar ar."},{"q":"Quantas cores são tradicionalmente citadas no arco-íris?","answer":"Sete.","difficulty":"FÁCIL","note":"A divisão em sete cores é uma convenção; o espectro visível é contínuo."},{"q":"Quantos ossos possui, em média, o esqueleto de um adulto?","answer":"206 ossos.","difficulty":"MÉDIA","note":"Bebês possuem mais ossos; vários se fundem durante o crescimento."},{"q":"Qual é o único número primo par?","answer":"2.","difficulty":"MÉDIA","note":"Todo outro número par é divisível por 2 e, portanto, não pode ser primo."},{"q":"Quanto somam os ângulos internos de um triângulo em geometria plana?","answer":"180 graus.","difficulty":"FÁCIL","note":"Isso vale na geometria euclidiana plana."},{"q":"Qual rio tem a maior vazão de água do mundo?","answer":"O Rio Amazonas.","difficulty":"MÉDIA","note":"Ele descarrega no oceano uma quantidade de água muito superior à de qualquer outro rio."},{"q":"Qual direção uma bússola magnética normalmente indica com sua ponta norte?","answer":"O norte magnético.","difficulty":"FÁCIL","note":"Norte magnético e norte geográfico não são exatamente o mesmo ponto."},{"q":"Aproximadamente qual é a velocidade da luz no vácuo?","answer":"Cerca de 300 mil km por segundo.","difficulty":"MÉDIA","note":"A luz poderia dar mais de sete voltas na Terra em um segundo, em termos de distância."},{"q":"O som viaja mais rápido no ar ou na água?","answer":"Na água.","difficulty":"MÉDIA","note":"Em geral, partículas mais próximas permitem transmitir a vibração com maior velocidade."},{"q":"Qual é o maior órgão interno do corpo humano?","answer":"O fígado.","difficulty":"MÉDIA","note":"Ele participa do metabolismo, armazenamento de energia e processamento de substâncias."},{"q":"Qual é o menor planeta do Sistema Solar?","answer":"Mercúrio.","difficulty":"FÁCIL","note":"Plutão é classificado como planeta anão desde 2006."},{"q":"Qual é a estrela mais próxima da Terra?","answer":"O Sol.","difficulty":"FÁCIL","note":"Depois dele, o sistema estelar Alfa Centauri é o mais próximo."},{"q":"Em qual planeta existe a Grande Mancha Vermelha?","answer":"Júpiter.","difficulty":"MÉDIA","note":"É uma enorme tempestade observada há séculos."},{"q":"Qual planeta é famoso por seus anéis visíveis?","answer":"Saturno.","difficulty":"FÁCIL","note":"Todos os gigantes gasosos possuem anéis, mas os de Saturno são os mais destacados."},{"q":"Qual é o planeta mais quente do Sistema Solar?","answer":"Vênus.","difficulty":"MÉDIA","note":"Apesar de Mercúrio estar mais perto do Sol, o forte efeito estufa torna Vênus mais quente."},{"q":"Um dia em Marte é muito diferente de um dia na Terra?","answer":"Não muito: dura cerca de 24 horas e 37 minutos.","difficulty":"MÉDIA","note":"O “sol” marciano é apenas um pouco mais longo que o dia terrestre."},{"q":"A Lua produz sua própria luz visível?","answer":"Não. Ela reflete principalmente a luz do Sol.","difficulty":"FÁCIL","note":"As fases da Lua dependem da geometria entre Sol, Terra e Lua."},{"q":"Qual astro tem maior influência nas marés da Terra?","answer":"A Lua.","difficulty":"MÉDIA","note":"O Sol também influencia, mas a proximidade da Lua faz sua contribuição ser muito importante."},{"q":"Por que ouvimos trovão depois de ver o relâmpago?","answer":"Porque a luz chega muito mais rápido aos nossos olhos do que o som aos ouvidos.","difficulty":"FÁCIL","note":"Essa diferença pode até ajudar a estimar a distância aproximada da tempestade."},{"q":"Qual instrumento mede pressão atmosférica?","answer":"Barômetro.","difficulty":"MÉDIA","note":"Mudanças de pressão ajudam na análise de condições meteorológicas."},{"q":"Qual instrumento mede a velocidade do vento?","answer":"Anemômetro.","difficulty":"MÉDIA","note":"É muito usado em meteorologia e em parques eólicos."},{"q":"Qual instrumento mede a umidade do ar?","answer":"Higrômetro.","difficulty":"MÉDIA","note":"A umidade relativa indica quão próximo o ar está da saturação de vapor de água."},{"q":"Qual temperatura corresponde aproximadamente ao zero absoluto em Celsius?","answer":"−273,15 °C.","difficulty":"DIFÍCIL","note":"É o limite teórico inferior de temperatura e corresponde a 0 kelvin."},{"q":"Em qual oceano fica a Fossa das Marianas?","answer":"Oceano Pacífico.","difficulty":"MÉDIA","note":"Ela abriga o ponto oceânico conhecido como Challenger Deep, um dos locais mais profundos medidos."},{"q":"Qual montanha possui o pico mais alto acima do nível do mar?","answer":"Monte Everest.","difficulty":"FÁCIL","note":"Existem outras formas de medir “maior montanha”, como da base ao topo, mas por altitude o Everest lidera."},{"q":"O Mar Morto é realmente um mar aberto?","answer":"Não. É um lago salgado sem saída para o oceano.","difficulty":"MÉDIA","note":"Sua salinidade extremamente alta dificulta a vida de muitos organismos aquáticos."},{"q":"Qual é o continente mais seco da Terra em média?","answer":"Antártida.","difficulty":"DIFÍCIL","note":"Apesar de coberta de gelo, grande parte da Antártida é classificada como deserto polar."},{"q":"Qual país possui a maior área territorial do mundo?","answer":"Rússia.","difficulty":"FÁCIL","note":"Seu território se estende por Europa e Ásia."},{"q":"Qual é o menor país do mundo em área?","answer":"Cidade do Vaticano.","difficulty":"MÉDIA","note":"Ele fica dentro de Roma e possui menos de 1 km²."},{"q":"Qual país está localizado em dois continentes e tem Istambul dividida entre Europa e Ásia?","answer":"Turquia.","difficulty":"MÉDIA","note":"O estreito de Bósforo separa as partes europeia e asiática da cidade."},{"q":"O Egito está apenas na África?","answer":"Não. A Península do Sinai fica na Ásia.","difficulty":"MÉDIA","note":"Por isso o Egito é considerado um país transcontinental."},{"q":"Em que ano foi proclamada a República no Brasil?","answer":"1889.","difficulty":"MÉDIA","note":"A proclamação ocorreu em 15 de novembro de 1889."},{"q":"Em que ano Brasília foi inaugurada como capital do Brasil?","answer":"1960.","difficulty":"MÉDIA","note":"A inauguração ocorreu em 21 de abril de 1960."},{"q":"Quem é associado à prensa de tipos móveis que revolucionou a impressão na Europa do século XV?","answer":"Johannes Gutenberg.","difficulty":"MÉDIA","note":"A técnica permitiu reproduzir livros em escala muito maior do que a cópia manual."},{"q":"Em que ano seres humanos pisaram na Lua pela primeira vez?","answer":"1969.","difficulty":"MÉDIA","note":"A missão Apollo 11 pousou em julho de 1969."},{"q":"Quem foi o primeiro ser humano a viajar ao espaço?","answer":"Yuri Gagarin.","difficulty":"MÉDIA","note":"O cosmonauta soviético orbitou a Terra em 1961."},{"q":"Quem foi a primeira mulher a viajar ao espaço?","answer":"Valentina Tereshkova.","difficulty":"DIFÍCIL","note":"Ela realizou a missão Vostok 6 em 1963."},{"q":"Quem é associado à descoberta da penicilina em 1928?","answer":"Alexander Fleming.","difficulty":"MÉDIA","note":"A observação de um fungo inibindo bactérias abriu caminho para antibióticos modernos."},{"q":"Quem organizou uma versão pioneira da tabela periódica prevendo elementos ainda não descobertos?","answer":"Dmitri Mendeleev.","difficulty":"DIFÍCIL","note":"Ele deixou lacunas onde previu propriedades de elementos que seriam encontrados depois."},{"q":"Qual é o símbolo químico do ouro?","answer":"Au.","difficulty":"MÉDIA","note":"Vem do latim “aurum”."},{"q":"Qual é o símbolo químico do ferro?","answer":"Fe.","difficulty":"MÉDIA","note":"Vem do latim “ferrum”."},{"q":"Qual é a fórmula química do sal de cozinha comum?","answer":"NaCl.","difficulty":"MÉDIA","note":"É cloreto de sódio, formado por íons sódio e cloreto."},{"q":"Qual é aproximadamente o pH neutro da água pura a 25 °C?","answer":"7.","difficulty":"MÉDIA","note":"Valores abaixo de 7 são ácidos e acima de 7 são básicos nessa referência."},{"q":"Diamante e grafite são formados principalmente pelo mesmo elemento. Qual?","answer":"Carbono.","difficulty":"MÉDIA","note":"A diferença está na organização dos átomos, que muda radicalmente as propriedades."},{"q":"Quantos corações possui um polvo?","answer":"Três.","difficulty":"MÉDIA","note":"Dois auxiliam a circulação pelas brânquias e um atende o restante do corpo."},{"q":"Qual é o maior animal conhecido que vive atualmente?","answer":"Baleia-azul.","difficulty":"FÁCIL","note":"Ela pode ultrapassar 25 metros de comprimento e pesar mais de 100 toneladas."},{"q":"Qual pequena ave é conhecida por conseguir voar para trás?","answer":"Beija-flor.","difficulty":"MÉDIA","note":"Sua mecânica de voo permite movimentos que a maioria das aves não consegue executar."},{"q":"O esqueleto dos tubarões é feito principalmente de osso?","answer":"Não. É principalmente cartilagem.","difficulty":"MÉDIA","note":"A cartilagem é mais leve e flexível que o osso."},{"q":"Qual grupo de mamíferos é capaz de voo verdadeiro sustentado?","answer":"Morcegos.","difficulty":"MÉDIA","note":"Outros mamíferos chamados “voadores” normalmente apenas planam."},{"q":"Qual anfíbio é famoso por regenerar membros e partes de alguns órgãos?","answer":"Axolote.","difficulty":"DIFÍCIL","note":"Essa capacidade faz do axolote um organismo muito estudado em biologia regenerativa."},{"q":"Tardígrados são realmente indestrutíveis?","answer":"Não. São extremamente resistentes em certos estados, mas podem morrer.","difficulty":"DIFÍCIL","note":"Sua fama vem da capacidade de suportar condições extremas quando entram em criptobiose."},{"q":"Botanicamente, a banana pode ser classificada como uma baga?","answer":"Sim.","difficulty":"DIFÍCIL","note":"Na botânica, “baga” tem uma definição diferente do uso culinário cotidiano."},{"q":"Botanicamente, o tomate é fruta ou legume?","answer":"Fruta.","difficulty":"FÁCIL","note":"Ele se desenvolve do ovário da flor e contém sementes, embora seja usado como legume na cozinha."},{"q":"Amendoim é uma noz verdadeira?","answer":"Não. É uma leguminosa.","difficulty":"MÉDIA","note":"Ele é mais próximo de feijões e ervilhas do que de castanhas verdadeiras."},{"q":"O abacaxi é formado a partir de uma única flor?","answer":"Não. É um fruto múltiplo formado pela união de várias flores.","difficulty":"DIFÍCIL","note":"Os “olhos” do abacaxi ajudam a perceber a origem em múltiplas estruturas florais."},{"q":"O grão de café é, botanicamente, o quê?","answer":"Uma semente.","difficulty":"MÉDIA","note":"Ele fica dentro do fruto do cafeeiro, conhecido como cereja do café."},{"q":"A parte carnosa do caju é o fruto verdadeiro?","answer":"Não. A castanha é o fruto verdadeiro; a parte carnosa é um pseudofruto.","difficulty":"DIFÍCIL","note":"É um exemplo curioso de como nomes culinários e estruturas botânicas podem diferir."},{"q":"Por que trilhos e pontes metálicas precisam de espaços ou juntas de dilatação?","answer":"Porque os materiais se expandem quando aquecidos.","difficulty":"MÉDIA","note":"Sem espaço para expansão, estruturas podem sofrer deformações e tensões excessivas."},{"q":"Vidro comum é um líquido que escorre lentamente ao longo dos séculos?","answer":"Não. É um sólido amorfo.","difficulty":"DIFÍCIL","note":"Vidros antigos mais espessos embaixo se explicam principalmente por técnicas históricas de fabricação, não por fluxo lento."},{"q":"O som consegue se propagar no vácuo do espaço?","answer":"Não.","difficulty":"FÁCIL","note":"Som é uma onda mecânica e precisa de um meio material para se propagar."},{"q":"Por que sistemas de GPS precisam considerar efeitos da relatividade?","answer":"Porque relógios em satélites e na Terra marcam o tempo em ritmos ligeiramente diferentes.","difficulty":"DIFÍCIL","note":"Sem correções relativísticas, o erro de posicionamento cresceria rapidamente."},{"q":"A maior parte do tráfego internacional da internet passa por satélites?","answer":"Não. Grande parte passa por cabos submarinos de fibra óptica.","difficulty":"MÉDIA","note":"Satélites são importantes, mas cabos submarinos carregam enorme volume de dados entre continentes."},{"q":"Para que o QR Code foi criado originalmente?","answer":"Para rastrear peças na indústria automotiva.","difficulty":"DIFÍCIL","note":"Ele foi desenvolvido pela Denso Wave no Japão na década de 1990."},{"q":"O nome QWERTY vem de onde?","answer":"Das seis primeiras letras da fileira superior do teclado: Q-W-E-R-T-Y.","difficulty":"FÁCIL","note":"O layout surgiu nas máquinas de escrever e permaneceu amplamente usado em computadores."},{"q":"Quantos símbolos básicos existem no sistema binário?","answer":"Dois: 0 e 1.","difficulty":"FÁCIL","note":"Computadores digitais representam informação combinando esses dois estados."},{"q":"O que acontece com o conteúdo típico da memória RAM quando o computador é desligado?","answer":"Ele é perdido.","difficulty":"MÉDIA","note":"A RAM comum é memória volátil; armazenamento permanente fica em SSD, HD ou outras mídias."},{"q":"O que significa HTTP?","answer":"Hypertext Transfer Protocol — Protocolo de Transferência de Hipertexto.","difficulty":"DIFÍCIL","note":"É um dos protocolos fundamentais usados na comunicação da Web."},{"q":"Qual é a diferença básica entre massa e peso?","answer":"Massa é a quantidade de matéria; peso é a força gravitacional sobre essa massa.","difficulty":"DIFÍCIL","note":"Na Lua sua massa praticamente não muda, mas seu peso é menor."},{"q":"Por que o céu costuma parecer azul durante o dia?","answer":"Porque a atmosfera espalha mais a luz azul de comprimentos de onda menores.","difficulty":"MÉDIA","note":"Esse fenômeno é chamado espalhamento de Rayleigh."},{"q":"Por que o pôr do sol costuma ficar avermelhado?","answer":"A luz atravessa mais atmosfera, dispersando mais os tons azuis e deixando vermelhos/alaranjados dominarem.","difficulty":"MÉDIA","note":"É o mesmo fenômeno de espalhamento que ajuda a deixar o céu azul."},{"q":"O que causa as estações do ano?","answer":"Principalmente a inclinação do eixo da Terra durante sua órbita ao redor do Sol.","difficulty":"MÉDIA","note":"Não é simplesmente a distância entre Terra e Sol."},{"q":"Em qual camada da atmosfera ocorre a maior parte dos fenômenos meteorológicos?","answer":"Troposfera.","difficulty":"DIFÍCIL","note":"É a camada mais baixa, onde se concentra a maior parte do vapor d’água atmosférico."},{"q":"Qual é o gás mais abundante na atmosfera terrestre?","answer":"Nitrogênio.","difficulty":"MÉDIA","note":"Ele representa cerca de 78% do ar seco; oxigênio vem em seguida, com cerca de 21%."},{"q":"Qual metal é líquido próximo à temperatura ambiente e ficou famoso em termômetros antigos?","answer":"Mercúrio.","difficulty":"MÉDIA","note":"Seu uso foi reduzido por toxicidade e riscos ambientais."},{"q":"Qual é a unidade do Sistema Internacional para força?","answer":"Newton (N).","difficulty":"DIFÍCIL","note":"Um newton é a força necessária para acelerar 1 kg a 1 m/s²."},{"q":"Qual é a unidade do Sistema Internacional para energia?","answer":"Joule (J).","difficulty":"DIFÍCIL","note":"Ela é usada para energia, trabalho e calor no SI."},{"q":"Qual é a unidade do Sistema Internacional para potência?","answer":"Watt (W).","difficulty":"DIFÍCIL","note":"Um watt equivale a um joule por segundo."},{"q":"Se você dobrar a velocidade de um objeto, sua energia cinética dobra?","answer":"Não. Ela aumenta aproximadamente quatro vezes, se a massa permanecer igual.","difficulty":"DIFÍCIL","note":"A energia cinética é proporcional ao quadrado da velocidade."},{"q":"Qual continente é atravessado tanto pela Linha do Equador quanto pelo Meridiano de Greenwich?","answer":"África.","difficulty":"DIFÍCIL","note":"Por isso a África possui território nos hemisférios Norte, Sul, Leste e Oeste."}];

const QUESTION_HISTORY_KEYS = {
  prev: 'orbita_question_history_prev_v59',
  geral: 'orbita_question_history_geral_v59',
};
const QUESTION_NEXT_GROUP_KEY = 'orbita_question_next_group_v59';
const KNOWLEDGE_GROUPS = {
  prev: PREVENTION_QUESTIONS.map((item, i) => ({ ...item, id: `prev-${i + 1}`, groupKey:'prev', group: 'PREVENÇÃO DE PERDAS', icon: '🛡️' })),
  geral: GENERAL_CURIOSITIES.map((item, i) => ({ ...item, id: `geral-${i + 1}`, groupKey:'geral', group: 'CURIOSIDADE GERAL', icon: '💡' })),
};
let quizState = { stack: [], position: -1, revealed: false };
let knowledgeTickerState = { question: null };
let knowledgeTickerTimer = null;

function quizEsc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}
function readGroupHistory(group) {
  try {
    const parsed = JSON.parse(localStorage.getItem(QUESTION_HISTORY_KEYS[group]) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}
function pickUnseenQuestion(group) {
  const bank = KNOWLEDGE_GROUPS[group];
  const validIds = new Set(bank.map((q) => q.id));
  let history = readGroupHistory(group).filter((id) => validIds.has(id));
  let available = bank.filter((q) => !history.includes(q.id));
  if (!available.length) {
    const lastId = history.at(-1) || null;
    history = [];
    available = bank.filter((q) => q.id !== lastId);
    if (!available.length) available = [...bank];
  }
  const question = available[Math.floor(Math.random() * available.length)];
  const cyclePosition = history.length + 1;
  localStorage.setItem(QUESTION_HISTORY_KEYS[group], JSON.stringify([...history, question.id]));
  return { ...question, cyclePosition, bankSize: bank.length };
}
function getNextKnowledgeQuestion() {
  const group = localStorage.getItem(QUESTION_NEXT_GROUP_KEY) === 'geral' ? 'geral' : 'prev';
  const question = pickUnseenQuestion(group);
  localStorage.setItem(QUESTION_NEXT_GROUP_KEY, group === 'prev' ? 'geral' : 'prev');
  return question;
}
function difficultyClass(label='') {
  const value = String(label).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return value.includes('dific') ? 'hard' : value.includes('media') ? 'medium' : 'easy';
}
function showNextTickerQuestion(forcedQuestion = null) {
  knowledgeTickerState.question = forcedQuestion || getNextKnowledgeQuestion();
  const q = knowledgeTickerState.question;
  const questionEl = $('#knowledgeTickerQuestion');
  const meta = $('#knowledgeTickerMeta');
  const group = $('#knowledgeTickerGroup');
  const icon = $('#knowledgeTickerIcon');
  const difficulty = $('#knowledgeTickerDifficulty');
  const counter = $('#knowledgeTickerCounter');
  const helper = $('#knowledgeTickerHelper');
  const btn = $('#funBreakBtn');
  const isGeneral = q.group === 'CURIOSIDADE GERAL';
  if (questionEl) {
    questionEl.textContent = q.q;
    questionEl.setAttribute('title', q.q);
  }
  if (meta) meta.innerHTML = `<span>Ver resposta</span><b>›</b>`;
  if (group) group.textContent = q.group;
  if (difficulty) {
    difficulty.textContent = q.difficulty;
    difficulty.className = `nq-difficulty ${difficultyClass(q.difficulty)}`;
  }
  if (counter) counter.textContent = `${q.cyclePosition}/${q.bankSize}`;
  if (helper) helper.textContent = isGeneral ? 'Uma curiosidade rápida para descobrir algo novo' : 'Conhecimento que protege a operação';
  if (icon) {
    icon.innerHTML = isGeneral
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M8.4 14.5A6 6 0 1 1 15.6 14.5C14.6 15.3 14 16.2 14 17h-4c0-.8-.6-1.7-1.6-2.5Z"/><path d="M12 2V1M4.9 4.9 4.2 4.2M19.1 4.9l.7-.7"/></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.8-2.8 8.3-7 10-4.2-1.7-7-5.2-7-10V6l7-3Z"/><path d="m9.2 12 1.8 1.8 3.9-4"/></svg>`;
  }
  if (btn) {
    btn.dataset.group = isGeneral ? 'geral' : 'prev';
    btn.classList.remove('ticker-pulse');
    void btn.offsetWidth;
    btn.classList.add('ticker-pulse');
  }
}
function startKnowledgeTicker() {
  showNextTickerQuestion();
  if (knowledgeTickerTimer) clearInterval(knowledgeTickerTimer);
  knowledgeTickerTimer = setInterval(() => showNextTickerQuestion(), 12000);
}
function openFunBreak() {
  const q = knowledgeTickerState.question || getNextKnowledgeQuestion();
  quizState = { stack: [q], position: 0, revealed: false };
  openModal({
    title: 'Pergunta do momento',
    subtitle: '100 de Prevenção de Perdas + 100 Curiosidades Gerais · fáceis, médias e difíceis.',
    body: `<div class="knowledge-quiz" id="knowledgeQuiz"><div class="quiz-card" id="quizCard"></div></div>`,
    actions: [{ label: 'Fechar', kind: 'ghost', onClick: () => { closeModal(); startKnowledgeTicker(); } }],
  });
  renderKnowledgeQuestion();
}
function currentQuizQuestion() { return quizState.stack[quizState.position] || null; }
function renderKnowledgeQuestion() {
  const card = $('#quizCard');
  const q = currentQuizQuestion();
  if (!card || !q) return;
  const dclass = difficultyClass(q.difficulty);
  card.innerHTML = `
    <div class="quiz-progress">
      <span>${q.icon} ${quizEsc(q.group)}</span>
      <div class="quiz-meta-pills"><strong>${q.cyclePosition} de ${q.bankSize}</strong><em class="difficulty-pill ${dclass}">${quizEsc(q.difficulty)}</em></div>
    </div>
    <h3>${quizEsc(q.q)}</h3>
    <button type="button" class="quiz-reveal-btn" id="quizRevealBtn">👁️ Ver resposta</button>
    <div class="quiz-answer ${quizState.revealed ? '' : 'hidden'}" id="quizAnswer">
      <span>RESPOSTA</span>
      <strong>${quizEsc(q.answer)}</strong>
      <p>${quizEsc(q.note)}</p>
    </div>
    <div class="quiz-footer quiz-nav-footer">
      <button type="button" class="quiz-nav-btn" id="quizPrevBtn" ${quizState.position <= 0 ? 'disabled' : ''}>← Anterior</button>
      <span>Sem repetição até completar as 100 de cada tema</span>
      <button type="button" class="quiz-nav-btn primary" id="quizNextBtn">Próxima →</button>
    </div>`;
  $('#quizRevealBtn')?.addEventListener('click', () => {
    quizState.revealed = true;
    $('#quizAnswer')?.classList.remove('hidden');
    const reveal = $('#quizRevealBtn');
    if (reveal) { reveal.disabled = true; reveal.textContent = '✓ Resposta revelada'; }
  });
  if (quizState.revealed) {
    const reveal = $('#quizRevealBtn');
    if (reveal) { reveal.disabled = true; reveal.textContent = '✓ Resposta revelada'; }
  }
  $('#quizPrevBtn')?.addEventListener('click', () => {
    if (quizState.position <= 0) return;
    quizState.position -= 1;
    quizState.revealed = false;
    renderKnowledgeQuestion();
  });
  $('#quizNextBtn')?.addEventListener('click', () => {
    if (quizState.position < quizState.stack.length - 1) quizState.position += 1;
    else {
      const next = getNextKnowledgeQuestion();
      quizState.stack.push(next);
      quizState.position += 1;
      showNextTickerQuestion(next);
    }
    quizState.revealed = false;
    renderKnowledgeQuestion();
  });
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
  const { Deliveries, Cycles } = await import('./db.js?v=5.12');
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
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js?build=20260903-v5.12-edicao-segura-rota', { updateViaCache: 'none' }).then((registration) => registration.update()).catch(() => {}));
}

boot();
