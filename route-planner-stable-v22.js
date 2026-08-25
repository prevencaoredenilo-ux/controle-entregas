/* ================================================================
   NILO ENTREGAS • V22 ESTÁVEL
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
  const GEOCODE_CACHE_KEY='nilo_v22_geocode_cache';
  const NILO_ORIGIN_LABEL='NILO Supermercado • Nova Xavantina';
  const NILO_ORIGIN_ADDRESS='Rua Teresina, 729, Novo Horizonte, Nova Xavantina - MT, 78690-000, Brasil';
  const NILO_GOOGLE_PLACE_ID='ChIJCV1NPkNtbpMRbTPTuRhdExo';
  const NILO_ORIGIN_CANDIDATES=[
    'Rua Teresina, 729, Novo Horizonte, Nova Xavantina - MT, 78690-000, Brasil',
    'Avenida Araés, 729, Novo Horizonte, Nova Xavantina - MT, 78690-000, Brasil',
    'Rua Terezina, 681, Novo Horizonte, Nova Xavantina - MT, 78690-000, Brasil'
  ];

  // Catálogo operacional: mantém o nome que o usuário usa, mas oferece
  // consultas canônicas para mapas e separa áreas que não podem ser misturadas.
  const NEIGHBORHOOD_RULES={
    'BARRO VERMELHO':{queries:['Bairro Vermelho, Nova Xavantina - MT, Brasil']},
    'BOA VISTA':{queries:['Boa Vista, Nova Xavantina - MT, Brasil']},
    'CENTRO I':{side:'XAVANTINA',queries:[
      'Avenida Brasil Central, Setor Xavantina, Nova Xavantina - MT, Brasil',
      'Bairro Central, Setor Xavantina, Nova Xavantina - MT, Brasil',
      'Xavantina Velha, Nova Xavantina - MT, Brasil'
    ]},
    'CENTRO II':{side:'NOVA_BRASILIA',queries:[
      'Avenida Rio Grande do Sul, Centro Comercial, Nova Xavantina - MT, Brasil',
      'Centro Comercial, Setor Nova Brasília, Nova Xavantina - MT, Brasil',
      'Setor Nova Brasília, Nova Xavantina - MT, Brasil'
    ]},
    'CENTRO OESTE':{queries:['Centro Oeste, Nova Xavantina - MT, Brasil']},
    'CHACARAS':{queries:['Chácaras, Nova Xavantina - MT, Brasil']},
    'CONAGRO':{queries:['Conagro, Nova Xavantina - MT, Brasil']},
    'DEUS E AMOR':{queries:['Deus é Amor, Nova Xavantina - MT, Brasil']},
    'ESTILAC':{queries:['Estilac Leal, Nova Xavantina - MT, Brasil','Estilac, Nova Xavantina - MT, Brasil']},
    'FLOR DE LIZ/LYZ':{queries:['Flor de Liz, Nova Xavantina - MT, Brasil','Flor de Lyz, Nova Xavantina - MT, Brasil','Flor de Lis, Nova Xavantina - MT, Brasil']},
    'HENRRY I':{queries:['Henry I, Setor Nova Brasília, Nova Xavantina - MT, Brasil','Mario Duílio Henry I, Nova Xavantina - MT, Brasil']},
    'HENRRY II':{queries:['Henry II, Setor Nova Brasília, Nova Xavantina - MT, Brasil','Mario Duílio Henry II, Nova Xavantina - MT, Brasil']},
    'JARDIM ALVORADA':{queries:['Jardim Alvorada, Nova Xavantina - MT, Brasil']},
    'JARDIM OLIVEIRA':{queries:['Jardim Oliveira, Nova Xavantina - MT, Brasil','Jardim das Oliveiras, Nova Xavantina - MT, Brasil']},
    'JARDIM TROPICAL':{queries:['Jardim Tropical, Nova Xavantina - MT, Brasil']},
    'JARDIM TROPICAL II':{queries:['Jardim Tropical II, Nova Xavantina - MT, Brasil','Jardim Tropical, Nova Xavantina - MT, Brasil'],approx:true},
    'JARDIM TROPICAL III':{queries:['Jardim Tropical III, Nova Xavantina - MT, Brasil','Jardim Tropical, Nova Xavantina - MT, Brasil'],approx:true},
    'MONTES CLAROS':{queries:['Montes Claros, Nova Xavantina - MT, Brasil']},
    'MORADA DO SOL':{queries:['Morada do Sol, Nova Xavantina - MT, Brasil']},
    'NOVO HORIZONTE':{queries:['Novo Horizonte, Nova Xavantina - MT, Brasil']},
    'OLARIA':{queries:['Olaria, Nova Xavantina - MT, Brasil']},
    'PARQUE DOS BURITIS':{queries:['Parque dos Buritis, Nova Xavantina - MT, Brasil']},
    'SANTA ANA / SANTANA':{queries:['Santana, Nova Xavantina - MT, Brasil','Santa Ana, Nova Xavantina - MT, Brasil']},
    'SANTA MÔNICA':{queries:['Santa Mônica, Nova Xavantina - MT, Brasil']},
    'SETOR INDUSTRIAL':{queries:['Setor Industrial, Nova Xavantina - MT, Brasil']},
    'SOLAR DOS IPÊS':{queries:['Loteamento Solar dos Ipês, Nova Xavantina - MT, Brasil','Solar dos Ipês, Nova Xavantina - MT, Brasil']},
    'TONETTO':{queries:['Tonetto, Nova Xavantina - MT, Brasil','Toneto, Nova Xavantina - MT, Brasil','Tonetto I, Nova Xavantina - MT, Brasil','Tonetto II, Nova Xavantina - MT, Brasil']},
    'UNIÃO':{queries:['União, Nova Xavantina - MT, Brasil']},
    'VERDES CAMPOS':{queries:['Verdes Campos, Nova Xavantina - MT, Brasil','Campos Verdes, Nova Xavantina - MT, Brasil']},
    'VILA DO ESTUDANTE':{queries:['Vila do Estudante, Nova Xavantina - MT, Brasil'],approx:true},
    'ZONA RURAL':{queries:[],requiresPrecise:true},
    'BEIRA RIO':{queries:['Avenida Beira Rio Jacinto Canoeiro, Nova Xavantina - MT, Brasil','Beira Rio, Nova Xavantina - MT, Brasil'],approx:true},
    'SETOR NOVA XAVANTINA':{queries:['Setor Xavantina, Nova Xavantina - MT, Brasil'],approx:true},
    'PRIMITIVO':{queries:['Primitivo, Nova Xavantina - MT, Brasil']},
    'PARQUE AQUARIO':{queries:['Parque Aquário, Nova Xavantina - MT, Brasil','Conagro, Nova Xavantina - MT, Brasil'],approx:true}
  };

  // Bairros/loteamentos confirmados em fontes municipais recentes que ainda
  // podem aparecer em novos cadastros. Já ficam reconhecidos pelo roteirizador.
  Object.assign(NEIGHBORHOOD_RULES,{
    'NOSSA SENHORA APARECIDA':{queries:['Loteamento Nossa Senhora Aparecida, Nova Xavantina - MT, Brasil']},
    'COLINA VERDE':{queries:['Loteamento Colina Verde, Nova Xavantina - MT, Brasil']},
    'AGUAS DA MATA':{queries:['Loteamento Águas da Mata, Nova Xavantina - MT, Brasil']},
    'ÁGUAS DA MATA':{queries:['Loteamento Águas da Mata, Nova Xavantina - MT, Brasil']},
    'LISNNER':{queries:['Lisnner, Nova Xavantina - MT, Brasil']},
    'HENRY III':{queries:['Henry III, Setor Nova Brasília, Nova Xavantina - MT, Brasil','Mario Duílio Henry III, Nova Xavantina - MT, Brasil']},
    'DUÍLIO HENRY':{queries:['Mario Duílio Henry, Setor Nova Brasília, Nova Xavantina - MT, Brasil']},
    'DUILIO HENRY':{queries:['Mario Duílio Henry, Setor Nova Brasília, Nova Xavantina - MT, Brasil']},
    'XAVANTINA VELHA':{side:'XAVANTINA',queries:['Xavantina Velha, Nova Xavantina - MT, Brasil']},
    'CENTRAL':{side:'XAVANTINA',queries:['Bairro Central, Setor Xavantina, Nova Xavantina - MT, Brasil']},
    'TONETTO I':{queries:['Tonetto I, Nova Xavantina - MT, Brasil','Tonetto, Nova Xavantina - MT, Brasil']},
    'TONETTO II':{queries:['Tonetto II, Nova Xavantina - MT, Brasil','Tonetto, Nova Xavantina - MT, Brasil']}
  });

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
  function normalizeName(v){
    return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  }
  function neighborhoodRule(nb){
    return NEIGHBORHOOD_RULES[normalizeName(nb?.name)]||null;
  }
  function uniqueStrings(values){
    return [...new Set((values||[]).map(v=>String(v||'').trim()).filter(Boolean))];
  }
  function deliveryAddressCandidates(s,d){
    const nb=neighborhood(s,d.neighborhoodId),rule=neighborhoodRule(nb);
    const city='Nova Xavantina - MT';
    const street=String(d.address||'').trim();
    const number=String(d.addressNumber||'').trim();
    const mapQuery=String(nb?.mapQuery||'').trim();

    // Endereço exato sempre ganha de qualquer bairro.
    if(street && number){
      const neighborhoodNames=uniqueStrings([
        nb?.name,
        ...(rule?.queries||[]).map(x=>x.split(',')[0])
      ]);
      return uniqueStrings([
        ...neighborhoodNames.map(n=>`${street}, ${number}, ${n}, ${city}, Brasil`),
        `${street}, ${number}, ${city}, Brasil`
      ]);
    }

    // Bairro/área é apenas fallback para registros antigos sem rua + número.
    if(rule?.requiresPrecise)return [];
    return uniqueStrings([
      mapQuery ? `${mapQuery}, ${city}, Brasil` : '',
      ...(rule?.queries||[]),
      nb?.name ? `${nb.name}, ${city}, Brasil` : ''
    ]);
  }
  function deliveryAddress(s,d){
    return deliveryAddressCandidates(s,d)[0]||'';
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
    await sleep(1050); // evita rajadas no serviço público, inclusive quando não há resultado.
    if(!rows?.length)return null;
    const point={lat:Number(rows[0].lat),lon:Number(rows[0].lon),displayName:rows[0].display_name||query};
    cache[key]=point;saveCache(cache);
    return point;
  }
  async function geocodeCandidates(candidates,cache){
    for(const query of uniqueStrings(candidates)){
      const p=await geocode(query,cache);
      if(p)return {...p,matchedQuery:query};
    }
    return null;
  }

  async function geocodeStops(s,deliveries,statusEl){
    const cache=loadCache(),points=[],unlocated=[];
    statusEl.textContent='Localizando o NILO Supermercado...';
    const originPoint=await geocodeCandidates(NILO_ORIGIN_CANDIDATES,cache);
    if(!originPoint)throw new Error('Não foi possível localizar o NILO pelo serviço do mapa. Use “Abrir no Google Maps”; o ponto de saída está fixado no NILO.');

    for(let i=0;i<deliveries.length;i++){
      const d=deliveries[i],candidates=deliveryAddressCandidates(s,d);
      if(!candidates.length){unlocated.push(d);continue;}
      statusEl.textContent=`Localizando parada ${i+1} de ${deliveries.length}...`;
      try{
        const p=await geocodeCandidates(candidates,cache);
        if(p)points.push({delivery:d,...p,query:p.matchedQuery||candidates[0]});
        else unlocated.push(d);
      }catch(err){
        console.warn('[NILO V22] endereço não localizado',candidates,err);
        unlocated.push(d);
      }
    }
    return {originPoint,points,unlocated};
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

  function googleMapsUrl(ordered){
    const waypoints=ordered.map(p=>p.query||deliveryAddressCandidates(lastStateForMaps,p.delivery||p)[0]).filter(Boolean).slice(0,MAX_STOPS);
    const parts=[
      'https://www.google.com/maps/dir/?api=1',
      `origin=${encodeURIComponent(NILO_ORIGIN_ADDRESS)}`,
      `origin_place_id=${encodeURIComponent(NILO_GOOGLE_PLACE_ID)}`,
      `destination=${encodeURIComponent(NILO_ORIGIN_ADDRESS)}`,
      `destination_place_id=${encodeURIComponent(NILO_GOOGLE_PLACE_ID)}`,
      'travelmode=driving'
    ];
    if(waypoints.length)parts.push(`waypoints=${encodeURIComponent(waypoints.join('|'))}`);
    return parts.join('&');
  }

  let lastStateForMaps={};

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
    const origin=NILO_ORIGIN_ADDRESS;
    const options=cycles.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?.id?'selected':''}>${esc(`${dateBR(c.date)} • ${c.code||'Ciclo'} • ${cycleDeliveries(s,c).length} entrega(s)`)}</option>`).join('');
    const fallback=routeSortFallback(s,rows).slice(0,MAX_STOPS);

    return `<div class="v17-planner">
      <div class="v17-planner-head">
        <div>
          <span class="v17-planner-kicker">ROTEIRIZAÇÃO AUTOMÁTICA</span>
          <h3>Rota mais eficiente planejada</h3>
          <p>Saída e retorno sempre no NILO Supermercado. O sistema usa endereço exato quando disponível e, nos registros antigos, usa o bairro/área validado como referência.</p>
        </div>
        <div class="v17-route-selector">
          ${cycles.length?`<label>Ciclo / saída<select id="v17CycleSelect">${options}</select></label>`:`<label>Base da rota<select disabled><option>Último movimento do período</option></select></label>`}
        </div>
      </div>
      <div id="v17RouteStatus" class="v17-route-status">Preparando ${fallback.length} parada(s) • saída fixa: ${esc(NILO_ORIGIN_LABEL)} • ${esc(origin)}</div>
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
      <div class="v17-route-note"><strong>Como funciona:</strong> saída e retorno são fixos no NILO Supermercado. Centro I é tratado no Setor Xavantina e Centro II no Setor Nova Brasília, em lados distintos do Rio das Mortes. Rua + número têm prioridade; bairro é fallback para registros antigos. A sequência final pode ser aberta no Google Maps.</div>
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
    lastStateForMaps=s;
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
      const origin=NILO_ORIGIN_ADDRESS;

      openMaps?.addEventListener('click',()=>{
        const ordered=calculated?.ordered||orderedFallback.map(d=>({delivery:d,query:deliveryAddress(s,d)}));
        window.open(googleMapsUrl(ordered),'_blank','noopener,noreferrer');
      });

      async function calculateNow(){
        if(!orderedFallback.length)return;
        const status=q('#v17RouteStatus');
        calculate.disabled=true;
        status.classList.add('loading');
        try{
          const withAddress=orderedFallback.filter(d=>deliveryAddress(s,d));
          if(!withAddress.length)throw new Error('As entregas desta saída não têm endereço suficiente.');

          const located=await geocodeStops(s,withAddress,status);
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
          status.textContent=`Rota calculada a partir do NILO • ${ordered.length} parada(s) • ${fmtKm(trip.trip.distance)} • ${fmtDuration(trip.trip.duration)}${located.unlocated.length?` • ${located.unlocated.length} sem localização suficiente`:''}`;
          openMaps.disabled=false;
        }catch(err){
          console.warn('[NILO V22] roteirização',err);
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
      console.warn('[NILO V22] falha ao montar roteirizador',err);
    }finally{
      enhancing=false;
    }
  }

  let mountTimer=null;
  function scheduleMount(delay=120){
    clearTimeout(mountTimer);
    mountTimer=setTimeout(()=>mount(),delay);
  }
  function startStableObserver(){
    const view=q('#view');
    if(!view){setTimeout(startStableObserver,250);return;}
    const observer=new MutationObserver(()=>scheduleMount(140));
    observer.observe(view,{childList:true,subtree:false});
    const title=q('#pageTitle');
    if(title){const titleObserver=new MutationObserver(()=>scheduleMount(140));titleObserver.observe(title,{childList:true,characterData:true,subtree:true});}
    scheduleMount(600);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startStableObserver,{once:true});
  else startStableObserver();
})();
