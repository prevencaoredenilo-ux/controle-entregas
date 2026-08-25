/* ================================================================
   NILO ENTREGAS • V17
   ROTEIRIZAÇÃO PLANEJADA
   - Usa endereço, número e bairro já cadastrados.
   - Geocodifica os pontos.
   - Calcula sequência eficiente e traçado viário.
   - Abre a sequência no Google Maps.
   - Não depende do GPS do entregador.
   ================================================================ */
(() => {
  'use strict';

  const DB_NAME='controle_entregas_nx';
  const DB_VERSION=1;
  const STORE_NAME='app_state';
  const STATE_KEY='main';
  const MAX_STOPS=9; // mantém compatibilidade prática com Google Maps URLs.
  const GEOCODE_CACHE_KEY='nilo_v17_geocode_cache';

  const q=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmtKm=m=>`${new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format((Number(m)||0)/1000)} km`;
  const fmtDuration=s=>{
    s=Math.round(Number(s)||0);
    const h=Math.floor(s/3600),m=Math.round((s%3600)/60);
    return h?`${h}h ${String(m).padStart(2,'0')}m`:`${m} min`;
  };

  let db=null;
  let enhancing=false;
  let leafletMap=null;
  let routeLayer=null;
  let markerLayer=null;
  let selectedCycleId='';
  let lastContextKey='';

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
  function rootKey(d){return d?.rootId||d?.id}
  function roots(list){return (list||[]).filter(d=>!d.parentId||d.rootId===d.id||!d.rootId)}
  function isFinal(d){return d?.status==='Finalizada'||Boolean(d?.finalizationTime)}
  function isClosedState(d){return ['Finalizada','Devolvida','Retirada na loja','Cancelada'].includes(d?.status)||isFinal(d)}
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
  function deliveryAddress(s,d){
    const nb=neighborhood(s,d.neighborhoodId);
    const city=String(s?.settings?.routeCity||'Nova Xavantina - MT').trim();
    const street=String(d.address||'').trim();
    const number=String(d.addressNumber||'').trim();
    if(street && number){
      return [street,number,nb?.name||'',city,'Brasil'].filter(Boolean).join(', ');
    }
    const nq=String(nb?.mapQuery||'').trim()||nb?.name||'';
    return [nq,city,'Brasil'].filter(Boolean).join(', ');
  }
  function addressLine(s,d){
    const nb=neighborhood(s,d.neighborhoodId);
    const street=[d.address,d.addressNumber?`nº ${d.addressNumber}`:''].filter(Boolean).join(', ');
    return [street,nb?.name||''].filter(Boolean).join(' • ') || 'Endereço não informado';
  }
  function deliveryLabel(d){return d.customerName||`Compra ${d.orderNo||d.coupon||'—'}`}

  function cycleDeliveries(s,cycle){
    const all=roots(scoped(s.deliveries,s));
    const ids=new Set(cycle?.routeDeliveryIds||[]);
    let rows=all.filter(d=>d.cycleId===cycle?.id || ids.has(d.id) || ids.has(rootKey(d)));
    if(!rows.length && cycle?.date) rows=all.filter(d=>d.date===cycle.date && d.cycleId===cycle.id);
    return rows;
  }

  function availableCycles(s,range){
    return scoped(s.cycles,s)
      .filter(c=>inRange(c.date,range))
      .filter(c=>cycleDeliveries(s,c).length)
      .sort((a,b)=>`${b.date||''}${b.departureTime||''}${b.createdAt||''}`.localeCompare(`${a.date||''}${a.departureTime||''}${a.createdAt||''}`));
  }

  function fallbackDeliveries(s,range){
    const rows=roots(scoped(s.deliveries,s)).filter(d=>inRange(d.date,range));
    const dates=[...new Set(rows.map(d=>d.date).filter(Boolean))].sort();
    const day=dates.at(-1);
    return day?rows.filter(d=>d.date===day && !isClosedState(d)):rows.slice(-MAX_STOPS);
  }

  function routeSortFallback(s,rows){
    return rows.slice().sort((a,b)=>{
      const p=Number(Boolean(b.priority))-Number(Boolean(a.priority)); if(p)return p;
      const na=neighborhood(s,a.neighborhoodId),nb=neighborhood(s,b.neighborhoodId);
      const oa=Number(na?.routeOrder||9999),ob=Number(nb?.routeOrder||9999);
      if(oa!==ob)return oa-ob;
      return String(a.purchaseTime||'').localeCompare(String(b.purchaseTime||''));
    });
  }

  function loadCache(){
    try{return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY)||'{}')||{}}
    catch{return {}}
  }
  function saveCache(c){
    try{localStorage.setItem(GEOCODE_CACHE_KEY,JSON.stringify(c))}
    catch{}
  }
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  async function geocode(query,cache){
    const key=query.toLowerCase().replace(/\s+/g,' ').trim();
    if(cache[key])return cache[key];
    const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&q=${encodeURIComponent(query)}`;
    const res=await fetch(url,{headers:{'Accept-Language':'pt-BR,pt;q=0.9'}});
    if(!res.ok)throw new Error(`Geocodificação indisponível (${res.status})`);
    const rows=await res.json();
    if(!rows?.length)return null;
    const point={lat:Number(rows[0].lat),lon:Number(rows[0].lon),displayName:rows[0].display_name||query};
    cache[key]=point;saveCache(cache);
    await sleep(1050); // respeita o serviço público e evita rajadas.
    return point;
  }

  async function geocodeStops(s,origin,deliveries,statusEl){
    const cache=loadCache(),points=[];
    statusEl.textContent='Localizando depósito...';
    const originPoint=await geocode(origin,cache);
    if(!originPoint)throw new Error('Não foi possível localizar o ponto de saída.');

    for(let i=0;i<deliveries.length;i++){
      const d=deliveries[i],query=deliveryAddress(s,d);
      if(!query)continue;
      statusEl.textContent=`Localizando parada ${i+1} de ${deliveries.length}...`;
      try{
        const p=await geocode(query,cache);
        if(p)points.push({delivery:d,...p,query});
      }catch(err){
        console.warn('[NILO V17] endereço não localizado',query,err);
      }
    }
    return {originPoint,points};
  }

  async function calculateRoadTrip(originPoint,points){
    if(points.length<1)return null;
    const coords=[originPoint,...points].map(p=>`${p.lon},${p.lat}`).join(';');
    const url=`https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&roundtrip=true&overview=full&geometries=geojson&steps=false`;
    const res=await fetch(url);
    if(!res.ok)throw new Error(`Serviço de rota indisponível (${res.status})`);
    const data=await res.json();
    if(data.code!=='Ok'||!data.trips?.length)throw new Error('Não foi possível calcular o trajeto viário.');
    const ordered=points.map((p,i)=>({...p,waypointIndex:data.waypoints?.[i+1]?.waypoint_index??i+1}))
      .sort((a,b)=>a.waypointIndex-b.waypointIndex);
    return {trip:data.trips[0],ordered};
  }

  function googleMapsUrl(origin,ordered){
    const waypoints=ordered.map(p=>p.query).slice(0,MAX_STOPS);
    const parts=[
      'https://www.google.com/maps/dir/?api=1',
      `origin=${encodeURIComponent(origin)}`,
      `destination=${encodeURIComponent(origin)}`,
      `travelmode=driving`
    ];
    if(waypoints.length)parts.push(`waypoints=${encodeURIComponent(waypoints.join('|'))}`);
    return parts.join('&');
  }

  function destroyMap(){
    try{leafletMap?.remove()}catch{}
    leafletMap=null;routeLayer=null;markerLayer=null;
  }

  function iconHtml(n,priority){
    return `<div class="v17-leaflet-stop ${priority?'priority':''}">${n}</div>`;
  }

  function renderMap(result,originPoint){
    destroyMap();
    const el=q('#v17RouteMap');
    if(!el||!window.L)return;
    leafletMap=L.map(el,{zoomControl:true,attributionControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'© OpenStreetMap'
    }).addTo(leafletMap);

    const latlngs=result.trip.geometry.coordinates.map(([lon,lat])=>[lat,lon]);
    routeLayer=L.polyline(latlngs,{weight:5,opacity:.85}).addTo(leafletMap);

    const originMarker=L.circleMarker([originPoint.lat,originPoint.lon],{
      radius:8,weight:3,fillOpacity:1
    }).addTo(leafletMap).bindPopup('Saída / retorno • Nilo');

    result.ordered.forEach((p,i)=>{
      const icon=L.divIcon({className:'',html:iconHtml(i+1,Boolean(p.delivery.priority)),iconSize:[28,28],iconAnchor:[14,14]});
      L.marker([p.lat,p.lon],{icon})
        .addTo(leafletMap)
        .bindPopup(`<strong>${esc(deliveryLabel(p.delivery))}</strong><br>${esc(p.query)}`);
    });

    const bounds=L.latLngBounds(latlngs);
    leafletMap.fitBounds(bounds,{padding:[24,24]});
  }

  function stopList(s,rows){
    return `<div class="v17-stop-list">${rows.map((p,i)=>{
      const d=p.delivery||p;
      return `<div class="v17-stop ${d.priority?'priority':''}">
        <span>${i+1}</span>
        <div><strong>${esc(deliveryLabel(d))}</strong><small>${esc(p.query||addressLine(s,d))}</small></div>
        <b>${d.priority?'★ PRIORIDADE':esc(neighborhood(s,d.neighborhoodId)?.name||'')}</b>
      </div>`;
    }).join('')}</div>`;
  }

  function plannerShell(s,cycles,selected,rows){
    const origin=String(s?.settings?.routeOrigin||'Nilo Supermercado, Nova Xavantina - MT').trim();
    const options=cycles.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?.id?'selected':''}>${esc(`${dateBR(c.date)} • ${c.code||'Ciclo'} • ${cycleDeliveries(s,c).length} entrega(s)`)}</option>`).join('');
    const fallback=routeSortFallback(s,rows).slice(0,MAX_STOPS);

    return `<div class="v17-planner">
      <div class="v17-planner-head">
        <div>
          <span class="v17-planner-kicker">ROTEIRIZAÇÃO AUTOMÁTICA</span>
          <h3>Rota mais eficiente planejada</h3>
          <p>O sistema usa os endereços preenchidos para organizar as paradas. A sequência pode ser aberta diretamente no Google Maps.</p>
        </div>
        <div class="v17-route-selector">
          ${cycles.length?`<label>Ciclo / saída<select id="v17CycleSelect">${options}</select></label>`:`<label>Base da rota<select disabled><option>Último movimento do período</option></select></label>`}
        </div>
      </div>
      <div id="v17RouteStatus" class="v17-route-status">Preparando ${fallback.length} parada(s) • saída em ${esc(origin)}</div>
      <div id="v17MapHolder">
        ${fallback.length?`<div id="v17RouteMap" class="v17-map"></div>`:`<div class="v17-route-empty"><span>⌁</span><strong>Nenhuma entrega disponível para roteirizar</strong><p>Cadastre rua/avenida, número e bairro nas entregas e monte um ciclo. O mapa planejado não depende do GPS do entregador.</p></div>`}
      </div>
      <div id="v17RouteSummary" class="v17-route-summary">
        <div><small>Paradas</small><strong>${fallback.length}</strong></div>
        <div><small>Distância estimada</small><strong>—</strong></div>
        <div><small>Tempo estimado</small><strong>—</strong></div>
        <div><small>Prioridades</small><strong>${fallback.filter(d=>d.priority).length}</strong></div>
      </div>
      <div id="v17RouteActions" class="v17-route-actions">
        <button type="button" class="btn primary" id="v17CalculateRoute" ${fallback.length?'':'disabled'}>⌁ Calcular rota mais eficiente</button>
        <button type="button" class="btn secondary" id="v17OpenMaps" ${fallback.length?'':'disabled'}>↗ Abrir no Google Maps</button>
      </div>
      <div id="v17Stops">${stopList(s,fallback)}</div>
      <div class="v17-route-note"><strong>Como funciona:</strong> o traçado planejado usa os endereços da entrega, não o GPS do entregador. O cálculo viário é feito pelo app e a sequência final pode ser enviada ao Google Maps. Entregas marcadas como prioridade permanecem destacadas.</div>
    </div>`;
  }

  async function mount(){
    if(enhancing)return;
    const title=q('#pageTitle')?.textContent||'',view=q('#view');
    if(!view||!(/Histórico de rotas|Rotas dos entregadores/i.test(title)))return;

    // Aguarda a composição V16 existir.
    const mapPanel=q('.v16-route-main .route-map-panel',view);
    if(!mapPanel)return;

    const s=await readState(),range=selectedRange(),cycles=availableCycles(s,range);
    if(!selectedCycleId||!cycles.some(c=>c.id===selectedCycleId))selectedCycleId=cycles[0]?.id||'';
    const selected=cycles.find(c=>c.id===selectedCycleId)||null;
    const rows=(selected?cycleDeliveries(s,selected):fallbackDeliveries(s,range)).filter(d=>!['Cancelada','Retirada na loja'].includes(d.status));
    const contextKey=[range.start,range.end,selectedCycleId,rows.map(d=>`${d.id}:${d.updatedAt||''}`).join('|')].join('::');

    if(mapPanel.dataset.v17Planner==='1'&&lastContextKey===contextKey)return;

    enhancing=true;
    try{
      destroyMap();
      mapPanel.innerHTML=plannerShell(s,cycles,selected,rows);
      mapPanel.dataset.v17Planner='1';
      lastContextKey=contextKey;

      q('#v17CycleSelect')?.addEventListener('change',e=>{
        selectedCycleId=e.target.value;
        lastContextKey='';
        setTimeout(mount,30);
      });

      const calculate=q('#v17CalculateRoute'),openMaps=q('#v17OpenMaps');
      let calculated=null;
      let orderedFallback=routeSortFallback(s,rows).slice(0,MAX_STOPS);
      const origin=String(s?.settings?.routeOrigin||'Nilo Supermercado, Nova Xavantina - MT').trim();

      openMaps?.addEventListener('click',()=>{
        const ordered=calculated?.ordered||orderedFallback.map(d=>({delivery:d,query:deliveryAddress(s,d)}));
        window.open(googleMapsUrl(origin,ordered),'_blank','noopener,noreferrer');
      });

      async function calculateNow(){
        if(!orderedFallback.length)return;
        const status=q('#v17RouteStatus');
        calculate.disabled=true;
        status.classList.add('loading');
        try{
          const withAddress=orderedFallback.filter(d=>deliveryAddress(s,d));
          if(!withAddress.length)throw new Error('As entregas desta saída não têm endereço suficiente.');

          const located=await geocodeStops(s,origin,withAddress,status);
          if(!located.points.length)throw new Error('Nenhum endereço pôde ser localizado.');

          status.textContent='Calculando sequência e trajeto viário...';
          const trip=await calculateRoadTrip(located.originPoint,located.points);
          calculated=trip;
          renderMap(trip,located.originPoint);

          const ordered=trip.ordered;
          q('#v17Stops').innerHTML=stopList(s,ordered);
          q('#v17RouteSummary').innerHTML=`
            <div><small>Paradas calculadas</small><strong>${ordered.length}</strong></div>
            <div><small>Distância estimada</small><strong>${fmtKm(trip.trip.distance)}</strong></div>
            <div><small>Tempo estimado</small><strong>${fmtDuration(trip.trip.duration)}</strong></div>
            <div><small>Prioridades</small><strong>${ordered.filter(p=>p.delivery.priority).length}</strong></div>`;
          status.textContent=`Rota calculada • ${ordered.length} parada(s) • ${fmtKm(trip.trip.distance)} • ${fmtDuration(trip.trip.duration)}`;
          openMaps.disabled=false;
        }catch(err){
          console.warn('[NILO V17] roteirização',err);
          status.textContent=`Não foi possível desenhar a rota automaticamente: ${err.message||err}. A sequência sugerida continua disponível para abrir no Google Maps.`;
          q('#v17MapHolder').innerHTML=`<div class="v17-route-empty"><span>⌁</span><strong>Traçado automático indisponível agora</strong><p>${esc(err.message||err)}. Você ainda pode abrir os endereços no Google Maps pela sequência sugerida.</p></div>`;
          openMaps.disabled=false;
        }finally{
          status.classList.remove('loading');
          calculate.disabled=false;
        }
      }

      calculate?.addEventListener('click',calculateNow);

      // Automático para saídas pequenas; não trava a abertura da página.
      if(orderedFallback.length && orderedFallback.length<=6){
        setTimeout(()=>calculateNow(),700);
      }
    }catch(err){
      console.warn('[NILO V17] falha ao montar roteirizador',err);
    }finally{
      enhancing=false;
    }
  }

  // Observa somente mudanças relevantes da view; evita o loop que ocorreu na V15.1.
  const viewObserver=new MutationObserver(()=>setTimeout(mount,100));
  const startObserver=()=>{
    const view=q('#view');
    if(view)viewObserver.observe(view,{childList:true,subtree:false});
  };
  document.addEventListener('DOMContentLoaded',()=>{setTimeout(startObserver,600);setTimeout(mount,950)},{once:true});
  document.addEventListener('click',()=>setTimeout(mount,180));
  setInterval(mount,2200);
})();
