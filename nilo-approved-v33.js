/**
 * NILO ENTREGAS • V35.0.0 • ARTES APROVADAS EXATAS
 * ------------------------------------------------------------
 * Implementa o pacote visual aprovado (desktop + mobile) sem
 * gravar dados, sem alterar IndexedDB/Supabase e sem remover ações.
 */
(() => {
  'use strict';
  const VERSION = '35.0.0';
  const q = (s,r=document) => r.querySelector(s);
  const qa = (s,r=document) => [...r.querySelectorAll(s)];
  const A = {
    nilo:'logo-nilo-aprovada.png?v=35.0.0',
    triela:'logo-triela-aprovada.png?v=35.0.0',
    mascot:'mascote-nilo-aprovado.png?v=35.0.0'
  };

  const icons = {
    today:'<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
    deliveries:'<svg viewBox="0 0 24 24"><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z"/><path d="M12 11v10"/></svg>',
    scheduled:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
    pending:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>',
    cycles:'<svg viewBox="0 0 24 24"><path d="M20 7h-6V1"/><path d="M20 7a9 9 0 1 0 1 8"/><path d="m20 7-4-4"/></svg>',
    odometer:'<svg viewBox="0 0 24 24"><path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 14 4-4"/><path d="M6 18h12"/></svg>',
    'route-history':'<svg viewBox="0 0 24 24"><path d="M5 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M7.5 16.5c3-1 3.5-6 7.5-7.5"/><path d="M10 6H5v5"/></svg>',
    dashboard:'<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/></svg>',
    reports:'<svg viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h5M8 17v-4M12 17V9M16 17v-6"/></svg>',
    neighborhoods:'<svg viewBox="0 0 24 24"><circle cx="12" cy="10" r="3"/><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/></svg>',
    costs:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.7-1.7-1-3-1-1.7 0-3 .8-3 2s1.1 1.8 3.1 2.2c2 .4 2.9 1 2.9 2.3 0 1.4-1.3 2.5-3.2 2.5-1.4 0-2.6-.4-3.5-1.3M12 5v14"/></svg>',
    trace:'<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg>',
    settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>',
    trash:'<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>',
    training:'<svg viewBox="0 0 24 24"><path d="m3 9 9-5 9 5-9 5-9-5Z"/><path d="M7 12v5c3 2 7 2 10 0v-5M21 9v6"/></svg>',
    more:'<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>'
  };

  const titleMap = {
    today:['Central de Operação','O que está acontecendo agora, o que precisa de ação e qual é o próximo passo.'],
    deliveries:['Entregas & Programadas','Registre novas compras, acompanhe entregas de hoje e visualize programações futuras.'],
    scheduled:['Entregas & Programadas','Registre novas compras, acompanhe entregas de hoje e visualize programações futuras.'],
    pending:['Entregas & Programadas','Pendências, devoluções e próximas ações da operação.'],
    cycles:['Ciclos & Rotas','Planeje, acompanhe e analise seus ciclos de entrega e roteiros.'],
    'route-history':['Ciclos & Rotas','Planeje, acompanhe e analise seus ciclos de entrega e roteiros.'],
    odometer:['Quilometragem & Frota','Acompanhe a quilometragem da frota, eficiência e custos operacionais.'],
    dashboard:['Análises & Relatórios','Acompanhe indicadores, desempenho e insights para tomar as melhores decisões.'],
    reports:['Análises & Relatórios','Acompanhe indicadores, desempenho e insights para tomar as melhores decisões.'],
    neighborhoods:['Análises & Relatórios','Acompanhe indicadores, desempenho e insights para tomar as melhores decisões.'],
    costs:['Análises & Relatórios','Acompanhe indicadores, desempenho e insights para tomar as melhores decisões.'],
    trace:['Pesquisar entregas','Localize rapidamente compras, cupons, clientes e documentos.'],
    settings:['Administração & Cadastros','Gerencie cadastros, configurações do sistema e ferramentas administrativas.'],
    trash:['Administração & Cadastros','Gerencie cadastros, configurações do sistema e ferramentas administrativas.']
  };

  const labelMap = {
    today:'Central de Operação',deliveries:'Entregas',scheduled:'Programadas',pending:'Pendências',cycles:'Rotas & Ciclos',
    'route-history':'Histórico de rotas',odometer:'Quilometragem & Frota',dashboard:'Desempenho',reports:'Relatórios',
    neighborhoods:'Análise por bairro',costs:'Custos',trace:'Pesquisar entregas',settings:'Administração & Cadastros',trash:'Lixeira'
  };

  let scheduled = false;
  let applying = false;

  function setText(el, value){ if(el && el.textContent !== value) el.textContent = value; }
  function activeView(){ return q('#mainNav .nav-item.active')?.dataset.view || document.body.dataset.apView || 'today'; }
  function navButton(view){ return q(`#mainNav .nav-item[data-view="${view}"]`); }
  function menuLabel(btn){ return qa('span',btn).find(s=>!s.classList.contains('nav-ico')&&!s.classList.contains('nav-badge')); }

  function ensureSidebarBrand(){
    const sidebar=q('.sidebar'); const top=q('.sidebar-top'); if(!sidebar||!top) return;
    if(!q('.ap-side-logo',sidebar)){
      const box=document.createElement('div'); box.className='ap-side-logo'; box.innerHTML=`<img src="${A.nilo}" alt="Nilo Entregas">`;
      top.prepend(box);
    }
  }

  function group(title, cls=''){
    const g=document.createElement('div'); g.className=`ap-nav-group ${cls}`.trim();
    const h=document.createElement('div'); h.className='ap-nav-title'; h.textContent=title; g.appendChild(h); return g;
  }
  function combo(title,views,byView,cls=''){
    const c=document.createElement('div'); c.className=`ap-nav-combo ${cls}`.trim();
    const h=document.createElement('div'); h.className='ap-nav-combo-title'; h.textContent=title; c.appendChild(h);
    views.forEach(v=>{const b=byView.get(v);if(b)c.appendChild(b)}); return c;
  }

  function organizeNav(){
    const nav=q('#mainNav'); if(!nav || nav.dataset.apExact==='2') return;
    const buttons=qa('.nav-item',nav); if(!buttons.length) return;
    const byView=new Map(buttons.map(b=>[b.dataset.view,b]));
    buttons.forEach(b=>{
      const v=b.dataset.view; const lab=menuLabel(b);
      const visibleLabels={today:'Central de Operação',deliveries:'Entregas',cycles:'Roteirização',trace:'Pesquisar entregas',dashboard:'Desempenho',reports:'Relatórios',odometer:'Quilometragem & Frota',settings:'Administração & Cadastros'};
      if(lab && visibleLabels[v]) setText(lab,visibleLabels[v]);
      const ico=q('.nav-ico',b); if(ico && icons[v]) ico.innerHTML=icons[v];
      b.title=visibleLabels[v]||labelMap[v]||lab?.textContent||v||'Menu'; b.remove();
    });
    qa('.nav-caption',nav).forEach(x=>x.remove()); nav.textContent='';
    const op=group('OPERAÇÃO');
    ['today','deliveries','cycles','trace'].forEach(v=>{const b=byView.get(v);if(b)op.appendChild(b)});nav.appendChild(op);
    const an=group('ANÁLISES');
    ['dashboard','reports','odometer'].forEach(v=>{const b=byView.get(v);if(b)an.appendChild(b)});nav.appendChild(an);
    const ad=group('ADMINISTRAÇÃO');
    ['settings'].forEach(v=>{const b=byView.get(v);if(b)ad.appendChild(b)});nav.appendChild(ad);
    const hidden=document.createElement('div');hidden.className='ap-nav-hidden';
    ['scheduled','pending','route-history','neighborhoods','costs','trash'].forEach(v=>{const b=byView.get(v);if(b)hidden.appendChild(b)});nav.appendChild(hidden);
    const mode=q('.mode-card');if(mode){mode.remove();const train=group('TREINAMENTO','ap-training-wrap');train.appendChild(mode);nav.appendChild(train)}
    nav.dataset.apExact='2';
  }

  function ensureBottomBranding(){
    const sidebar=q('.sidebar'); if(!sidebar || q('.ap-side-branding',sidebar)) return;
    const box=document.createElement('div'); box.className='ap-side-branding';
    box.innerHTML=`
      <div class="ap-triela-box"><img src="${A.triela}" alt="Triela Soluções"></div>
      <img class="ap-mascot" src="${A.mascot}" alt="Mascote Nilo">
      <div class="ap-status-card"><div class="ap-status-copy"><div class="ap-status-title">Modo local <span>•</span> offline <i></i></div><small>Operação • sincronização • Layout V33</small></div><span class="ap-status-icon">⇩</span></div>`;
    sidebar.appendChild(box);
    syncStatus();
  }

  function syncStatus(){
    const title=q('#connectionTitle')?.textContent||''; const sub=q('#connectionSubtitle')?.textContent||'';
    const t=q('.ap-status-title'); const s=q('.ap-status-copy small'); const dot=q('.ap-status-title i');
    const online=/conect|sincron|backup automático ativo/i.test(`${title} ${sub}`) && !/offline|sem internet/i.test(`${title} ${sub}`);
    if(t){ t.childNodes[0].nodeValue = online ? 'Modo conectado ' : 'Modo local '; }
    if(s) s.textContent = online ? 'Operação • sincronização ativa • Layout V33' : 'Operação • sincronização • Layout V33';
    if(dot) dot.style.background = online ? '#38d984' : '#f6c347';
  }

  function ensureTopbar(){
    const top=q('.topbar'), title=q('.topbar-title'); if(!top||!title) return;
    if(!q('.ap-desktop-toggle',top)){
      const b=document.createElement('button'); b.type='button'; b.className='ap-desktop-toggle'; b.setAttribute('aria-label','Recolher ou expandir menu'); b.textContent='☰';
      b.addEventListener('click',()=>document.body.classList.toggle('ap-menu-collapsed'));
      top.insertBefore(b,title);
    }
    const copy=q(':scope > div',title); if(copy && !q('.ap-greeting',copy)){
      const g=document.createElement('span'); g.className='ap-greeting'; g.textContent='Olá, Prevenção! 👋'; copy.prepend(g);
    }
    if(!q('.ap-top-collapsed-brands',top)){
      const cb=document.createElement('div'); cb.className='ap-top-collapsed-brands'; cb.innerHTML=`<img src="${A.nilo}" alt="Nilo"><span></span><img src="${A.triela}" alt="Triela">`;
      top.insertBefore(cb,title);
    }
    if(!q('.ap-mobile-brand',top)){
      const m=document.createElement('div'); m.className='ap-mobile-brand';
      m.innerHTML=`<div class="ap-mobile-brand-row"><div class="ap-mobile-brand-logos"><img class="ap-mobile-nilo" src="${A.nilo}" alt="Nilo"><span class="ap-mobile-brand-sep"></span><img class="ap-mobile-triela" src="${A.triela}" alt="Triela"></div><div class="ap-mobile-tools"><span class="ap-mobile-bell">♧</span><img class="ap-mobile-avatar" src="${A.mascot}" alt="Mascote"></div></div><div class="ap-mobile-greeting"><strong>Olá, Prevenção! 👋</strong><span>Bem-vindo ao Sistema de Entregas</span><small>Ambiente real</small></div>`;
      top.prepend(m);
    }
  }

  function syncPage(){
    const view=activeView(); document.body.dataset.apView=view;
    const meta=titleMap[view]; if(meta){setText(q('#pageTitle'),meta[0]);setText(q('#pageSubtitle'),meta[1])}
    qa('.ap-mobile-dock button').forEach(b=>{
      const v=b.dataset.apMobile; const group = v==='today' ? ['today'] : v==='deliveries' ? ['deliveries','scheduled','pending'] : v==='cycles' ? ['cycles','route-history','odometer'] : v==='reports' ? ['dashboard','reports','neighborhoods','costs'] : [];
      b.classList.toggle('active',group.includes(view));
    });
  }

  function ensureMobileDock(){
    if(q('.ap-mobile-dock')) return;
    const dock=document.createElement('nav'); dock.className='ap-mobile-dock'; dock.setAttribute('aria-label','Navegação principal');
    [['today','Início','today'],['deliveries','Entregas','deliveries'],['cycles','Rotas','cycles'],['reports','Relatórios','dashboard'],['more','Mais','more']].forEach(([key,label,iconKey])=>{
      const b=document.createElement('button'); b.type='button'; b.dataset.apMobile=key; b.innerHTML=`${icons[iconKey]||icons.more}<span>${label}</span>`;
      b.addEventListener('click',()=>{
        if(key==='more'){(q('#mobileMenuBtn')||q('#menuBtn'))?.click(); return;}
        const target = key==='reports' ? (navButton('dashboard')||navButton('reports')) : navButton(key); target?.click();
      }); dock.appendChild(b);
    });
    document.body.appendChild(dock);
    const fab=document.createElement('button'); fab.type='button'; fab.className='ap-mobile-register'; fab.innerHTML='<span style="font-size:20px">＋</span> Registrar compra';
    fab.addEventListener('click',()=> (q('#mobileNewDeliveryBtn')||q('#quickNewDeliveryBtn'))?.click()); document.body.appendChild(fab);
  }

  function registerCardByField(form,name){
    const el=q(`[name="${name}"]`,form);
    return el?.closest('.quick-step-card') || null;
  }

  function setRegisterStep(card,n,title,subtitle=''){
    if(!card) return;
    let head=q('.quick-step-head',card);
    if(!head){
      head=document.createElement('div');
      head.className='quick-step-head';
      head.innerHTML=`<span>${n}</span><div><strong>${title}</strong>${subtitle?`<small>${subtitle}</small>`:''}</div>`;
      card.prepend(head);
      return;
    }
    const badge=q(':scope > span',head);
    const strong=q('strong',head);
    if(badge) badge.textContent=String(n);
    if(strong) strong.textContent=title;
  }

  function organizeRegisterFields(){
    const form=q('#quickDeliveryForm');
    if(!form) return;

    const identity=registerCardByField(form,'orderNo') || registerCardByField(form,'coupon');
    const fee=q('#feeChoices',form)?.closest('.quick-step-card') || registerCardByField(form,'fee');
    const delivery=q('#deliveryModeChoices',form)?.closest('.quick-step-card') || registerCardByField(form,'deliveryMode');
    const type=q(':scope > .v28-quick-type-step',form) ||
      qa(':scope > *',form).find(el=>q('[data-v26-new-large-toggle]',el)||q('[data-v26-new-planned]',el));

    if(identity){
      identity.classList.add('ap-step-identification');
      setRegisterStep(identity,1,'Identificação da compra','Dados originais da compra no PDV.');
    }
    if(type){
      type.classList.add('ap-step-type');
      setRegisterStep(type,2,'Tipo da entrega','Escolha normal ou entrega grande.');
    }
    if(fee){
      fee.classList.add('ap-step-fee');
      setRegisterStep(fee,3,'Taxa cobrada no PDV','O faturamento entra no registro da compra.');
    }
    if(delivery){
      delivery.classList.add('ap-step-delivery');
      setRegisterStep(delivery,4,'Quando será entregue?','Escolha entrega imediata ou agendamento.');
    }

    if(identity){
      const grid=q('.quick-entry-grid',identity);
      if(grid){
        const addressNames=['neighborhoodId','address','addressNumber','addressComplement','addressReference','customerName','customerPhone'];
        let addressCard=q(':scope > .ap-step-address',form);

        if(!addressCard){
          addressCard=document.createElement('section');
          addressCard.className='quick-step-card ap-step-address';
          addressCard.innerHTML='<div class="quick-step-head"><span>5</span><div><strong>Endereço e cliente</strong><small>Dados para localizar a entrega e identificar o cliente.</small></div></div><div class="quick-entry-grid ap-address-grid"></div>';
          const actions=q(':scope > .form-actions',form);
          form.insertBefore(addressCard,actions||null);
        }

        const addrGrid=q('.ap-address-grid',addressCard);
        addressNames.forEach(name=>{
          const input=q(`[name="${name}"]`,form);
          const label=input?.closest('label');
          if(label && label.closest('.ap-step-address')!==addressCard){
            label.classList.add(`ap-field-${name}`);
            addrGrid.appendChild(label);
          }
        });

        const priority=q('[name="priority"]',form)?.closest('label');
        if(priority && delivery && priority.closest('.ap-step-delivery')!==delivery){
          priority.classList.add('ap-register-priority');
          const target=q('.quick-entry-grid',delivery) || delivery;
          target.appendChild(priority);
        }
      }
    }
  }

  function decorateRegister(){
    const wrap=q('#modalWrap'), modal=q('#modal'); if(!wrap||!modal) return;
    const title=q('#modalTitle')?.textContent||''; const active=/Registrar nova compra|Nova compra|Registrar compra/i.test(title) || Boolean(q('#quickDeliveryForm'));
    wrap.classList.toggle('ap-register-wrap',active);
    if(!active) return;
    const head=q('.modal-head',modal); if(head && !q('.ap-register-stepper',head)){
      const st=document.createElement('div'); st.className='ap-register-stepper'; ['Identificação','Tipo','Taxa','Entrega','Endereço'].forEach((x,i)=>{const s=document.createElement('span');s.innerHTML=`<b>${i+1}</b>${x}`;st.appendChild(s)}); const copy=q(':scope > div',head); (copy||head).appendChild(st);
    }
    organizeRegisterFields();
  }

  function applyIcons(){
    qa('#mainNav .nav-item').forEach(b=>{const v=b.dataset.view,ico=q('.nav-ico',b); if(ico&&icons[v]&&ico.dataset.apIcon!==v){ico.innerHTML=icons[v];ico.dataset.apIcon=v}});
  }

  function apply(){
    if(applying) return; applying=true;
    try{
      document.body.classList.add('nilo-v33-exact');
      if(innerWidth>900 && !document.body.dataset.apInitial){document.body.dataset.apInitial='1';document.body.classList.remove('ap-menu-collapsed')}
      ensureSidebarBrand(); organizeNav(); applyIcons(); ensureBottomBranding(); ensureTopbar(); ensureMobileDock(); decorateRegister(); syncPage(); syncStatus();
    } finally { applying=false; }
  }
  function schedule(){ if(scheduled) return; scheduled=true; requestAnimationFrame(()=>{scheduled=false;apply()}) }

  function init(){
    apply();
    const targets=[q('#mainNav'),q('#view'),q('#modalWrap'),q('#connectionCard'),q('.topbar')].filter(Boolean);
    const observer=new MutationObserver(schedule); targets.forEach(t=>observer.observe(t,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']}));
    window.addEventListener('resize',schedule,{passive:true});
    document.addEventListener('click',e=>{ if(e.target.closest('#mainNav .nav-item,[data-mobile-view],.tab-btn')) setTimeout(schedule,0); });
    setInterval(syncStatus,4000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(init,250),{once:true}); else setTimeout(init,250);
})();
