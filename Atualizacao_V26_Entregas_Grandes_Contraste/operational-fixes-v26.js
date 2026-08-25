/* ================================================================
   NILO ENTREGAS • V26
   - Entregas grandes com nº planejado de viagens
   - Registro de cada viagem: ciclo, saída, entrega parcial/final,
     retorno e duração
   - Retorno sem entrega libera nova tentativa sem apagar histórico
   - Gráfico de um único dia com marcadores visíveis
   - Auditoria automática de contraste para impedir texto "sumido"
   ================================================================ */
(() => {
  'use strict';

  const DB_NAME='controle_entregas_nx';
  const DB_VERSION=1;
  const STORE_NAME='app_state';
  const STATE_KEY='main';
  const NOTICE_KEY='nilo_v26_notice';
  let db=null;
  let processingReturn=false;
  let largeModalToken='';
  let contrastTimer=0;

  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

  function uid(prefix='id'){
    if(crypto.randomUUID)return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }
  function nowISO(){return new Date().toISOString()}
  function currentTimeHM(){const d=new Date();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
  function dateBR(v){if(!v)return '—';const [y,m,d]=String(v).slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:String(v)}
  function durationMinutes(start,end){
    if(!start||!end)return null;
    const a=String(start).split(':').map(Number),b=String(end).split(':').map(Number);
    if(a.length<2||b.length<2||[...a,...b].some(Number.isNaN))return null;
    let n=(b[0]*60+b[1])-(a[0]*60+a[1]);if(n<0)n+=1440;return n;
  }
  function fmtMin(v){
    if(v===null||v===undefined||!Number.isFinite(Number(v)))return '—';
    const n=Math.round(Number(v)),h=Math.floor(n/60),m=n%60;
    return h?`${h}h ${String(m).padStart(2,'0')}m`:`${m} min`;
  }

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
      const tx=db.transaction(STORE_NAME,'readonly'),req=tx.objectStore(STORE_NAME).get(STATE_KEY);
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    });
  }
  async function writeState(s){
    await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readwrite');tx.objectStore(STORE_NAME).put(s,STATE_KEY);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
  }

  function rootKey(d){return d?.rootId||d?.id||''}
  function chainFor(d,s){
    const key=rootKey(d);
    return (s?.deliveries||[]).filter(x=>rootKey(x)===key||x.id===key)
      .sort((a,b)=>Number(a.tripNo||1)-Number(b.tripNo||1)||Number(a.attemptNo||1)-Number(b.attemptNo||1)||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  }
  function rootFor(d,s){return (s?.deliveries||[]).find(x=>x.id===rootKey(d))||d}
  function cycleFor(id,s){return (s?.cycles||[]).find(c=>c.id===id)||null}
  function nextTripNo(d,s){
    const nums=chainFor(d,s).map(x=>Number(x.tripNo||0)).filter(Number.isFinite);
    return Math.max(0,...nums)+1;
  }
  function currentTripNo(d,s){
    if(Number(d?.tripNo)>0)return Number(d.tripNo);
    const chain=chainFor(d,s);const idx=chain.findIndex(x=>x.id===d.id);
    return idx>=0?idx+1:1;
  }
  function tripDuration(d){
    if(Number.isFinite(Number(d?.tripDurationMin)))return Number(d.tripDurationMin);
    return durationMinutes(d?.departureTime,d?.returnTime||'');
  }
  function tripResult(d){
    if(d?.tripResult)return d.tripResult;
    if(d?.finalizationTime||d?.status==='Finalizada')return 'Entrega concluída';
    if(d?.status==='Parcial'||d?.partialLoad===true)return 'Carga parcial';
    if(d?.returnedUndelivered||d?.status==='Devolvida')return 'Voltou sem concluir';
    if(d?.departureTime)return 'Em andamento';
    return 'Aguardando saída';
  }

  function buildContinuation(source,s,{partial=false,plannedTrips=0}={}){
    const at=nowISO(),tripNo=partial?currentTripNo(source,s)+1:1;
    const attemptNo=partial?Number(source.attemptNo||1):Number(source.attemptNo||1)+1;
    return {
      ...source,
      id:uid('del'),rootId:source.rootId||source.id,parentId:source.id,
      attemptNo,tripNo,
      purchaseTime:'',driverId:'',vehicleId:'',cycleId:'',departureTime:'',finalizationTime:'',returnTime:'',
      status:'Na loja',scheduledDate:'',scheduledTime:'',scheduleNotes:'',scheduleKind:'',reasonId:'',reasonText:'',
      nextAction:partial?'Realizar próxima viagem da mesma entrega':'Realizar nova tentativa de entrega',
      returnedUndelivered:false,returnReasonId:'',returnReasonText:'',withdrawalDate:'',withdrawalTime:'',
      largeDelivery:partial||Boolean(source.largeDelivery),
      multiTrip:partial||Boolean(source.multiTrip),
      partialLoad:false,
      plannedTrips:partial?Math.max(Number(plannedTrips||0),tripNo):Number(source.plannedTrips||0),
      tripDeliveryTime:'',tripReturnTime:'',tripDurationMin:null,tripResult:'',tripNotes:'',
      createdAt:at,updatedAt:at,
      notes:partial
        ? `Continuação da entrega grande. Viagem ${tripNo}${plannedTrips?` de ${plannedTrips}`:''}.${source.notes?`\n${source.notes}`:''}`
        : `Nova tentativa criada após retorno sem conclusão.${source.notes?`\n${source.notes}`:''}`,
      history:[{id:uid('evt'),type:partial?'large_delivery_next_trip_created':'retry_after_return_created',fromId:source.id,fromAttempt:Number(source.attemptNo||1),fromTrip:Number(source.tripNo||1),at}]
    };
  }

  function queueNotice(title,text){try{sessionStorage.setItem(NOTICE_KEY,JSON.stringify({title,text,at:Date.now()}))}catch{}}
  function showNotice(){
    let x=null;try{const raw=sessionStorage.getItem(NOTICE_KEY);if(!raw)return;x=JSON.parse(raw);sessionStorage.removeItem(NOTICE_KEY)}catch{return}
    if(!x)return;
    const el=document.createElement('div');el.className='v26-notice';el.innerHTML=`<strong>${esc(x.title)}</strong><span>${esc(x.text)}</span>`;document.body.appendChild(el);
    setTimeout(()=>el.classList.add('show'),50);setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),300)},5600);
  }

  /* ------------------- ENTREGAS GRANDES: CADASTRO ------------------- */
  function modalDeliveryId(form){
    return form?.querySelector('[name="id"]')?.value||form?.dataset?.deliveryId||'';
  }

  function tripHistoryHTML(d,s){
    const chain=chainFor(d,s).filter(x=>x.departureTime||x.largeDelivery||x.multiTrip||x.partialLoad||x.id===d.id);
    const started=chain.filter(x=>x.departureTime);
    const total=started.reduce((n,x)=>n+Number(tripDuration(x)||0),0);
    const complete=chain.filter(x=>x.finalizationTime||x.status==='Finalizada').length;
    const planned=Math.max(Number(rootFor(d,s)?.plannedTrips||d.plannedTrips||0),...chain.map(x=>Number(x.plannedTrips||0)),0);
    const rows=chain.map((x,i)=>{
      const cyc=cycleFor(x.cycleId,s),dur=tripDuration(x),no=Number(x.tripNo||i+1);
      return `<tr><td><strong>Viagem ${no}</strong>${planned?` / ${planned}`:''}</td><td>${esc(dateBR(x.date))}</td><td>${esc(cyc?.code||'—')}</td><td>${esc(x.departureTime||'—')}</td><td>${esc(x.tripDeliveryTime||x.finalizationTime||'—')}</td><td>${esc(x.returnTime||x.tripReturnTime||'—')}</td><td>${esc(fmtMin(dur))}</td><td class="v26-trip-result">${esc(tripResult(x))}</td></tr>`;
    }).join('');
    return `<div class="v26-trip-summary"><div><small>Viagens realizadas</small><strong>${started.length}${planned?` / ${planned}`:''}</strong></div><div><small>Tempo total nas viagens</small><strong>${fmtMin(total)}</strong></div><div><small>Média por viagem</small><strong>${started.length?fmtMin(total/started.length):'—'}</strong></div></div>
      <div class="v26-trip-table"><table><thead><tr><th>Viagem</th><th>Data</th><th>Ciclo</th><th>Saída</th><th>Entrega parcial/final</th><th>Retorno</th><th>Tempo</th><th>Resultado</th></tr></thead><tbody>${rows||'<tr><td colspan="8">Ainda não existe viagem registrada.</td></tr>'}</tbody></table></div>`;
  }

  async function injectLargeDeliveryManager(){
    const form=q('#deliveryForm');
    const title=q('#modalTitle')?.textContent||'';
    if(!form||!/Editar entrega/i.test(title)||form.querySelector('.v26-large-block'))return;
    const id=modalDeliveryId(form);if(!id)return;
    const token=`${id}_${Date.now()}`;largeModalToken=token;
    let s;try{s=await readState()}catch{return}if(largeModalToken!==token)return;
    const d=(s?.deliveries||[]).find(x=>x.id===id);if(!d)return;
    const root=rootFor(d,s),chain=chainFor(d,s);
    const isLarge=Boolean(root.largeDelivery||root.multiTrip||chain.some(x=>x.largeDelivery||x.multiTrip||x.partialLoad));
    const planned=Math.max(2,Number(root.plannedTrips||d.plannedTrips||2));
    const block=document.createElement('section');block.className='v26-large-block';
    block.innerHTML=`<div class="v26-large-block-head"><div><strong>Entrega grande • múltiplas viagens</strong><small>Use quando a mesma compra não cabe em uma única saída. Cada viagem fica registrada separadamente.</small></div></div>
      <label class="v26-large-toggle"><input type="checkbox" data-v26-large ${isLarge?'checked':''}/><span><strong>Esta compra pode precisar de mais de uma viagem</strong><small>Não confunde carga parcial com devolução/ocorrência.</small></span></label>
      <div class="v26-large-controls ${isLarge?'':'hidden'}" data-v26-large-controls>
        <label>Total planejado de viagens<input type="number" min="2" max="20" step="1" value="${planned}" data-v26-planned-trips /></label>
        <div class="note">Você pode alterar esse número depois. Se forem necessárias mais viagens que o previsto, o sistema aumenta o total automaticamente.</div>
      </div>
      ${tripHistoryHTML(d,s)}`;
    const actions=form.querySelector('.form-actions');if(actions)form.insertBefore(block,actions);else form.appendChild(block);
    const toggle=block.querySelector('[data-v26-large]'),controls=block.querySelector('[data-v26-large-controls]');
    toggle?.addEventListener('change',()=>controls?.classList.toggle('hidden',!toggle.checked));
    scheduleContrastAudit();
  }

  async function persistLargeConfig(id,enabled,planned){
    if(!id)return;
    for(let i=0;i<12;i++){
      await new Promise(r=>setTimeout(r,220));
      const s=await readState();const d=(s?.deliveries||[]).find(x=>x.id===id);if(!d)continue;
      const root=rootFor(d,s),key=rootKey(d),n=enabled?clamp(Number(planned||2),2,20):0;
      (s.deliveries||[]).filter(x=>rootKey(x)===key||x.id===key).forEach((x,idx)=>{
        x.largeDelivery=enabled;x.multiTrip=enabled;x.plannedTrips=n;
        if(enabled&&!Number(x.tripNo))x.tripNo=idx+1;
        x.updatedAt=nowISO();
      });
      root.largeDelivery=enabled;root.multiTrip=enabled;root.plannedTrips=n;root.updatedAt=nowISO();
      s.meta=s.meta||{};s.meta.updatedAt=nowISO();s.meta.v26OperationalFix=true;await writeState(s);
      queueNotice(enabled?'Entrega grande configurada':'Configuração atualizada',enabled?`Planejamento salvo para ${n} viagem(ns).`:'A compra voltou ao modo de entrega comum.');
      setTimeout(()=>location.reload(),350);return;
    }
  }

  async function persistNewLargeConfig(match,enabled,planned,startedAt){
    if(!enabled)return;
    for(let i=0;i<14;i++){
      await new Promise(r=>setTimeout(r,220));const s=await readState();if(!s?.deliveries)continue;
      const candidates=s.deliveries.filter(d=>{
        const created=Date.parse(d.createdAt||0)||0;if(created<startedAt-4000)return false;
        if(match.coupon&&String(d.coupon||'')===match.coupon)return true;
        if(match.orderNo&&String(d.orderNo||'')===match.orderNo)return true;
        return false;
      }).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
      const d=candidates[0];if(!d)continue;
      const n=clamp(Number(planned||2),2,20);d.largeDelivery=true;d.multiTrip=true;d.plannedTrips=n;d.tripNo=Number(d.tripNo||1);d.updatedAt=nowISO();
      s.meta=s.meta||{};s.meta.updatedAt=nowISO();s.meta.v26OperationalFix=true;await writeState(s);
      queueNotice('Entrega grande registrada',`Compra configurada para ${n} viagem(ns) planejada(s).`);setTimeout(()=>location.reload(),350);return;
    }
  }

  function injectNewLargeDeliveryFields(){
    const title=q('#modalTitle')?.textContent||'';
    const form=q('#quickDeliveryForm')||q('form[data-quick-delivery]');
    if(!form||!/Nova compra|Nova entrega|Registrar entrega/i.test(title)||form.querySelector('.v26-new-large'))return;
    const box=document.createElement('section');box.className='v26-large-block v26-new-large';box.innerHTML=`<label class="v26-large-toggle"><input type="checkbox" data-v26-new-large-toggle/><span><strong>Entrega grande / múltiplas viagens</strong><small>Marque se você já sabe que esta compra precisará de mais de uma volta.</small></span></label><div class="v26-large-controls hidden" data-v26-new-large-controls><label>Total planejado de viagens<input type="number" min="2" max="20" step="1" value="2" data-v26-new-planned /></label><div class="note">Depois você verá o tempo e o histórico de cada viagem no cadastro da entrega.</div></div>`;
    const actions=form.querySelector('.form-actions');if(actions)form.insertBefore(box,actions);else form.appendChild(box);
    const t=box.querySelector('[data-v26-new-large-toggle]'),c=box.querySelector('[data-v26-new-large-controls]');t?.addEventListener('change',()=>c?.classList.toggle('hidden',!t.checked));
  }

  /* ------------------- RETORNO / CARGA PARCIAL ------------------- */
  async function injectPartialControls(){
    const title=q('#modalTitle')?.textContent||'',panel=q('#returnedDeliveriesPanel');
    if(!panel||!/RETORNO|CICLO/i.test(title))return;
    let s;try{s=await readState()}catch{return}
    qa('.cycle-return-delivery',panel).forEach(card=>{
      if(card.querySelector('.v26-partial-choice'))return;
      const main=card.querySelector('[data-return-toggle]'),id=main?.dataset?.returnToggle||main?.value;if(!id)return;
      const d=(s?.deliveries||[]).find(x=>x.id===id);if(!d)return;
      const root=rootFor(d,s),trip=currentTripNo(d,s),planned=Math.max(2,Number(root.plannedTrips||d.plannedTrips||trip+1));
      const box=document.createElement('div');box.className='v26-partial-choice';box.innerHTML=`<label><input type="checkbox" data-v26-partial="${esc(id)}"/><span class="v26-partial-copy"><strong>Entrega grande • carga parcial</strong><small>Marque quando parte da compra foi entregue e o veículo voltou à loja para buscar o restante. Não será contado como devolução.</small></span></label><div class="v26-partial-fields hidden" data-v26-partial-fields><label>Viagem atual<input value="${trip}" readonly data-v26-trip-no /></label><label>Total previsto<input type="number" min="2" max="20" value="${planned}" data-v26-trip-total /></label><label>Horário da entrega parcial<input type="time" value="${currentTimeHM()}" data-v26-trip-delivery-time /></label><label class="wide">Observação desta viagem<input placeholder="Ex.: levou geladeira; ficou o restante para a próxima volta" data-v26-trip-note /></label></div>`;
      const fields=card.querySelector('.return-resolution-fields');if(fields)card.insertBefore(box,fields);else card.appendChild(box);
      const partial=box.querySelector('[data-v26-partial]'),pf=box.querySelector('[data-v26-partial-fields]');
      partial.addEventListener('change',()=>{
        box.classList.toggle('active',partial.checked);pf.classList.toggle('hidden',!partial.checked);
        if(partial.checked&&main&&!main.checked){main.checked=true;main.dispatchEvent(new Event('change',{bubbles:true}))}
      });
      if(root.largeDelivery||root.multiTrip){box.classList.add('active');partial.checked=true;pf.classList.remove('hidden');if(main&&!main.checked){main.checked=true;main.dispatchEvent(new Event('change',{bubbles:true}))}}
    });
    if(!panel.querySelector('.v26-partial-help')){
      const note=document.createElement('div');note.className='v26-partial-help note';note.innerHTML='<strong>Importante:</strong> “voltou sem entregar” gera nova tentativa. “Carga parcial” registra outra viagem da mesma compra e guarda o tempo de cada saída.';panel.prepend(note);
    }
  }

  async function applyReturnContinuations({startedAt,selectedIds,partials}){
    if(processingReturn)return false;processingReturn=true;
    try{
      const s=await readState();if(!s?.deliveries)return false;
      let changed=false,created=0,partialsDone=0,retries=0;
      for(const source of s.deliveries.slice()){
        const selected=selectedIds.size?selectedIds.has(source.id):true;
        const updated=Date.parse(source.updatedAt||0)||0;
        if(!selected||updated<startedAt-5000)continue;
        const info=partials.get(source.id),normalReturn=source.status==='Devolvida'&&source.returnedUndelivered===true;
        if(!info&&!normalReturn)continue;
        if(source.scheduledDate||['Reagendada','Programada'].includes(source.status))continue;
        const childExists=s.deliveries.some(d=>d.parentId===source.id);

        if(info){
          const trip=currentTripNo(source,s),planned=Math.max(trip+1,clamp(Number(info.total||trip+1),2,20));
          source.largeDelivery=true;source.multiTrip=true;source.partialLoad=true;source.plannedTrips=planned;source.tripNo=trip;
          source.tripDeliveryTime=info.deliveryTime||source.tripDeliveryTime||'';
          source.tripReturnTime=source.returnTime||'';
          source.tripDurationMin=durationMinutes(source.departureTime,source.returnTime||'');
          source.tripResult='Carga parcial entregue';source.tripNotes=info.note||'';
          source.status='Parcial';source.returnedUndelivered=false;source.reasonId='';source.reasonText='';source.returnReasonId='';source.returnReasonText='';
          source.nextAction=`Realizar viagem ${trip+1}${planned?` de ${planned}`:''} da mesma entrega`;
          source.history=Array.isArray(source.history)?source.history:[];
          if(!source.history.some(h=>h?.type==='large_delivery_partial_trip'&&h?.cycleId===source.cycleId))source.history.push({id:uid('evt'),type:'large_delivery_partial_trip',tripNo:trip,plannedTrips:planned,deliveryTime:source.tripDeliveryTime,returnTime:source.returnTime||'',durationMin:source.tripDurationMin,note:source.tripNotes,cycleId:source.cycleId||'',at:nowISO()});
          source.updatedAt=nowISO();
          const root=rootFor(source,s);root.largeDelivery=true;root.multiTrip=true;root.plannedTrips=Math.max(Number(root.plannedTrips||0),planned);root.updatedAt=nowISO();
          if(!childExists){s.deliveries.push(buildContinuation(source,s,{partial:true,plannedTrips:planned}));created++}
          partialsDone++;changed=true;
        }else{
          source.nextAction='Disponível para nova tentativa de entrega';source.history=Array.isArray(source.history)?source.history:[];
          if(!source.history.some(h=>h?.type==='v26_retry_released'))source.history.push({id:uid('evt'),type:'v26_retry_released',cycleId:source.cycleId||'',at:nowISO()});
          source.updatedAt=nowISO();
          if(!childExists){s.deliveries.push(buildContinuation(source,s,{partial:false}));created++;retries++}
          changed=true;
        }
      }
      if(!changed)return false;
      s.meta=s.meta||{};s.meta.updatedAt=nowISO();s.meta.v26OperationalFix=true;await writeState(s);
      queueNotice('Próxima saída liberada',partialsDone?`${partialsDone} carga(s) parcial(is) registrada(s). ${created} continuação(ões) pronta(s) para outro ciclo.`:`${retries||created} nova(s) tentativa(s) pronta(s), mantendo o histórico anterior.`);
      return true;
    }finally{processingReturn=false}
  }

  async function waitAndApplyReturn(payload){
    for(let i=0;i<18;i++){
      await new Promise(r=>setTimeout(r,260));
      try{if(await applyReturnContinuations(payload)){setTimeout(()=>location.reload(),420);return}}catch(err){console.warn('[NILO V26] retorno pendente',err)}
    }
  }

  /* ------------------- GRÁFICOS ------------------- */
  function enhanceCharts(){
    qa('svg[aria-label="Desempenho diário"]').forEach(svg=>{
      if(svg.dataset.v26Markers==='1')return;
      const lines=qa('polyline.v16-line',svg);if(!lines.length)return;
      const series=[['green','Entregues',8.5],['orange','Retornadas',6.2],['purple','Tentativas',4.2]];
      let maxPoints=0;lines.forEach(line=>{maxPoints=Math.max(maxPoints,String(line.getAttribute('points')||'').trim().split(/\s+/).filter(Boolean).length)});
      series.forEach(([cls,label,r])=>{
        const line=lines.find(x=>x.classList.contains(cls));if(!line)return;
        String(line.getAttribute('points')||'').trim().split(/\s+/).filter(Boolean).forEach(p=>{
          const [cx,cy]=p.split(',').map(Number);if(!Number.isFinite(cx)||!Number.isFinite(cy))return;
          const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',cx);c.setAttribute('cy',cy);c.setAttribute('r',maxPoints===1?Number(r)+1:Number(r));c.setAttribute('class',`v26-chart-point ${cls}`);
          const t=document.createElementNS('http://www.w3.org/2000/svg','title');t.textContent=label;c.appendChild(t);svg.appendChild(c);
        });
      });
      if(maxPoints===1){const wrap=svg.closest('.v16-chart-wrap');if(wrap&&!wrap.querySelector('.v26-single-day-note')){const n=document.createElement('div');n.className='v26-single-day-note';n.textContent='Período de 1 dia: os círculos representam os valores mesmo sem uma segunda data para formar a linha.';svg.insertAdjacentElement('afterend',n)}}
      svg.dataset.v26Markers='1';
    });
  }

  /* ------------------- CONTRASTE AUTOMÁTICO ------------------- */
  function rgba(value){
    const m=String(value||'').match(/rgba?\(([^)]+)\)/i);if(!m)return null;
    const p=m[1].split(',').map(x=>Number.parseFloat(x.trim()));if(p.length<3||p.slice(0,3).some(Number.isNaN))return null;
    return {r:p[0],g:p[1],b:p[2],a:p.length>3&&!Number.isNaN(p[3])?p[3]:1};
  }
  function luminance(c){
    const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};
    return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b);
  }
  function ratio(a,b){const l1=luminance(a),l2=luminance(b),hi=Math.max(l1,l2),lo=Math.min(l1,l2);return (hi+.05)/(lo+.05)}
  function effectiveBg(el){
    let cur=el;
    while(cur&&cur!==document.documentElement){
      const cs=getComputedStyle(cur),bg=rgba(cs.backgroundColor);
      if(bg&&bg.a>.92)return bg;
      if(cs.backgroundImage&&cs.backgroundImage!=='none'){
        if(cur.matches('.sidebar,.hero-strip,.cycle-hero,.mileage-hero,.route-history-hero,.trash-hero,.dark-hero,.hero-dark,.v26-dark-surface'))return {r:21,g:72,b:73,a:1};
      }
      cur=cur.parentElement;
    }
    return {r:243,g:247,b:245,a:1};
  }
  function auditContrast(){
    contrastTimer=0;
    const targets=qa('#view h1,#view h2,#view h3,#view h4,#view h5,#view h6,#view p,#view small,#view span,#view strong,#view b,#view label,#view td,#view th,#view a,#view button,#modalBody h1,#modalBody h2,#modalBody h3,#modalBody h4,#modalBody p,#modalBody small,#modalBody span,#modalBody strong,#modalBody b,#modalBody label,#modalBody td,#modalBody th,#modalBody button,.sidebar a,.sidebar span,.sidebar small,.sidebar strong,.sidebar button,input,select,textarea');
    const dark={r:13,g:44,b:50,a:1},light={r:255,g:255,b:255,a:1};
    targets.forEach(el=>{
      if(el.closest('svg')||el.classList.contains('v26-contrast-skip'))return;
      const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||Number(cs.opacity)===0)return;
      const fg=rgba(cs.color);if(!fg)return;const bg=effectiveBg(el);if(ratio(fg,bg)>=4.45)return;
      const best=ratio(dark,bg)>=ratio(light,bg)?'#0d2c32':'#ffffff';
      el.style.setProperty('color',best,'important');el.style.setProperty('-webkit-text-fill-color',best,'important');
    });
  }
  function scheduleContrastAudit(){if(contrastTimer)return;contrastTimer=setTimeout(auditContrast,90)}

  /* ------------------- EVENTOS / OBSERVER ------------------- */
  document.addEventListener('submit',event=>{
    const form=event.target,title=q('#modalTitle')?.textContent||'',startedAt=Date.now();

    if(form?.id==='deliveryForm'){
      const id=modalDeliveryId(form),toggle=form.querySelector('[data-v26-large]'),planned=form.querySelector('[data-v26-planned-trips]');
      if(id&&toggle)setTimeout(()=>persistLargeConfig(id,toggle.checked,planned?.value||2),120);
    }

    if(form?.id==='quickDeliveryForm'||form?.matches?.('form[data-quick-delivery]')){
      const toggle=form.querySelector('[data-v26-new-large-toggle]');if(toggle?.checked){
        const match={coupon:String(form.querySelector('[name="coupon"]')?.value||''),orderNo:String(form.querySelector('[name="orderNo"]')?.value||'')};
        const planned=form.querySelector('[data-v26-new-planned]')?.value||2;setTimeout(()=>persistNewLargeConfig(match,true,planned,startedAt),120);
      }
    }

    if(/RETORNO À LOJA|DEVOLUÇÃO/i.test(title)){
      const selectedIds=new Set(qa('input[name="returnedDeliveryIds"]:checked').map(x=>x.value));
      const partials=new Map();qa('[data-v26-partial]:checked').forEach(x=>{
        const box=x.closest('.v26-partial-choice');partials.set(x.dataset.v26Partial,{total:box?.querySelector('[data-v26-trip-total]')?.value||'',deliveryTime:box?.querySelector('[data-v26-trip-delivery-time]')?.value||'',note:box?.querySelector('[data-v26-trip-note]')?.value||''});
      });
      setTimeout(()=>waitAndApplyReturn({startedAt,selectedIds,partials}),80);
    }
  },true);

  const observer=new MutationObserver(()=>{
    injectLargeDeliveryManager();injectNewLargeDeliveryFields();injectPartialControls();enhanceCharts();scheduleContrastAudit();
  });

  function init(){
    showNotice();injectLargeDeliveryManager();injectNewLargeDeliveryFields();injectPartialControls();enhanceCharts();scheduleContrastAudit();
    const modal=q('#modalBody'),view=q('#view');if(modal)observer.observe(modal,{childList:true,subtree:true});if(view)observer.observe(view,{childList:true,subtree:true});
    window.addEventListener('resize',scheduleContrastAudit,{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
