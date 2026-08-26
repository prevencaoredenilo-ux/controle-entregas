/* ================================================================
   NILO ENTREGAS • V31
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
  const NOTICE_KEY='nilo_v31_notice';
  const REOPEN_CYCLE_KEY='nilo_v31_reopen_cycle';
  let replayingCycleOpen=false;
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
  function todayISO(){const d=new Date(),z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)}
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


  function tripTone(d){
    if(!d)return 'waiting';
    if(d.finalizationTime||d.status==='Finalizada')return 'done';
    if(d.status==='Parcial'||d.partialLoad===true)return 'partial';
    if(d.returnedUndelivered||d.status==='Devolvida')return 'returned';
    if(d.departureTime)return 'active';
    return 'waiting';
  }
  function tripRecordByNo(d,s,no){
    return chainFor(d,s).find((x,idx)=>Number(x.tripNo||idx+1)===Number(no))||null;
  }
  function tripProgressHTML(d,s,planned,{editable=true,projected=false}={}){
    const n=clamp(Number(planned||2),2,20), chain=chainFor(d,s);
    const existingByNo=new Map(chain.map((x,idx)=>[Number(x.tripNo||idx+1),x]));
    const cards=[];
    for(let no=1;no<=n;no++){
      const x=existingByNo.get(no)||null;
      const prev=no===1?true:Boolean(existingByNo.get(no-1)?.partialLoad||existingByNo.get(no-1)?.status==='Parcial');
      const unlocked=Boolean(x)||no===1||prev;
      const tone=x?tripTone(x):(unlocked?'waiting':'locked');
      const cyc=x?cycleFor(x.cycleId,s):null;
      const dur=x?tripDuration(x):null;
      const result=x?tripResult(x):(unlocked?'Aguardando esta viagem':'Libera após concluir a viagem anterior');
      cards.push(`<article class="v27-trip-card ${tone}" data-v27-trip-card="${no}">
        <div class="v27-trip-head"><div><span class="v27-trip-number">${no}</span><div><strong>Viagem ${no} de ${n}</strong><small>${x?`${esc(dateBR(x.date))}${cyc?` • ${esc(cyc.code)}`:''}`:'Planejada'}</small></div></div><span class="v27-trip-status ${tone}">${esc(result)}</span></div>
        ${unlocked?`<div class="v27-trip-fields">
          <label>Saída da loja<input type="time" value="${esc(x?.departureTime||'')}" data-v27-trip-departure="${esc(x?.id||'')}" ${projected&&!x?'disabled':''}/></label>
          <label>Entrega parcial/final<input type="time" value="${esc(x?.tripDeliveryTime||x?.finalizationTime||'')}" data-v27-trip-delivery="${esc(x?.id||'')}" ${projected&&!x?'disabled':''}/></label>
          <label>Retorno à loja<input type="time" value="${esc(x?.returnTime||x?.tripReturnTime||'')}" data-v27-trip-return="${esc(x?.id||'')}" ${projected&&!x?'disabled':''}/></label>
          <label>Tempo gasto<input type="text" value="${esc(fmtMin(dur))}" readonly data-v27-trip-duration/></label>
          <label class="wide">Observação da viagem<input value="${esc(x?.tripNotes||'')}" placeholder="Ex.: levou metade da carga; restante ficou para a próxima viagem" data-v27-trip-note="${esc(x?.id||'')}" ${projected&&!x?'disabled':''}/></label>
        </div>`:`<div class="v27-trip-locked">🔒 Os campos desta viagem aparecem assim que a viagem ${no-1} for concluída como carga parcial.</div>`}
      </article>`);
    }
    const started=chain.filter(x=>x.departureTime);const completed=started.filter(x=>x.partialLoad||x.status==='Parcial'||x.finalizationTime||x.status==='Finalizada').length;
    const total=started.reduce((acc,x)=>acc+Number(tripDuration(x)||0),0),avg=started.length?total/started.length:0;
    return `<div class="v27-trip-flow"><div class="v27-trip-flow-title"><div><strong>Controle das viagens</strong><small>${completed} concluída(s) de ${n} planejada(s). Os horários do ciclo entram automaticamente e podem ser corrigidos na edição.</small></div><span>${completed}/${n}</span></div><div class="v27-trip-mini-summary"><div><small>Viagens iniciadas</small><strong>${started.length}/${n}</strong></div><div><small>Tempo total</small><strong>${started.length?fmtMin(total):'—'}</strong></div><div><small>Média por viagem</small><strong>${started.length?fmtMin(avg):'—'}</strong></div></div>${cards.join('')}</div>`;
  }

  function refreshTripDurationFromCard(card){
    const a=card?.querySelector('[data-v27-trip-departure]')?.value||'',b=card?.querySelector('[data-v27-trip-return]')?.value||'';
    const out=card?.querySelector('[data-v27-trip-duration]');if(out)out.value=fmtMin(durationMinutes(a,b));
  }

  function buildContinuation(source,s,{partial=false,plannedTrips=0}={}){
    const at=nowISO(),tripNo=partial?currentTripNo(source,s)+1:1;
    const attemptNo=partial?Number(source.attemptNo||1):Number(source.attemptNo||1)+1;
    return {
      ...source,
      id:uid('del'),rootId:source.rootId||source.id,parentId:source.id,
      attemptNo,tripNo,date:todayISO(),
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
    const planned=Math.max(2,Number(root.plannedTrips||d.plannedTrips||2),...chain.map((x,idx)=>Number(x.tripNo||idx+1)));
    const block=document.createElement('section');block.className='v26-large-block v27-large-easy';
    block.innerHTML=`<div class="v27-type-kicker">TIPO DA ENTREGA</div>
      <div class="v26-large-block-head"><div><strong>Entrega grande / múltiplas viagens</strong><small>Configure aqui, logo no início da edição. Ao concluir cada viagem parcial, a próxima é liberada automaticamente.</small></div></div>
      <div class="v27-type-options">
        <label class="v27-type-option ${isLarge?'':'selected'}"><input type="radio" name="v27DeliverySize" value="normal" ${isLarge?'':'checked'}/><span><strong>Entrega normal</strong><small>Uma única viagem.</small></span></label>
        <label class="v27-type-option ${isLarge?'selected':''}"><input type="radio" name="v27DeliverySize" value="large" ${isLarge?'checked':''} data-v26-large/><span><strong>Entrega grande</strong><small>Duas ou mais viagens para a mesma compra.</small></span></label>
      </div>
      <div class="v26-large-controls ${isLarge?'':'hidden'}" data-v26-large-controls>
        <label>Quantas viagens estão previstas?<input type="number" min="2" max="20" step="1" value="${planned}" data-v26-planned-trips /></label>
        <div class="note"><strong>Como funciona:</strong> a Viagem 1 fica disponível agora. Quando ela for marcada como carga parcial no retorno do ciclo, a Viagem 2 é criada e liberada; depois a 3 e assim por diante.</div>
      </div>
      <div data-v27-trip-flow-host>${isLarge?tripProgressHTML(d,s,planned,{editable:true}):''}</div>`;
    form.prepend(block);
    const largeRadio=block.querySelector('[value="large"]'),normalRadio=block.querySelector('[value="normal"]'),controls=block.querySelector('[data-v26-large-controls]'),plannedInput=block.querySelector('[data-v26-planned-trips]'),host=block.querySelector('[data-v27-trip-flow-host]');
    const update=()=>{
      const enabled=largeRadio?.checked;controls?.classList.toggle('hidden',!enabled);
      block.querySelectorAll('.v27-type-option').forEach(x=>x.classList.toggle('selected',x.querySelector('input')?.checked));
      if(host)host.innerHTML=enabled?tripProgressHTML(d,s,plannedInput?.value||2,{editable:true}):'';
      qa('.v27-trip-card',host).forEach(card=>qa('input[type="time"]',card).forEach(inp=>inp.addEventListener('input',()=>refreshTripDurationFromCard(card))));
      scheduleContrastAudit();
    };
    largeRadio?.addEventListener('change',update);normalRadio?.addEventListener('change',update);plannedInput?.addEventListener('input',update);update();
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
      s.meta=s.meta||{};s.meta.updatedAt=nowISO();s.meta.v30OperationalFix=true;await writeState(s);
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
      s.meta=s.meta||{};s.meta.updatedAt=nowISO();s.meta.v30OperationalFix=true;await writeState(s);
      queueNotice('Entrega grande registrada',`Compra configurada para ${n} viagem(ns) planejada(s).`);setTimeout(()=>location.reload(),350);return;
    }
  }

  function findQuickDeliveryForm(){
    const direct=q('#quickDeliveryForm')||q('form[data-quick-delivery]');
    if(direct)return direct;
    return qa('#modalBody form').find(form=>
      form.querySelector('[name="orderNo"]') &&
      form.querySelector('[name="coupon"]') &&
      form.querySelector('[name="deliveryMode"]')
    )||null;
  }

  function renumberQuickSteps(form){
    const cards=qa(':scope > .quick-step-card',form);
    cards.forEach((card,idx)=>{
      const badge=card.querySelector('.quick-step-head > span');
      if(badge)badge.textContent=String(idx+1);
    });
    const subtitle=q('#modalSubtitle');
    if(subtitle && /Lançamento rápido/i.test(subtitle.textContent||'')){
      subtitle.textContent='Lançamento rápido em 4 passos. O número da compra fica em destaque para evitar erro de sequência.';
    }
  }

  function injectNewLargeDeliveryFields(){
    const form=findQuickDeliveryForm();
    if(!form||form.querySelector('.v28-quick-type-step'))return;

    const box=document.createElement('section');
    box.className='quick-step-card v26-new-large v28-quick-type-step';
    box.innerHTML=`
      <div class="quick-step-head v28-type-head">
        <span>2</span>
        <div><strong>Tipo da entrega</strong><small>Escolha normal ou grande. Se for grande, informe quantas viagens serão necessárias.</small></div>
      </div>
      <div class="v28-type-body">
        <div class="v27-type-options">
          <label class="v27-type-option selected">
            <input type="radio" name="v27NewDeliverySize" value="normal" checked />
            <span><strong>Entrega normal</strong><small>Uma única viagem.</small></span>
          </label>
          <label class="v27-type-option">
            <input type="radio" name="v27NewDeliverySize" value="large" data-v26-new-large-toggle />
            <span><strong>Entrega grande</strong><small>Duas ou mais viagens para a mesma compra.</small></span>
          </label>
        </div>
        <div class="v26-large-controls hidden" data-v26-new-large-controls>
          <label>Quantas viagens estão previstas?
            <input type="number" min="2" max="20" step="1" value="2" data-v26-new-planned />
          </label>
          <div class="v28-large-explain">
            <strong>Fluxo automático</strong>
            <small>Ao concluir a Viagem 1 como carga parcial, a Viagem 2 será liberada; depois a 3 e assim por diante. Saída, entrega parcial/final, retorno e tempo ficam registrados por viagem.</small>
          </div>
        </div>
        <div data-v27-new-trip-preview></div>
      </div>`;

    const firstCard=form.querySelector('.quick-step-card');
    if(firstCard)firstCard.insertAdjacentElement('afterend',box);
    else{
      const banner=form.querySelector('.previous-purchase-banner');
      if(banner)banner.insertAdjacentElement('afterend',box);else form.prepend(box);
    }
    renumberQuickSteps(form);

    const large=box.querySelector('[value="large"]');
    const normal=box.querySelector('[value="normal"]');
    const controls=box.querySelector('[data-v26-new-large-controls]');
    const planned=box.querySelector('[data-v26-new-planned]');
    const preview=box.querySelector('[data-v27-new-trip-preview]');

    const render=()=>{
      const on=Boolean(large?.checked);
      controls?.classList.toggle('hidden',!on);
      box.querySelectorAll('.v27-type-option').forEach(x=>x.classList.toggle('selected',Boolean(x.querySelector('input')?.checked)));
      if(preview){
        preview.innerHTML=on
          ? tripProgressHTML({id:'__new__',rootId:'__new__'}, {deliveries:[],cycles:[]}, planned?.value||2,{projected:true})
          : '';
      }
      scheduleContrastAudit();
    };
    large?.addEventListener('change',render);
    normal?.addEventListener('change',render);
    planned?.addEventListener('input',render);
    render();
  }


  async function persistTripEditsFromForm(form,deliveryId){
    const entries=qa('[data-v27-trip-departure]',form).filter(x=>x.dataset.v27TripDeparture);
    if(!entries.length)return;
    await new Promise(r=>setTimeout(r,260));
    const s=await readState();if(!s?.deliveries)return;let changed=false;
    entries.forEach(dep=>{
      const id=dep.dataset.v27TripDeparture,x=s.deliveries.find(d=>d.id===id);if(!x)return;
      const card=dep.closest('.v27-trip-card');const delivery=card?.querySelector('[data-v27-trip-delivery]')?.value||'';const ret=card?.querySelector('[data-v27-trip-return]')?.value||'';const note=card?.querySelector('[data-v27-trip-note]')?.value||'';
      if(dep.value!==String(x.departureTime||'')){x.departureTime=dep.value;changed=true}
      if(delivery!==String(x.tripDeliveryTime||x.finalizationTime||'')){x.tripDeliveryTime=delivery;changed=true}
      if(ret!==String(x.returnTime||x.tripReturnTime||'')){x.returnTime=ret;x.tripReturnTime=ret;changed=true}
      if(note!==String(x.tripNotes||'')){x.tripNotes=note;changed=true}
      const dur=durationMinutes(x.departureTime,x.returnTime||'');if(x.tripDurationMin!==dur){x.tripDurationMin=dur;changed=true}
      if(changed)x.updatedAt=nowISO();
    });
    if(changed){s.meta=s.meta||{};s.meta.updatedAt=nowISO();s.meta.v30OperationalFix=true;await writeState(s);queueNotice('Viagens atualizadas','Horários e tempos das viagens foram salvos.');}
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
        if(!selected)continue;
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
      s.meta=s.meta||{};s.meta.updatedAt=nowISO();s.meta.v30OperationalFix=true;await writeState(s);
      queueNotice('Próxima saída liberada',partialsDone?`${partialsDone} carga(s) parcial(is) registrada(s). ${created} continuação(ões) pronta(s) para outro ciclo.`:`${retries||created} nova(s) tentativa(s) pronta(s), mantendo o histórico anterior.`);
      return true;
    }finally{processingReturn=false}
  }

  async function waitAndApplyReturn(payload){
    for(let i=0;i<18;i++){
      await new Promise(r=>setTimeout(r,260));
      try{
        if(await applyReturnContinuations(payload)){
          try{sessionStorage.setItem(REOPEN_CYCLE_KEY,'1')}catch{}
          setTimeout(()=>location.reload(),700);
          return;
        }
      }catch(err){console.warn('[NILO V31] retorno pendente',err)}
    }
  }


  async function repairReturnedWithoutRetryOnDemand(){
    try{
      const s=await readState();if(!s?.deliveries)return 0;
      const today=todayISO();
      let changed=0,created=0,reactivated=0;

      // V31: trabalha por compra raiz, independentemente do dia em que voltou.
      // A tentativa devolvida permanece no histórico; apenas a continuação é liberada.
      const groups=new Map();
      for(const d of s.deliveries){
        const key=rootKey(d);if(!key)continue;
        if(!groups.has(key))groups.set(key,[]);groups.get(key).push(d);
      }

      for(const chain of groups.values()){
        chain.sort((a,b)=>Number(a.attemptNo||1)-Number(b.attemptNo||1)||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));

        // Compra já entregue: nunca reabrir.
        if(chain.some(x=>x.finalizationTime||x.status==='Finalizada'))continue;

        const latest=chain.at(-1);if(!latest)continue;

        // Se uma continuação já existe, mas ficou presa em data antiga,
        // traz essa tentativa aberta para a fila operacional de hoje.
        const open=chain.slice().reverse().find(x=>
          !x.finalizationTime && !x.departureTime && !x.cycleId &&
          !['Finalizada','Cancelada','Retirada na loja','Programada','Reagendada','Devolvida'].includes(x.status)
        );
        if(open){
          let touched=false;
          if(open.date!==today){open.date=today;touched=true}
          if(open.status!=='Na loja'){open.status='Na loja';touched=true}
          if(open.returnTime){open.returnTime='';touched=true}
          if(open.returnedUndelivered){open.returnedUndelivered=false;touched=true}
          if(open.returnReasonId){open.returnReasonId='';touched=true}
          if(open.returnReasonText){open.returnReasonText='';touched=true}
          if(open.reasonId){open.reasonId='';touched=true}
          if(open.reasonText){open.reasonText='';touched=true}
          if(open.nextAction!=='Disponível para nova saída'){open.nextAction='Disponível para nova saída';touched=true}
          if(touched){
            open.updatedAt=nowISO();open.history=Array.isArray(open.history)?open.history:[];
            open.history.push({id:uid('evt'),type:'v31_retry_reactivated',at:nowISO(),date:today});
            changed++;reactivated++;
          }
          continue;
        }

        // Se a última tentativa voltou, cria uma nova tentativa limpa para hoje.
        const isReturned=latest.status==='Devolvida'||latest.returnedUndelivered===true;
        if(!isReturned)continue;
        if(latest.scheduledDate||['Reagendada','Programada','Cancelada','Retirada na loja'].includes(latest.status))continue;

        latest.nextAction='Disponível para nova tentativa de entrega';
        latest.history=Array.isArray(latest.history)?latest.history:[];
        if(!latest.history.some(h=>h?.type==='v31_retry_released'))latest.history.push({id:uid('evt'),type:'v31_retry_released',cycleId:latest.cycleId||'',at:nowISO()});
        latest.updatedAt=nowISO();

        const next=buildContinuation(latest,s,{partial:false});
        next.date=today;
        next.status='Na loja';
        next.cycleId='';next.driverId='';next.vehicleId='';next.departureTime='';next.finalizationTime='';next.returnTime='';
        next.returnedUndelivered=false;next.returnReasonId='';next.returnReasonText='';next.reasonId='';next.reasonText='';
        next.nextAction='Disponível para nova saída';
        next.history=Array.isArray(next.history)?next.history:[];
        next.history.push({id:uid('evt'),type:'v31_available_for_new_cycle',fromId:latest.id,at:nowISO(),date:today});
        s.deliveries.push(next);
        changed++;created++;
      }

      if(!changed)return 0;
      s.meta=s.meta||{};s.meta.updatedAt=nowISO();s.meta.v31ReturnAvailability=true;
      await writeState(s);
      queueNotice('Entrega liberada para novo ciclo',created
        ? `${created} nova(s) tentativa(s) criada(s) e ${reactivated} tentativa(s) reativada(s). O histórico anterior foi mantido.`
        : `${reactivated} tentativa(s) aberta(s) foram trazidas para a fila de hoje.`);
      return changed;
    }catch(err){console.warn('[NILO V31] reparo sob demanda pendente',err);return 0}
  }

  function isMountNewCycleButton(target){
    const btn=target?.closest?.('button,a');if(!btn)return null;
    const text=String(btn.textContent||'').replace(/\s+/g,' ').trim();
    return /Montar nova sa[ií]da|Montar sa[ií]da|Nova sa[ií]da/i.test(text)?btn:null;
  }

  async function handleMountCycleClick(event){
    if(replayingCycleOpen)return;
    const btn=isMountNewCycleButton(event.target);if(!btn)return;
    event.preventDefault();event.stopImmediatePropagation();
    const created=await repairReturnedWithoutRetryOnDemand();
    if(created>0){
      try{sessionStorage.setItem(REOPEN_CYCLE_KEY,'1')}catch{}
      setTimeout(()=>location.reload(),350);
      return;
    }
    replayingCycleOpen=true;
    try{btn.click()}finally{setTimeout(()=>{replayingCycleOpen=false},0)}
  }

  function reopenCycleAfterSafeReload(){
    let should=false;try{should=sessionStorage.getItem(REOPEN_CYCLE_KEY)==='1';if(should)sessionStorage.removeItem(REOPEN_CYCLE_KEY)}catch{}
    if(!should)return;
    setTimeout(()=>{
      const btn=qa('button,a').find(x=>/Montar nova sa[ií]da|Montar sa[ií]da|Nova sa[ií]da/i.test(String(x.textContent||'')));
      if(!btn)return;
      replayingCycleOpen=true;
      try{btn.click()}finally{setTimeout(()=>{replayingCycleOpen=false},0)}
    },1200);
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
      if(id&&toggle){setTimeout(()=>persistLargeConfig(id,toggle.checked,planned?.value||2),120);setTimeout(()=>persistTripEditsFromForm(form,id),140);}
    }

    if(form && form.querySelector?.('[name="orderNo"]') && form.querySelector?.('[name="coupon"]') && form.querySelector?.('[name="deliveryMode"]')){
      const toggle=form.querySelector('[data-v26-new-large-toggle]');if(toggle?.checked){
        const match={coupon:String(form.querySelector('[name="coupon"]')?.value||''),orderNo:String(form.querySelector('[name="orderNo"]')?.value||'')};
        const planned=form.querySelector('[data-v26-new-planned]')?.value||2;setTimeout(()=>persistNewLargeConfig(match,true,planned,startedAt),120);
      }
    }

    const isCycleReturnForm=form?.id==='closeCycleForm'||Boolean(form?.querySelector?.('input[name="hasReturnedDeliveries"]'));
    if(isCycleReturnForm){
      const selectedIds=new Set(qa('input[name="returnedDeliveryIds"]:checked').map(x=>x.value));
      const partials=new Map();qa('[data-v26-partial]:checked').forEach(x=>{
        const box=x.closest('.v26-partial-choice');partials.set(x.dataset.v26Partial,{total:box?.querySelector('[data-v26-trip-total]')?.value||'',deliveryTime:box?.querySelector('[data-v26-trip-delivery-time]')?.value||'',note:box?.querySelector('[data-v26-trip-note]')?.value||''});
      });
      setTimeout(()=>waitAndApplyReturn({startedAt,selectedIds,partials}),80);
    }
  },true);

  document.addEventListener('click',event=>{handleMountCycleClick(event)},true);

  const observer=new MutationObserver(()=>{
    injectLargeDeliveryManager();injectNewLargeDeliveryFields();injectPartialControls();enhanceCharts();scheduleContrastAudit();
  });

  function init(){
    showNotice();injectLargeDeliveryManager();injectNewLargeDeliveryFields();injectPartialControls();enhanceCharts();scheduleContrastAudit();reopenCycleAfterSafeReload();
    const modal=q('#modalBody'),view=q('#view');if(modal)observer.observe(modal,{childList:true,subtree:true});if(view)observer.observe(view,{childList:true,subtree:true});
    window.addEventListener('resize',scheduleContrastAudit,{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
