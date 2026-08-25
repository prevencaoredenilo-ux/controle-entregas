/* ================================================================
   NILO ENTREGAS • V24 ESTÁVEL
   ROTA PLANEJADA / POSSÍVEL ROTA
   - Não rastreia GPS real do entregador.
   - Não depende de geocodificador externo.
   - NILO é sempre saída e retorno.
   - Monta uma sequência operacional sugerida.
   - Exibe prévia Google Maps e abre a rota no Google Maps.
   ================================================================ */
(() => {
  'use strict';

  const DB_NAME='controle_entregas_nx';
  const DB_VERSION=1;
  const STORE_NAME='app_state';
  const STATE_KEY='main';

  const NILO_ADDRESS='Avenida Araés, 729, Novo Horizonte, Nova Xavantina - MT, 78690-000, Brasil';
  const NILO_PLACE_ID='ChIJCV1NPkNtbpMRbTPTuRhdExo';
  const MAX_POINTS_PER_MAP=8;

  const q=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();

  let db=null;
  let busy=false;
  let selectedCycleId='';
  let lastKey='';

  function openDB(){
    if(db)return Promise.resolve(db);
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE_NAME))req.result.createObjectStore(STORE_NAME)};
      req.onsuccess=()=>{db=req.result;resolve(db)};
      req.onerror=()=>reject(req.error);
    });
  }

  async function readState(){
    await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readonly');
      const req=tx.objectStore(STORE_NAME).get(STATE_KEY);
      req.onsuccess=()=>resolve(req.result||{});
      req.onerror=()=>reject(req.error);
    });
  }

  function currentMode(s){return s?.settings?.appMode==='training'?'training':'production'}
  function scoped(list,s){const mode=currentMode(s);return (list||[]).filter(x=>(x?.mode||'production')===mode)}
  function roots(list){return (list||[]).filter(d=>!d.parentId||d.rootId===d.id||!d.rootId)}
  function rootKey(d){return d?.rootId||d?.id}
  function dateObj(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v||''));return m?new Date(+m[1],+m[2]-1,+m[3]):null}
  function dateBR(v){const d=dateObj(v);return d?new Intl.DateTimeFormat('pt-BR').format(d):'—'}
  function isoDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):''}
  function todayISO(){const d=new Date(),z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)}

  function selectedRange(){
    const start=isoDate(q('#filterStart')?.value),end=isoDate(q('#filterEnd')?.value);
    if(start&&end)return {start:start<=end?start:end,end:start<=end?end:start};
    const y=q('#filterYear')?.value||todayISO().slice(0,4),m=q('#filterMonth')?.value||'';
    if(m){
      const last=new Date(Number(y),Number(m),0).getDate();
      return {start:`${y}-${m}-01`,end:`${y}-${m}-${String(last).padStart(2,'0')}`};
    }
    return {start:`${y}-01-01`,end:`${y}-12-31`};
  }
  function inRange(d,r){return !!d&&d>=r.start&&d<=r.end}

  function neighborhood(s,id){return (s.neighborhoods||[]).find(n=>n.id===id)}

  // Centro I e Centro II não são tratados como o mesmo "Centro".
  const MAP_FALLBACKS={
    'CENTRO I':'Avenida Brasil Central, Setor Xavantina, Nova Xavantina - MT, Brasil',
    'CENTRO II':'Avenida Rio Grande do Sul, Centro Comercial, Nova Xavantina - MT, Brasil',
    'BARRO VERMELHO':'Bairro Vermelho, Nova Xavantina - MT, Brasil',
    'ESTILAC':'Estilac Leal, Nova Xavantina - MT, Brasil',
    'FLOR DE LIZ/LYZ':'Flor de Liz, Nova Xavantina - MT, Brasil',
    'HENRRY I':'Henry I, Nova Xavantina - MT, Brasil',
    'HENRRY II':'Henry II, Nova Xavantina - MT, Brasil',
    'SANTA ANA / SANTANA':'Santana, Nova Xavantina - MT, Brasil',
    'TONETTO':'Tonetto, Nova Xavantina - MT, Brasil',
    'VERDES CAMPOS':'Verdes Campos, Nova Xavantina - MT, Brasil',
    'PARQUE AQUARIO':'Parque Aquário, Nova Xavantina - MT, Brasil',
    'SETOR NOVA XAVANTINA':'Setor Xavantina, Nova Xavantina - MT, Brasil'
  };

  function deliveryAddress(s,d){
    const nb=neighborhood(s,d.neighborhoodId);
    const street=String(d.address||'').trim();
    const number=String(d.addressNumber||'').trim();
    if(street && number){
      return `${street}, ${number}, ${nb?.name||''}, Nova Xavantina - MT, Brasil`;
    }
    const n=norm(nb?.name);
    return String(nb?.mapQuery||'').trim()
      || MAP_FALLBACKS[n]
      || (nb?.name ? `${nb.name}, Nova Xavantina - MT, Brasil` : '');
  }

  function addressLine(s,d){
    const nb=neighborhood(s,d.neighborhoodId);
    const street=[d.address,d.addressNumber?`nº ${d.addressNumber}`:''].filter(Boolean).join(', ');
    return [street,nb?.name||''].filter(Boolean).join(' • ') || 'Endereço/bairro não informado';
  }

  function deliveryLabel(d){return d.customerName||`Compra ${d.orderNo||d.coupon||'—'}`}

  function cycleDeliveries(s,cycle){
    const all=roots(scoped(s.deliveries,s));
    const ids=new Set(cycle?.routeDeliveryIds||[]);
    let rows=all.filter(d=>d.cycleId===cycle?.id || ids.has(d.id) || ids.has(rootKey(d)));
    if(!rows.length&&cycle?.date)rows=all.filter(d=>d.date===cycle.date&&d.cycleId===cycle.id);
    return rows.filter(d=>!['Cancelada','Retirada na loja'].includes(d.status));
  }

  function availableCycles(s,range){
    return scoped(s.cycles,s)
      .filter(c=>inRange(c.date,range))
      .filter(c=>cycleDeliveries(s,c).length)
      .sort((a,b)=>`${b.date||''}${b.departureTime||''}${b.createdAt||''}`.localeCompare(`${a.date||''}${a.departureTime||''}${a.createdAt||''}`));
  }

  function fallbackRows(s,range){
    const all=roots(scoped(s.deliveries,s)).filter(d=>inRange(d.date,range)&&!['Cancelada','Retirada na loja'].includes(d.status));
    const dates=[...new Set(all.map(d=>d.date).filter(Boolean))].sort();
    const day=dates.at(-1);
    return day?all.filter(d=>d.date===day):all.slice(-MAX_POINTS_PER_MAP);
  }

  function sideOrder(nb){
    const region=norm(nb?.region);
    const name=norm(nb?.name);
    if(name==='CENTRO II')return 0;
    if(name==='CENTRO I')return 1;
    if(region.includes('NOVA BRASILIA'))return 0;
    if(region.includes('XAVANTINA'))return 1;
    return 2;
  }

  // Rota operacional sugerida:
  // começa no lado Nova Brasília, onde fica o NILO, para evitar cruzar o rio
  // repetidamente; dentro de cada área respeita a ordem de rota cadastrada.
  function suggestedOrder(s,rows){
    return rows.slice().sort((a,b)=>{
      const pa=Boolean(a.priority),pb=Boolean(b.priority);
      if(pa!==pb)return pb-pa;
      const na=neighborhood(s,a.neighborhoodId),nb=neighborhood(s,b.neighborhoodId);
      const sa=sideOrder(na),sb=sideOrder(nb);
      if(sa!==sb)return sa-sb;
      const oa=Number(na?.routeOrder||9999),ob=Number(nb?.routeOrder||9999);
      if(oa!==ob)return oa-ob;
      return String(a.purchaseTime||'').localeCompare(String(b.purchaseTime||''));
    });
  }

  function googleMapsUrl(addresses){
    const points=addresses.filter(Boolean).slice(0,MAX_POINTS_PER_MAP);
    const params=new URLSearchParams({
      api:'1',
      origin:NILO_ADDRESS,
      destination:NILO_ADDRESS,
      travelmode:'driving'
    });
    params.set('origin_place_id',NILO_PLACE_ID);
    params.set('destination_place_id',NILO_PLACE_ID);
    if(points.length)params.set('waypoints',points.join('|'));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  // Prévia sem chave de API. O Google pode ajustar o desenho quando a rota é
  // aberta no Maps; o botão "Abrir no Google Maps" é a referência principal.
  function googleEmbedUrl(addresses){
    const points=addresses.filter(Boolean).slice(0,MAX_POINTS_PER_MAP);
    const daddr=[...points,NILO_ADDRESS].join(' to: ');
    const p=new URLSearchParams({
      f:'d',
      source:'s_d',
      saddr:NILO_ADDRESS,
      daddr,
      hl:'pt-BR',
      output:'embed'
    });
    return `https://maps.google.com/maps?${p.toString()}`;
  }

  function stopList(s,rows){
    return `<div class="v24-stop-list">${rows.map((d,i)=>{
      const nb=neighborhood(s,d.neighborhoodId);
      return `<div class="v24-stop ${d.priority?'priority':''}">
        <span>${i+1}</span>
        <div>
          <strong>${esc(deliveryLabel(d))}</strong>
          <small>${esc(addressLine(s,d))}</small>
        </div>
        <b>${d.priority?'★ PRIORIDADE':esc(nb?.name||'')}</b>
      </div>`;
    }).join('')}</div>`;
  }

  function routeShell(s,cycles,selected,rows){
    const ordered=suggestedOrder(s,rows);
    const addresses=ordered.map(d=>deliveryAddress(s,d)).filter(Boolean);
    const options=cycles.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?.id?'selected':''}>${esc(`${dateBR(c.date)} • ${c.code||'Ciclo'} • ${cycleDeliveries(s,c).length} entrega(s)`)}</option>`).join('');
    const hasRoute=addresses.length>0;
    const mapUrl=hasRoute?googleEmbedUrl(addresses):'';

    return `<div class="v24-route-planner">
      <div class="v24-route-head">
        <div>
          <span class="v24-kicker">ROTA PLANEJADA</span>
          <h3>Possível rota do ciclo</h3>
          <p>O NILO é sempre a saída e o retorno. A ordem abaixo é uma sugestão operacional; ao abrir no Google Maps, o Maps calcula o caminho pelas ruas entre as paradas.</p>
        </div>
        <div class="v24-cycle-select">
          ${cycles.length?`<label>Ciclo / saída<select id="v24CycleSelect">${options}</select></label>`:`<label>Base da rota<select disabled><option>Últimas entregas do período</option></select></label>`}
        </div>
      </div>

      <div class="v24-route-origin">⌂ <strong>Saída e retorno:</strong> NILO Supermercado • Av. Araés, 729 • Novo Horizonte • Nova Xavantina-MT</div>

      <div id="v24MapHolder">
        ${hasRoute
          ? `<iframe class="v24-map-frame" title="Prévia da rota planejada" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="${esc(mapUrl)}"></iframe>`
          : `<div class="v24-map-fallback"><div><strong>Não há endereço suficiente para montar esta rota.</strong><p>Preencha rua/número ou pelo menos o bairro das entregas do ciclo.</p></div></div>`
        }
      </div>

      <div class="v24-route-summary">
        <div><small>Entregas no ciclo</small><strong>${ordered.length}</strong></div>
        <div><small>Pontos enviados ao Maps</small><strong>${Math.min(addresses.length,MAX_POINTS_PER_MAP)}</strong></div>
        <div><small>Saída</small><strong>NILO</strong></div>
        <div><small>Retorno</small><strong>NILO</strong></div>
      </div>

      <div class="v24-route-actions">
        <button type="button" class="btn primary" id="v24OpenMaps" ${hasRoute?'':'disabled'}>↗ Abrir rota no Google Maps</button>
        <button type="button" class="btn secondary" id="v24ReloadPreview" ${hasRoute?'':'disabled'}>⌁ Recarregar prévia</button>
      </div>

      <div>
        <span class="v24-kicker">ORDEM SUGERIDA DAS PARADAS</span>
        ${stopList(s,ordered)}
      </div>

      <div class="v24-note">
        <strong>Importante:</strong> esta tela mostra a rota que o entregador <em>deveria fazer</em>, não o trajeto real percorrido. Centro I e Centro II são tratados separadamente. Se o ciclo tiver muitas entregas, o Google Maps pode limitar a quantidade de paradas mostradas em uma única navegação.
      </div>
    </div>`;
  }

  async function mount(){
    if(busy)return;
    const title=q('#pageTitle')?.textContent||'',view=q('#view');
    if(!view||!(/Histórico de rotas|Rotas dos entregadores/i.test(title)))return;

    const panel=q('.v16-route-main .route-map-panel',view);
    if(!panel)return;

    busy=true;
    try{
      const s=await readState(),range=selectedRange(),cycles=availableCycles(s,range);
      if(!selectedCycleId||!cycles.some(c=>c.id===selectedCycleId))selectedCycleId=cycles[0]?.id||'';
      const selected=cycles.find(c=>c.id===selectedCycleId)||null;
      const rows=selected?cycleDeliveries(s,selected):fallbackRows(s,range);
      const key=[range.start,range.end,selectedCycleId,rows.map(d=>`${d.id}:${d.updatedAt||''}`).join('|')].join('::');
      if(panel.dataset.v24==='1'&&lastKey===key)return;

      panel.innerHTML=routeShell(s,cycles,selected,rows);
      panel.dataset.v24='1';
      lastKey=key;

      q('#v24CycleSelect')?.addEventListener('change',e=>{
        selectedCycleId=e.target.value;
        lastKey='';
        setTimeout(mount,40);
      });

      const ordered=suggestedOrder(s,rows);
      const addresses=ordered.map(d=>deliveryAddress(s,d)).filter(Boolean);

      q('#v24OpenMaps')?.addEventListener('click',()=>{
        window.open(googleMapsUrl(addresses),'_blank','noopener,noreferrer');
      });

      q('#v24ReloadPreview')?.addEventListener('click',()=>{
        const frame=q('.v24-map-frame');
        if(frame){
          const src=frame.src;
          frame.src='about:blank';
          setTimeout(()=>frame.src=src,80);
        }
      });
    }catch(err){
      console.warn('[NILO V24] rota planejada',err);
    }finally{
      busy=false;
    }
  }

  let timer=null;
  function schedule(delay=120){
    clearTimeout(timer);
    timer=setTimeout(mount,delay);
  }
  function start(){
    const view=q('#view');
    if(!view){setTimeout(start,250);return}
    new MutationObserver(()=>schedule(150)).observe(view,{childList:true,subtree:false});
    const title=q('#pageTitle');
    if(title)new MutationObserver(()=>schedule(150)).observe(title,{childList:true,characterData:true,subtree:true});
    schedule(600);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
