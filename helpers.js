export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const money = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dateBR = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
export const dateTimeBR = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

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
    clearTimeout(timer);
    timer = setTimeout(() => {
      const tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.textContent = el.dataset.tip;
      document.body.appendChild(tip);
      const r = el.getBoundingClientRect();
      tip.style.left = `${r.left + r.width / 2}px`;
      tip.style.top = `${r.top - 8}px`;
      el._tip = tip;
    }, 500);
  });
  root.addEventListener('mouseout', (e) => {
    const el = e.target.closest('[data-tip]');
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
  $$('.stat-card', root).forEach((card, i) => {
    card.style.animationDelay = `${i * 45}ms`;
    card.classList.add('stat-anim');
    const strong = card.querySelector('strong[data-count]');
    if (strong) countUp(strong, Number(strong.dataset.count));
  });
}

const PHRASES = {
  otimo: ['Dia excelente, a operação está redonda! 🚀', 'Ritmo ótimo — continue assim!', 'Time voando hoje, parabéns!'],
  bom: ['Bom ritmo hoje, seguimos evoluindo.', 'Boa entrega! Vamos manter o ritmo.', 'Está indo bem, foco até o fim do dia.'],
  regular: ['Dia de atenção redobrada nas rotas.', 'Vamos ajustar o ritmo para melhorar.', 'Fique de olho nas entregas em atraso.'],
  ruim: ['Dia difícil — priorize resolver as pendências.', 'Atenção: várias ocorrências hoje, vamos reforçar o time.', 'Momento de reorganizar a rota com calma.'],
};
export function motivationalPhrase(mood) {
  const key = mood === '😄' ? 'otimo' : mood === '🙂' ? 'bom' : mood === '😐' ? 'regular' : 'ruim';
  const list = PHRASES[key];
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
  const pct = Math.max(0, Math.min(100, Math.round(rate)));
  const color = pct < 40 ? '#d6425f' : pct < 70 ? '#e8a33d' : '#2f9e5b';
  const mood = pct < 40 ? 'Atenção' : pct < 70 ? 'Regular' : 'Ótimo';
  return `
    <div class="thermo ${onLight ? 'thermo-light' : ''}">
      <div class="thermo-head">
        <span>${label}</span>
        <strong style="color:${color}">${pct}% · ${mood}</strong>
      </div>
      <div class="thermo-track">
        <div class="thermo-fill" style="width:${pct}%;background:${color}"></div>
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
