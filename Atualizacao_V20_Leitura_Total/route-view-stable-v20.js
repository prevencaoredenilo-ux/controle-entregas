/* ================================================================
   NILO ENTREGAS • V19 ESTÁVEL
   ROTAS DOS ENTREGADORES — composição aprovada
   Adiciona análises sem alterar app.js.
   ================================================================ */
(() => {
  'use strict';

  const DB_NAME='controle_entregas_nx';
  const DB_VERSION=1;
  const STORE_NAME='app_state';
  const STATE_KEY='main';
  let db=null;
  let enhancing=false;

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const num=(v,d=0)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(Number(v||0));
  const pct=(v,d=0)=>`${num(v,d)}%`;

  function openDB(){
    if(db)return Promise.resolve(db);
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE_NAME))req.result.createObjectStore(STORE_NAME)};
      req.onsuccess=()=>{db=req.result;resolve(db)};
      req.onerror=()=>reject(req.error);
    });
  }
  async function state(){
    await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readonly');
      const req=tx.objectStore(STORE_NAME).get(STATE_KEY);
      req.onsuccess=()=>resolve(req.result||{});
      req.onerror=()=>reject(req.error);
    });
  }

  function todayISO(){
    const d=new Date(),z=new Date(d.getTime()-d.getTimezoneOffset()*60000);
    return z.toISOString().slice(0,10);
  }
  function isoDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):''}
  function dateObj(v){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null}
  function dateBR(v){const d=dateObj(v);return d?new Intl.DateTimeFormat('pt-BR').format(d):'—'}
  function dayName(v){const d=dateObj(v);return d?new Intl.DateTimeFormat('pt-BR',{weekday:'long'}).format(d):'—'}
  function shortDay(v){const d=dateObj(v);return d?new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(d).replace('.',''):'—'}
  function addDays(v,n){const d=dateObj(v);if(!d)return v;d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function startWeek(v){const d=dateObj(v);if(!d)return v;const wd=(d.getDay()+6)%7;d.setDate(d.getDate()-wd);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
  function endWeek(v){return addDays(startWeek(v),6)}
  function inRange(v,r){return !!v&&v>=r.start&&v<=r.end}
  function scoped(list,s){const mode=s?.settings?.appMode==='training'?'training':'production';return (list||[]).filter(x=>(x?.mode||'production')===mode)}

  function selectedRange(){
    const start=isoDate(q('#filterStart')?.value),end=isoDate(q('#filterEnd')?.value);
    if(start&&end)return {start:start<=end?start:end,end:start<=end?end:start,label:`${dateBR(start<=end?start:end)} a ${dateBR(start<=end?end:start)}`};

    const year=q('#filterYear')?.value||todayISO().slice(0,4);
    const month=q('#filterMonth')?.value||'';
    if(month){
      const first=`${year}-${month}-01`,last=new Date(Number(year),Number(month),0).getDate();
      return {start:first,end:`${year}-${month}-${String(last).padStart(2,'0')}`,label:new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(dateObj(first))};
    }
    return {start:`${year}-01-01`,end:`${year}-12-31`,label:year};
  }

  function roots(list){return list.filter(d=>!d.parentId||d.rootId===d.id||!d.rootId)}
  function rootKey(d){return d.rootId||d.id}
  function chainFor(root,all){const k=rootKey(root);return all.filter(d=>(d.rootId||d.id)===k||d.id===k).sort((a,b)=>(a.attemptNo||1)-(b.attemptNo||1))}
  function isFinal(d){return d?.status==='Finalizada'||Boolean(d?.finalizationTime)}
  function isReturned(d){return d?.returnedUndelivered||d?.status==='Devolvida'}
  function rootFinal(root,all){return chainFor(root,all).some(isFinal)}
  function rootReturned(root,all){return chainFor(root,all).some(isReturned)}
  function finalRecord(root,all){return [...chainFor(root,all)].reverse().find(isFinal)||null}

  function minutesBetween(start,end){
    if(!start||!end)return null;
    const [sh,sm]=String(start).split(':').map(Number),[eh,em]=String(end).split(':').map(Number);
    if([sh,sm,eh,em].some(Number.isNaN))return null;
    let m=(eh*60+em)-(sh*60+sm);if(m<0)m+=1440;return m;
  }
  function fmtMinutes(m){
    if(m===null||m===undefined||!Number.isFinite(Number(m)))return '—';
    m=Math.round(Number(m));const h=Math.floor(m/60),min=m%60;
    return h?`${h}h ${String(min).padStart(2,'0')}m`:`${min} min`;
  }
  function avg(a){const x=a.filter(v=>v!==null&&Number.isFinite(Number(v))).map(Number);return x.length?x.reduce((s,v)=>s+v,0)/x.length:0}
  function sum(a){return a.reduce((s,v)=>s+Number(v||0),0)}
  function unique(a){return [...new Set(a.filter(Boolean))]}

  function latestOperationalDay(filteredRoots,range){
    const dates=unique(filteredRoots.map(r=>r.date).filter(d=>inRange(d,range))).sort();
    return dates.at(-1)||range.end;
  }

  function deliveryLabel(root){
    return root.customerName||`Compra ${root.orderNo||root.coupon||'—'}`;
  }
  function statusOf(root,all){
    const chain=chainFor(root,all),last=chain.at(-1)||root;
    if(chain.some(isFinal))return {label:'Entregue',tone:'success'};
    if(chain.some(isReturned))return {label:'Retornada',tone:'warning'};
    if(last.status==='Em rota')return {label:'Em rota',tone:'info'};
    if(last.status==='Programada'||last.status==='Reagendada')return {label:last.status,tone:'purple'};
    return {label:last.status||'Na loja',tone:'neutral'};
  }
  function deliveryTime(root,all){
    const rec=finalRecord(root,all)||chainFor(root,all).at(-1)||root;
    return rec.finalizationTime||rec.departureTime||root.purchaseTime||'—';
  }

  function kpi(icon,value,label,sub,tone='green'){
    return `<article class="v16-route-kpi ${tone}"><span class="v16-route-kpi-icon">${icon}</span><div><strong>${value}</strong><b>${esc(label)}</b><small>${esc(sub)}</small></div></article>`;
  }

  function dailyRows(filteredRoots,all,range){
    const map=new Map();
    filteredRoots.forEach(root=>{
      const d=root.date;if(!inRange(d,range))return;
      if(!map.has(d))map.set(d,{date:d,delivered:0,returned:0,attempts:0});
      const row=map.get(d),chain=chainFor(root,all);
      if(rootFinal(root,all))row.delivered++;
      if(rootReturned(root,all))row.returned++;
      row.attempts+=chain.length;
    });
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }

  function lineChart(rows){
    if(!rows.length)return `<div class="v16-chart-empty"><strong>Sem dados no período</strong><small>Os dados aparecem conforme as entregas forem registradas.</small></div>`;
    const data=rows.length>10?rows.slice(-10):rows;
    const W=680,H=210,L=36,R=18,T=16,B=32;
    const max=Math.max(1,...data.flatMap(r=>[r.delivered,r.returned,r.attempts]));
    const x=i=>L+(data.length===1?(W-L-R)/2:i*(W-L-R)/(data.length-1));
    const y=v=>T+(H-T-B)*(1-v/max);
    const poly=k=>data.map((r,i)=>`${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join(' ');
    const guides=[0,.25,.5,.75,1].map(f=>{const yy=T+(H-T-B)*f;const val=Math.round(max*(1-f));return `<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" class="v16-gridline"/><text x="${L-8}" y="${yy+4}" text-anchor="end" class="v16-axis">${val}</text>`}).join('');
    const labels=data.map((r,i)=>`<text x="${x(i)}" y="${H-10}" text-anchor="middle" class="v16-axis">${esc(shortDay(r.date))}</text>`).join('');
    return `<div class="v16-chart-wrap"><div class="v16-chart-legend"><span class="green">Entregues</span><span class="orange">Retornadas</span><span class="purple">Tentativas</span></div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Desempenho diário">${guides}<polyline points="${poly('delivered')}" class="v16-line green"/><polyline points="${poly('returned')}" class="v16-line orange"/><polyline points="${poly('attempts')}" class="v16-line purple"/>${labels}</svg></div>`;
  }

  function bottomInsights(filteredRoots,all,range){
    const deliveredRoots=filteredRoots.filter(r=>rootFinal(r,all));
    const byDay={};
    deliveredRoots.forEach(r=>{byDay[r.date]=(byDay[r.date]||0)+1});
    const topDate=Object.entries(byDay).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0];

    const weekday={};
    // Média por dia observado no período, não apenas dias com entrega.
    for(let d=range.start;d<=range.end;d=addDays(d,1)){
      const idx=dateObj(d)?.getDay(); if(idx===undefined)break;
      if(!weekday[idx])weekday[idx]={sum:0,days:0};weekday[idx].days++;
      if(d===range.end)break;
    }
    Object.entries(byDay).forEach(([d,v])=>{const idx=dateObj(d)?.getDay();if(weekday[idx])weekday[idx].sum+=v});
    const wdNames=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    const bestWd=Object.entries(weekday).map(([k,v])=>({idx:+k,avg:v.days?v.sum/v.days:0,sum:v.sum})).sort((a,b)=>b.avg-a.avg)[0];

    const weeks={};
    deliveredRoots.forEach(r=>{const w=startWeek(r.date);weeks[w]=(weeks[w]||0)+1});
    const topWeek=Object.entries(weeks).sort((a,b)=>b[1]-a[1])[0];

    const slots={
      '06:00–09:00':0,'09:00–12:00':0,'12:00–15:00':0,'15:00–18:00':0,'18:00–21:00':0,'21:00–00:00':0
    };
    deliveredRoots.forEach(root=>{const rec=finalRecord(root,all);const t=rec?.finalizationTime||'';const h=Number(t.slice(0,2));if(!Number.isFinite(h))return;
      if(h>=6&&h<9)slots['06:00–09:00']++;else if(h<12)slots['09:00–12:00']++;else if(h<15)slots['12:00–15:00']++;else if(h<18)slots['15:00–18:00']++;else if(h<21)slots['18:00–21:00']++;else slots['21:00–00:00']++;
    });
    const bestSlot=Object.entries(slots).sort((a,b)=>b[1]-a[1])[0];

    return [
      {icon:'🏆',label:'Melhor dia da semana',value:bestWd&&bestWd.sum?wdNames[bestWd.idx]:'—',sub:bestWd&&bestWd.sum?`Média de ${num(bestWd.avg,1)} entregas`:'Sem base no período',tone:'green'},
      {icon:'▦',label:'Semana com mais entregas',value:topWeek?`${topWeek[1]} entregas`:'—',sub:topWeek?`${dateBR(topWeek[0])} a ${dateBR(endWeek(topWeek[0]))}`:'Sem base no período',tone:'purple'},
      {icon:'▣',label:'Dia com mais entregas',value:topDate?dateBR(topDate[0]):'—',sub:topDate?`Total de ${topDate[1]} entregas`:'Sem base no período',tone:'orange'},
      {icon:'◷',label:'Faixa horária com mais entregas',value:bestSlot&&bestSlot[1]?bestSlot[0]:'—',sub:bestSlot&&bestSlot[1]?`${bestSlot[1]} entregas no período`:'Sem horário final informado',tone:'blue'}
    ];
  }

  function insightCard(x){return `<article class="v16-insight-card ${x.tone}"><span>${x.icon}</span><div><small>${esc(x.label)}</small><strong>${esc(x.value)}</strong><p>${esc(x.sub)}</p></div></article>`}

  async function enhance(){
    if(enhancing)return;
    const view=q('#view'),title=q('#pageTitle')?.textContent||'';
    if(!view||!(/Histórico de rotas|Rotas dos entregadores/i.test(title)))return;
    if(q('.v16-route-analytics',view))return;
    const layout=q('.route-history-layout',view),metrics=q('.route-history-metrics',view),mapPanel=q('.route-map-panel',view);
    if(!layout||!metrics||!mapPanel)return;

    enhancing=true;
    try{
      const s=await state(),range=selectedRange();
      const all=scoped(s.deliveries,s),allRoots=roots(all),filteredRoots=allRoots.filter(r=>inRange(r.date,range));
      const cycles=scoped(s.cycles,s).filter(c=>inRange(c.date,range));
      const tracks=scoped(s.routeTracks||[],s).filter(t=>inRange(t.date,range));
      const distance=sum(tracks.map(t=>Number(t.distanceKm||0)));
      const cycleMinutes=cycles.map(c=>minutesBetween(c.departureTime,c.returnTime)).filter(v=>v!==null);
      const completed=filteredRoots.filter(r=>rootFinal(r,all)).length;
      const returned=filteredRoots.filter(r=>rootReturned(r,all)).length;
      const drivers=unique(cycles.map(c=>c.driverId).concat(filteredRoots.map(r=>r.driverId)));

      metrics.className='v16-route-metrics';
      metrics.innerHTML=
        kpi('↗',`${num(distance,1)} km`,'Distância total',tracks.length?`${tracks.length} trajetos registrados`:'Sem GPS no período','green')+
        kpi('◷',fmtMinutes(avg(cycleMinutes)),'Tempo em rota',cycles.length?`Média de ${cycles.length} ciclo(s)`:'Sem ciclo fechado','blue')+
        kpi('✓',String(completed),'Entregas concluídas',filteredRoots.length?pct(completed/filteredRoots.length*100,0)+' de sucesso':'Sem compras no período','purple')+
        kpi('↩',String(returned),'Entregas retornadas',returned?'Motivos registrados na operação':'Nenhum retorno no período','orange')+
        kpi('♙',String(drivers.length),'Entregadores ativos','Com movimento no período','teal');

      // Reaproveita o mapa real já gerado pelo app, preservando o funcionamento existente.
      const mapTitle=q('.section-head h2',mapPanel);if(mapTitle)mapTitle.textContent='Mapa das rotas';
      const mapDesc=q('.section-head p',mapPanel);if(mapDesc)mapDesc.textContent='Trajetos registrados no período e pontos de entrega disponíveis.';

      const day=latestOperationalDay(filteredRoots,range),dayRoots=filteredRoots.filter(r=>r.date===day);
      const deliveryPanel=document.createElement('aside');
      deliveryPanel.className='v16-deliveries-panel';
      deliveryPanel.innerHTML=`<div class="v16-panel-head"><div><span>ENTREGAS DO DIA</span><strong>${dateBR(day)}</strong></div><b>${dayRoots.length}</b></div><div class="v16-day-list">${dayRoots.length?dayRoots.slice(0,10).map(root=>{const st=statusOf(root,all);return `<div class="v16-day-row"><time>${esc(deliveryTime(root,all))}</time><div><strong>${esc(deliveryLabel(root))}</strong><small>${esc(root.neighborhoodId?'Entrega registrada':'Compra registrada')}</small></div><span class="${st.tone}">${esc(st.label)}</span></div>`}).join(''):`<div class="v16-empty-mini"><strong>Nenhuma entrega neste dia</strong><small>Altere o período para consultar outro movimento.</small></div>`}</div>${dayRoots.length>10?`<div class="v16-more-day">+ ${dayRoots.length-10} outras entregas</div>`:''}`;

      layout.className='v16-route-main';
      layout.innerHTML='';layout.append(mapPanel,deliveryPanel);

      const daily=dailyRows(filteredRoots,all,range);
      const totalAttempts=sum(filteredRoots.map(r=>chainFor(r,all).length));
      const success=filteredRoots.length?completed/filteredRoots.length*100:0;
      const returnRate=filteredRoots.length?returned/filteredRoots.length*100:0;
      const purchaseToClient=filteredRoots.map(root=>{const rec=finalRecord(root,all);return rec?minutesBetween(root.purchaseTime,rec.finalizationTime):null});

      const analytics=document.createElement('section');
      analytics.className='v16-route-analytics';
      analytics.innerHTML=`
        <article class="v16-analytics-card">
          <div class="v16-card-title"><span>DESEMPENHO DIÁRIO</span><strong>Entregas, retornos e tentativas</strong></div>
          ${lineChart(daily)}
        </article>
        <article class="v16-analytics-card">
          <div class="v16-card-title"><span>RESUMO DO PERÍODO</span><strong>${esc(range.label)}</strong></div>
          <div class="v16-summary-grid">
            <div class="success"><small>Taxa de sucesso</small><strong>${pct(success,0)}</strong><span>${completed} concluídas</span></div>
            <div class="warning"><small>Taxa de retorno</small><strong>${pct(returnRate,1)}</strong><span>${returned} retornadas</span></div>
            <div class="purple"><small>Total de tentativas</small><strong>${totalAttempts}</strong><span>${filteredRoots.length} compras</span></div>
            <div class="blue"><small>Tempo médio compra → cliente</small><strong>${fmtMinutes(avg(purchaseToClient))}</strong><span>Somente horários calculáveis</span></div>
          </div>
        </article>`;
      layout.after(analytics);

      const insights=document.createElement('section');insights.className='v16-bottom-insights';
      insights.innerHTML=bottomInsights(filteredRoots,all,range).map(insightCard).join('');
      analytics.after(insights);

      const hero=q('.route-history-hero h2',view);if(hero)hero.textContent='Rotas dos entregadores';
      const heroP=q('.route-history-hero p',view);if(heroP)heroP.textContent='Acompanhe o histórico das rotas e o desempenho das entregas por dia, semana, mês ou período específico.';
    }catch(err){console.warn('[NILO V16] não foi possível montar análise de rotas',err)}
    finally{enhancing=false}
  }

  let timer=null;
  function scheduleEnhance(delay=80){
    clearTimeout(timer);
    timer=setTimeout(()=>enhance(),delay);
  }
  function startStableObserver(){
    const view=q('#view');
    if(!view){setTimeout(startStableObserver,250);return;}
    const observer=new MutationObserver(()=>scheduleEnhance(90));
    observer.observe(view,{childList:true,subtree:false});
    const title=q('#pageTitle');
    if(title){const titleObserver=new MutationObserver(()=>scheduleEnhance(90));titleObserver.observe(title,{childList:true,characterData:true,subtree:true});}
    scheduleEnhance(250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startStableObserver,{once:true});
  else startStableObserver();
})();
