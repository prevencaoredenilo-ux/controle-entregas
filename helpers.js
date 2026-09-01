export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const money = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dateBR = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
export const dateTimeBR = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');
export const timeBR = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, kind = '') {
  const stack = document.getElementById('toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export const STATUS_META = {
  na_loja: { label: 'Na loja', color: 'var(--status-pendente)', cls: 'pendente' },
  em_rota: { label: 'Em rota', color: 'var(--status-transito)', cls: 'transito' },
  no_cliente: { label: 'Na casa do cliente', color: 'var(--status-transito)', cls: 'transito' },
  finalizada: { label: 'Finalizada', color: 'var(--status-entregue)', cls: 'entregue' },
  retorno: { label: 'Retorno', color: 'var(--status-problema)', cls: 'problema' },
  reentrega: { label: 'Reentrega', color: 'var(--status-transito)', cls: 'transito' },
  retirada_loja: { label: 'Retirada na loja', color: 'var(--status-entregue)', cls: 'entregue' },
  programada: { label: 'Programada', color: 'var(--status-pendente)', cls: 'pendente' },
  cancelada: { label: 'Cancelada', color: 'var(--status-problema)', cls: 'problema' },
};

export function badge(status) {
  const meta = STATUS_META[status] || { label: status, cls: 'pendente' };
  return `<span class="badge ${meta.cls}">${meta.label}</span>`;
}

// Bloqueia cliques duplicados em um botão async (seção 2 do briefing)
export function guardClick(el, handler) {
  el.addEventListener('click', async (e) => {
    if (el.dataset.busy === '1') return;
    el.dataset.busy = '1';
    const original = el.textContent;
    el.disabled = true;
    try {
      await handler(e);
    } finally {
      el.disabled = false;
      el.dataset.busy = '0';
    }
  });
}

// tooltip simples: aparece depois de ~500ms parado (seção 2 do briefing)
export function initTooltips(root = document) {
  let timer = null;
  root.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      document.querySelectorAll('.tooltip').forEach((old) => old.remove());
      const tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.textContent = el.dataset.tip;
      document.body.appendChild(tip);
      const r = el.getBoundingClientRect();
      const half = Math.min(130, tip.offsetWidth / 2);
      tip.style.left = `${Math.max(half + 8, Math.min(window.innerWidth - half - 8, r.left + r.width / 2))}px`;
      if (r.top > tip.offsetHeight + 18) tip.style.top = `${r.top - 8}px`;
      else { tip.classList.add('tooltip-below'); tip.style.top = `${r.bottom + 8}px`; }
      el._tip = tip;
    }, 500);
  });
  root.addEventListener('mouseout', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el && e.relatedTarget && el.contains(e.relatedTarget)) return;
    clearTimeout(timer);
    if (el && el._tip) { el._tip.remove(); el._tip = null; }
  });
}

export function maskPhone(value) {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, a, b, c) => c ? `(${a}) ${b}-${c}` : b ? `(${a}) ${b}` : a ? `(${a}` : '');
  return d.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, a, b, c) => c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`);
}
export function wirePhoneMask(root = document) {
  root.querySelectorAll('input[data-mask="phone"]').forEach((input) => {
    input.addEventListener('input', () => { input.value = maskPhone(input.value); });
  });
}

// contador animado (0 -> valor) para números de card
export function countUp(el, target, duration = 600) {
  const start = 0;
  const startTime = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * eased);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = target;
  }
  requestAnimationFrame(tick);
}
export function animateStatCards(root = document) {
  $$('.stat-card, .day-performance-card', root).forEach((card, i) => {
    card.style.animationDelay = `${i * 45}ms`;
    card.classList.add('stat-anim');
    const counter = card.querySelector('[data-count]');
    if (counter) countUp(counter, Number(counter.dataset.count));
  });
}

const PHRASES = {
  excelente: ['Operação brilhando — esse time está voando! 🚀', 'Meta no azul! Mantenham esse ritmo incrível.', 'Excelente trabalho: agilidade com qualidade!'],
  otimo: ['Ritmo forte e operação sob controle!', 'Muito bem, equipe — falta pouco para o topo.', 'Boa cadência! Vamos fechar o dia ainda melhor.'],
  bom: ['Bom ritmo hoje, seguimos evoluindo.', 'A operação está avançando — foco nas próximas.', 'Cada entrega conta. Vamos manter a cadência!'],
  atencao: ['Atenção nas pendências: juntos viramos o jogo.', 'Vamos priorizar atrasos e liberar a fila.', 'Hora de reorganizar o ritmo com calma e foco.'],
  critico: ['Um passo de cada vez: primeiro, resolva os atrasos.', 'Dia desafiador — união e prioridade nas ocorrências.', 'Vamos estabilizar a operação começando pelo mais urgente.'],
};

export function performanceProfile(rate) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(rate) || 0)));
  if (pct < 35) return { key: 'critico', label: 'Crítico', mood: '😟', color: '#d6425f', pct };
  if (pct < 55) return { key: 'atencao', label: 'Atenção', mood: '😐', color: '#e8783d', pct };
  if (pct < 75) return { key: 'bom', label: 'Bom ritmo', mood: '🙂', color: '#e8a33d', pct };
  if (pct < 90) return { key: 'otimo', label: 'Muito bom', mood: '😄', color: '#2f9e5b', pct };
  return { key: 'excelente', label: 'Excelente', mood: '🤩', color: '#16a36a', pct };
}

export function motivationalPhrase(value) {
  const profile = typeof value === 'number'
    ? performanceProfile(value)
    : value === '🤩' ? { key: 'excelente' }
      : value === '😄' ? { key: 'otimo' }
        : value === '🙂' ? { key: 'bom' }
          : value === '😐' ? { key: 'atencao' }
            : { key: 'critico' };
  const list = PHRASES[profile.key];
  return list[Math.floor(Math.random() * list.length)];
}

// gráfico de barras simples em SVG puro (sem libs externas — funciona 100% offline)
export function barChartSVG({ labels, values, height = 160, color = 'var(--ink)', unit = '' }) {
  const max = Math.max(1, ...values);
  const barW = 100 / values.length;
  const bars = values.map((v, i) => {
    const h = (v / max) * (height - 24);
    const x = i * barW;
    return `
      <g class="chart-bar-g" data-tip="${escapeHtml(labels[i])}: ${v}${unit}">
        <rect x="${x + barW * 0.15}%" y="${height - h - 18}" width="${barW * 0.7}%" height="${h}" rx="3" fill="${color}" />
        <text x="${x + barW / 2}%" y="${height - 4}" text-anchor="middle" font-size="9" fill="var(--text-muted)">${escapeHtml(labels[i])}</text>
      </g>`;
  }).join('');
  return `<svg viewBox="0 0 100 ${height}" preserveAspectRatio="none" style="width:100%;height:${height}px" class="chart-svg">${bars}</svg>`;
}

// termômetro de desempenho — cor muda de vermelho a verde conforme a taxa
export function thermometerHTML(rate, label = 'Desempenho de hoje', onLight = false) {
  const profile = performanceProfile(rate);
  const { pct, color } = profile;
  return `
    <div class="thermo ${onLight ? 'thermo-light' : ''}" data-performance="${pct}">
      <div class="thermo-head">
        <span>${label}</span>
        <strong style="color:${color}">${pct}% · ${profile.label}</strong>
      </div>
      <div class="thermo-body">
        <div class="thermo-bulb" style="--thermo-color:${color}"></div>
        <div class="thermo-track">
          <div class="thermo-fill" style="width:${pct}%;background:${color}"></div>
          <i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i>
        </div>
      </div>
    </div>`;
}

export function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCSV(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
