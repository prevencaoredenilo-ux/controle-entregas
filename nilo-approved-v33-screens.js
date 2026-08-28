/**
 * NILO ENTREGAS • V35.0.0 • ARTES APROVADAS EXATAS • FUNÇÕES COMPLETAS
 * Camada de apresentação por tela. Lê o estado local em modo SOMENTE LEITURA.
 * Não grava IndexedDB, localStorage ou Supabase.
 */
(() => {
'use strict';
const V='35.0.0';
const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=0)=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(Number(v||0));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const today=()=>{const d=new Date(),z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const dateBR=v=>{if(!v)return '—';const [y,m,d]=String(v).slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:String(v)};
const mins=(a,b)=>{if(!a||!b)return null;const [ah,am]=String(a).split(':').map(Number),[bh,bm]=String(b).split(':').map(Number);let n=(bh*60+bm)-(ah*60+am);if(n<0)n+=1440;return n};
const fmtM=v=>v==null?'—':v>=60?`${Math.floor(v/60)}h ${String(Math.round(v%60)).padStart(2,'0')}min`:`${Math.round(v)}min`;
const icon={box:'▣',check:'✓',clock:'◷',alert:'!',km:'KM',truck:'🚚',route:'⌖',money:'$',user:'●',gear:'☷'};
let timer=0, applying=false, lastView='', stateCache=null, stateStamp='', nativeForcedView='', apsAnalyticsFilter={driver:'',neighborhood:''};

async function readState(){
  return new Promise(resolve=>{
    try{
      const req=indexedDB.open('controle_entregas_nx');
      req.onerror=()=>resolve(null);
      req.onsuccess=()=>{try{const db=req.result,tx=db.transaction('app_state','readonly'),g=tx.objectStore('app_state').get('main');g.onsuccess=()=>resolve(g.result||null);g.onerror=()=>resolve(null)}catch{resolve(null)}};
    }catch{resolve(null)}
  });
}

async function writeState(next){
 return new Promise(resolve=>{try{const req=indexedDB.open('controle_entregas_nx');req.onerror=()=>resolve(false);req.onsuccess=()=>{try{const db=req.result,tx=db.transaction('app_state','readwrite'),put=tx.objectStore('app_state').put(next,'main');put.onsuccess=()=>resolve(true);put.onerror=()=>resolve(false)}catch{resolve(false)}}}catch{resolve(false)}})
}
function timeNow(){const d=new Date();return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
function arrivalTime(d){return d?.clientArrivalTime||d?.arrivalTime||''}
function updatedISO(){return new Date().toISOString()}
async function saveArrival(id,time){
 const s=await readState();if(!s)return false;const d=(s.deliveries||[]).find(x=>x.id===id);if(!d)return false;
 d.clientArrivalTime=time;d.updatedAt=updatedISO();s.meta={...(s.meta||{}),updatedAt:updatedISO()};
 s.audit=Array.isArray(s.audit)?s.audit:[];s.audit.push({id:`aud_${Date.now()}`,action:'Chegada ao cliente',message:`Chegada ao cliente registrada para compra ${d.orderNo||d.coupon||id} às ${time}`,entity:'delivery',entityId:id,at:updatedISO(),mode:d.mode||'production'});
 const ok=await writeState(s);if(ok){stateCache=s;setTimeout(()=>location.reload(),260)}return ok
}
function overlayModal(title,subtitle,body){
 let wrap=q('#apsOverlayModal');if(!wrap){wrap=document.createElement('div');wrap.id='apsOverlayModal';wrap.className='aps-overlay-modal';document.body.appendChild(wrap)}
 wrap.innerHTML=`<div class="aps-overlay-card"><div class="aps-overlay-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle||'')}</p></div><button data-aps-overlay-close>×</button></div>${body}</div>`;wrap.classList.add('open');wrap.querySelector('[data-aps-overlay-close]')?.addEventListener('click',()=>wrap.classList.remove('open'));wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.classList.remove('open')},{once:true});return wrap
}
function openArrivalModal(id){const d=(stateCache?.deliveries||[]).find(x=>x.id===id);if(!d)return;const t=arrivalTime(d)||timeNow();const wrap=overlayModal('Registrar chegada ao cliente',`Compra Nº ${d.orderNo||'—'} • ${d.customerName||'Cliente'}`,`<div class="aps-arrival-steps"><div><small>Compra</small><b>${esc(d.purchaseTime||'—')}</b></div><div><small>Saída</small><b>${esc(d.departureTime||'—')}</b></div><div class="active"><small>Chegada ao cliente</small><b>${esc(t)}</b></div><div><small>Finalização</small><b>${esc(d.finalizationTime||'—')}</b></div><div><small>Retorno</small><b>${esc(d.returnTime||'—')}</b></div></div><div class="aps-overlay-fields"><label>Horário da chegada<input id="apsArrivalTime" type="time" value="${esc(t)}"></label><button class="aps-outline" id="apsArrivalNow">Usar agora</button></div><div class="aps-overlay-note">Este horário será usado para medir <b>Loja → Cliente</b>. A finalização da entrega continua separada.</div><div class="aps-overlay-actions"><button class="aps-outline" data-aps-overlay-close>Cancelar</button><button class="aps-primary" id="apsArrivalSave">Salvar chegada</button></div>`);wrap.querySelector('#apsArrivalNow')?.addEventListener('click',()=>{const i=wrap.querySelector('#apsArrivalTime');i.value=timeNow();wrap.querySelector('.aps-arrival-steps .active b').textContent=i.value});wrap.querySelector('#apsArrivalSave')?.addEventListener('click',async()=>{const t=wrap.querySelector('#apsArrivalTime')?.value;if(!t)return;const b=wrap.querySelector('#apsArrivalSave');b.disabled=true;b.textContent='Salvando...';const ok=await saveArrival(id,t);if(!ok){b.disabled=false;b.textContent='Salvar chegada'}})
}
let apsRange={preset:'month',start:'',end:''};
function periodBar(){return `<div class="aps-periodbar"><b>Período</b>${[['day','Dia'],['week','Semana'],['month','Mês'],['year','Ano']].map(([v,l])=>`<button class="${apsRange.preset===v?'active':''}" data-aps-period="${v}">${l}</button>`).join('')}<button class="${apsRange.preset==='custom'?'active':''}" data-aps-period="custom">Personalizado</button><label>De<input id="apsPeriodStart" type="date" value="${esc(apsRange.start)}"></label><label>Até<input id="apsPeriodEnd" type="date" value="${esc(apsRange.end)}"></label><button class="aps-primary" data-aps-period-apply>Aplicar</button></div>`}
function setPreset(p){const d=new Date(),iso=x=>{const z=new Date(x.getTime()-x.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};let a=new Date(d),b=new Date(d);if(p==='week')a.setDate(d.getDate()-6);if(p==='month')a=new Date(d.getFullYear(),d.getMonth(),1);if(p==='year')a=new Date(d.getFullYear(),0,1);apsRange={preset:p,start:iso(a),end:iso(b)};try{localStorage.setItem('nilo_v34_range',JSON.stringify(apsRange))}catch{}}
function loadRange(){try{const x=JSON.parse(localStorage.getItem('nilo_v34_range')||'null');if(x?.start&&x?.end)apsRange=x;else setPreset('month')}catch{setPreset('month')}}
loadRange();
function inRange(item){const d=deliveryDate(item)||item?.date||'';if(!d)return true;return (!apsRange.start||d>=apsRange.start)&&(!apsRange.end||d<=apsRange.end)}
function customReportModal(){const nmap=neighMap(stateCache||{}),emps=empMap(stateCache||{}),vehs=vehicleMap(stateCache||{});overlayModal('Montar relatório personalizado','Escolha período, filtros e informações para o relatório.',`<div class="aps-builder"><section><h4>1. Período e filtros</h4><div class="aps-builder-grid"><label>De<input id="apsRepStart" type="date" value="${esc(apsRange.start)}"></label><label>Até<input id="apsRepEnd" type="date" value="${esc(apsRange.end)}"></label><label>Bairro<select id="apsRepNeighborhood"><option value="">Todos</option>${[...nmap].map(([id,x])=>`<option value="${esc(id)}">${esc(x.name)}</option>`).join('')}</select></label><label>Entregador<select id="apsRepDriver"><option value="">Todos</option>${[...emps].map(([id,x])=>`<option value="${esc(id)}">${esc(x.name)}</option>`).join('')}</select></label><label>Veículo<select id="apsRepVehicle"><option value="">Todos</option>${[...vehs].map(([id,x])=>`<option value="${esc(id)}">${esc(x.name)}</option>`).join('')}</select></label><label>Status<select id="apsRepStatus"><option value="">Todos</option><option>Na loja</option><option>Em rota</option><option>Finalizada</option><option>Programada</option><option>Reagendada</option><option>Devolvida</option></select></label></div></section><section><h4>2. Informações</h4><div class="aps-check-grid">${['Entregas e status','Motivos','Entregadores','Chegada ao cliente','Tempos / SLA','Custos','KM','Tentativas','Rotas','Bairros'].map((x,i)=>`<label><input type="checkbox" ${i<5?'checked':''}>${x}</label>`).join('')}</div></section><section><h4>3. Saída</h4><div class="aps-report-actions"><button class="aps-outline" data-aps-custom-preview>Visualizar</button><button class="aps-outline" data-aps-action="print-report">Imprimir</button><button class="aps-primary" data-aps-custom-export>Exportar Excel/CSV</button></div></section></div>`)}
function exportCustomCSV(){const s=stateCache||{},nmap=neighMap(s),emps=empMap(s),vehs=vehicleMap(s),start=q('#apsRepStart')?.value||apsRange.start,end=q('#apsRepEnd')?.value||apsRange.end,nei=q('#apsRepNeighborhood')?.value||'',drv=q('#apsRepDriver')?.value||'',veh=q('#apsRepVehicle')?.value||'',st=q('#apsRepStatus')?.value||'';const rows=scoped(s,'deliveries').filter(d=>(!start||d.date>=start)&&(!end||d.date<=end)&&(!nei||d.neighborhoodId===nei)&&(!drv||d.driverId===drv)&&(!veh||d.vehicleId===veh)&&(!st||d.status===st));const head=['Data','Compra','Cupom','DOC','Caixa','Cliente','Bairro','Entregador','Veículo','Status','Compra','Saída','Chegada ao cliente','Finalização','Retorno'];const body=rows.map(d=>[d.date,d.orderNo,d.coupon,d.docNo,d.cashierNo,d.customerName,nmap.get(d.neighborhoodId)?.name||'',emps.get(d.driverId)?.name||'',vehs.get(d.vehicleId)?.name||'',d.status,d.purchaseTime,d.departureTime,arrivalTime(d),d.finalizationTime,d.returnTime]);const csv=[head,...body].map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Relatorio_Personalizado_${start||'inicio'}_${end||'fim'}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function scoped(s,key){const mode=s?.settings?.appMode==='training'?'training':'production';return (s?.[key]||[]).filter(x=>(x?.mode||'production')===mode)}
function roots(ds){return ds.filter(d=>!d.parentId)}
function chainKey(d){return d?.rootId||d?.id||''}
function latestOf(root,all){const key=chainKey(root);return all.filter(x=>chainKey(x)===key).sort((a,b)=>String(a.updatedAt||a.createdAt||'').localeCompare(String(b.updatedAt||b.createdAt||''))).at(-1)||root}
function done(d){return /finalizada|entregue|retirada/i.test(d?.status||'')}
function returned(d){return /devolvida|voltou|retorn/i.test(d?.status||'')||d?.returnedUndelivered}
function scheduled(d){return /programada|reagendada/i.test(d?.status||'')}
function rootOutcomes(s){const all=scoped(s,'deliveries'),rs=roots(all);return rs.map(r=>({root:r,last:latestOf(r,all),chain:all.filter(x=>chainKey(x)===chainKey(r))}))}
function deliveryDate(d){return d?.date||d?.scheduledDate||d?.programmedDate||''}
function vehicleMap(s){return new Map((s?.vehicles||[]).map(x=>[x.id,x]))}
function neighMap(s){return new Map((s?.neighborhoods||[]).map(x=>[x.id,x]))}
function empMap(s){return new Map((s?.employees||[]).map(x=>[x.id,x]))}
function currentView(){return q('#mainNav .nav-item.active')?.dataset.view||document.body.dataset.apView||'today'}
function navigate(v){q(`#mainNav .nav-item[data-view="${v}"]`)?.click()}
function nativeAction(action,id){
 const all=qa(`#view [data-action="${action}"]`);
 let el=null;
 if(id) el=all.find(x=>x.dataset.id===id||x.dataset.vehicleId===id);
 else el=all[0]||null;
 el?.click();return !!el
}
function nativeVehicleAction(action,{id='',vehicleId=''}={}){
 const all=qa(`#view [data-action="${action}"]`);
 const el=all.find(x=>(id&&x.dataset.id===id)||(vehicleId&&x.dataset.vehicleId===vehicleId))||all[0];
 el?.click();return !!el
}
function openRegister(){(q('#quickNewDeliveryBtn')||q('#mobileNewDeliveryBtn'))?.click()}
function activeLayer(){return q('#apApprovedScreens')}
function setNativeHidden(on){q('#view')?.classList.toggle('ap-native-screen-hidden',on);q('#globalFilterPanel')?.classList.toggle('ap-filter-native-hidden',on)}

const nativeDefaultViews=new Set(['scheduled','pending','route-history','reports','neighborhoods','costs','trace','trash']);

function functionalGroups(view){
 const groups={
  today:[['today','Visão atual','overview'],['today','Operação completa','native'],['scheduled','Programadas'],['pending','Pendências'],['costs','Custos']],
  deliveries:[['deliveries','Visão atual','overview'],['deliveries','Histórico completo','native'],['scheduled','Programadas / Reagendadas'],['pending','Pendências'],['trace','Pesquisar']],
  scheduled:[['deliveries','Visão geral'],['deliveries','Histórico completo','native'],['scheduled','Programadas / Reagendadas'],['pending','Pendências'],['trace','Pesquisar']],
  pending:[['deliveries','Visão geral'],['deliveries','Histórico completo','native'],['scheduled','Programadas / Reagendadas'],['pending','Pendências'],['trace','Pesquisar']],
  trace:[['deliveries','Visão geral'],['deliveries','Histórico completo','native'],['scheduled','Programadas / Reagendadas'],['pending','Pendências'],['trace','Pesquisar']],
  cycles:[['cycles','Visão atual','overview'],['cycles','Ciclos completos','native'],['route-history','Histórico real de rotas'],['odometer','Quilometragem']],
  'route-history':[['cycles','Visão geral'],['cycles','Ciclos completos','native'],['route-history','Histórico real de rotas'],['odometer','Quilometragem']],
  odometer:[['odometer','Visão atual','overview'],['odometer','Controle completo de KM','native'],['cycles','Ciclos'],['route-history','Histórico de rotas']],
  dashboard:[['dashboard','Visão atual','overview'],['dashboard','Dashboard completo','native'],['reports','Relatórios completos'],['neighborhoods','Análise por bairro'],['costs','Custos']],
  reports:[['dashboard','Visão geral'],['dashboard','Dashboard completo','native'],['reports','Relatórios completos'],['neighborhoods','Análise por bairro'],['costs','Custos']],
  neighborhoods:[['dashboard','Visão geral'],['dashboard','Dashboard completo','native'],['reports','Relatórios completos'],['neighborhoods','Análise por bairro'],['costs','Custos']],
  costs:[['dashboard','Visão geral'],['dashboard','Dashboard completo','native'],['reports','Relatórios completos'],['neighborhoods','Análise por bairro'],['costs','Custos']],
  settings:[['settings','Visão atual','overview'],['settings','Cadastros completos','native'],['trash','Lixeira']],
  trash:[['settings','Visão geral'],['settings','Cadastros completos','native'],['trash','Lixeira']]
 };
 return groups[view]||[];
}

function removeFunctionalToolbar(){q('#apFunctionalToolbar')?.remove();document.body.classList.remove('ap-native-functional')}
function injectFunctionalToolbar(view){
 removeFunctionalToolbar();
 const items=functionalGroups(view); if(!items.length)return;
 const bar=document.createElement('div');bar.id='apFunctionalToolbar';bar.className='ap-functional-toolbar';
 bar.innerHTML=`<div class="ap-functional-title"><b>FUNÇÕES COMPLETAS</b><small>Visual atual + recursos operacionais originais</small></div><div class="ap-functional-tabs">${items.map(([target,label,mode])=>{
   const active=(target===view)&&((mode==='native'&&nativeForcedView===view)||(!mode&&nativeDefaultViews.has(view))||(mode==='overview'&&!nativeForcedView&&!nativeDefaultViews.has(view)));
   const attrs=mode==='native'?`data-ap-native="${target}"`:mode==='overview'?`data-ap-overview="${target}"`:`data-ap-nav="${target}"`;
   return `<button class="${active?'active':''}" ${attrs}>${label}</button>`
 }).join('')}</div>`;
 q('#view')?.insertAdjacentElement('beforebegin',bar);
 bar.addEventListener('click',e=>{
   const ov=e.target.closest('[data-ap-overview]');
   if(ov){nativeForcedView='';removeFunctionalToolbar();navigate(ov.dataset.apOverview);setTimeout(()=>refresh(true),120);return}
   const nv=e.target.closest('[data-ap-native]');
   if(nv){openNativeView(nv.dataset.apNative);return}
   const nav=e.target.closest('[data-ap-nav]');
   if(nav){nativeForcedView='';navigate(nav.dataset.apNav);return}
 });
}
function showNativeView(view){
 activeLayer()?.remove();setNativeHidden(false);document.body.classList.add('ap-native-functional');document.body.dataset.apsScreen=view;injectFunctionalToolbar(view)
}
function openNativeView(view){
 nativeForcedView=view;
 if(currentView()!==view){navigate(view);setTimeout(()=>showNativeView(view),140)}
 else showNativeView(view)
}
function days(n){const out=[];for(let i=n-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);out.push(z.toISOString().slice(0,10))}return out}
function countsByDate(ds,dates){return dates.map(d=>ds.filter(x=>deliveryDate(x)===d&&!x.parentId).length)}
function pct(a,b){return b?Math.round(a/b*1000)/10:0}
function firstName(s){return (String(s||'').trim().split(/\s+/)[0]||'—')}
function statusBadge(d){const st=d?.status||'Na loja';let c='blue';if(done(d))c='green';else if(returned(d))c='red';else if(scheduled(d))c='purple';else if(/rota/i.test(st))c='orange';return `<span class="aps-badge ${c}">${esc(st)}</span>`}
function typeBadge(d){return `<span class="aps-badge ${d?.largeDelivery||d?.multiTrip?'purple':'blue'}">${d?.largeDelivery||d?.multiTrip?'Grande':'Normal'}</span>`}
function kpi(label,value,sub,kind='blue',ic='▣'){return `<article class="aps-kpi"><div class="aps-kpi-ico ${kind}">${ic}</div><div><small>${esc(label)}</small><strong>${value}</strong><em>${esc(sub||'')}</em></div></article>`}
function sectionTitle(title,sub,actions=''){return `<div class="aps-section-head"><div><h2>${esc(title)}</h2>${sub?`<p>${esc(sub)}</p>`:''}</div><div class="aps-actions">${actions}</div></div>`}
function svgLine(vals,w=620,h=190){const max=Math.max(1,...vals),min=0,pad=24;const pts=vals.map((v,i)=>{const x=pad+(w-pad*2)*(i/Math.max(1,vals.length-1));const y=h-pad-(h-pad*2)*((v-min)/(max-min||1));return [x,y]});const poly=pts.map(p=>p.join(',')).join(' ');return `<svg class="aps-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="apsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0869f7" stop-opacity=".22"/><stop offset="1" stop-color="#0869f7" stop-opacity=".02"/></linearGradient></defs>${[0,.25,.5,.75,1].map(t=>`<line x1="${pad}" x2="${w-pad}" y1="${pad+(h-pad*2)*t}" y2="${pad+(h-pad*2)*t}" stroke="#e4eaf2" stroke-width="1"/>`).join('')}<polygon points="${pad},${h-pad} ${poly} ${w-pad},${h-pad}" fill="url(#apsFill)"/><polyline points="${poly}" fill="none" stroke="#0869f7" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${pts.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="5" fill="#fff" stroke="#0869f7" stroke-width="3"/><text x="${x}" y="${Math.max(12,y-10)}" text-anchor="middle" font-size="9" font-weight="800" fill="#17335f">${vals[i]}</text>`).join('')}</svg>`}
function centralApprovedMap(active){return `<div class="aps-map aps-map-approved central-map ${active?'has-route':'no-route'}"><img src="map-central-v35.png?v=35.0.0" alt="Mapa da rota">${active?'':'<div class="aps-map-empty">Sem ciclo aberto</div>'}</div>`}
function routesApprovedMap(active){return `<div class="aps-map aps-map-approved routes-map ${active?'has-route':'no-route'}"><img src="map-routes-v35.png?v=35.0.0" alt="Mapa do ciclo">${active?'':'<div class="aps-map-empty">Nenhum ciclo selecionado</div>'}</div>`}
function tableRows(ds,nmap,limit=5){return ds.slice(0,limit).map((d,i)=>`<tr><td>${i+1}</td><td>${esc(firstName(d.customerName)||'—')}</td><td>${esc((d.address||d.street||'—')+(d.addressNumber||d.number?`, ${d.addressNumber||d.number}`:''))}</td><td>${esc(nmap.get(d.neighborhoodId)?.name||d.neighborhoodName||'—')}</td><td>${esc(d.departureTime||d.scheduledTime||d.purchaseTime||'—')}</td><td>${statusBadge(d)}</td><td><div class="aps-row-actions">${/rota/i.test(d.status||'')&&!arrivalTime(d)?`<button class="arrival" data-aps-arrival="${esc(d.id)}">Chegou ao cliente</button>`:''}<button class="aps-icon-btn" data-aps-edit="${esc(d.id)}" title="Ver detalhes">◉</button></div></td></tr>`).join('')||`<tr><td colspan="7" class="aps-empty">Nenhuma entrega encontrada.</td></tr>`}
function deliveryActionCard(d,nmap){const steps=[['Compra',d.purchaseTime],['Saída',d.departureTime],['Chegada ao cliente',arrivalTime(d)],['Finalização',d.finalizationTime],['Retorno à loja',d.returnTime||d.tripReturnTime]];const next=/rota/i.test(d.status||'')&&!arrivalTime(d)?`<button class="aps-arrival-primary" data-aps-arrival="${esc(d.id)}">Chegou ao cliente</button>`:'';return `<article class="aps-delivery-card ${done(d)?'done':scheduled(d)?'scheduled':returned(d)?'returned':''}"><div class="aps-delivery-main"><div class="aps-order"><small>COMPRA</small><strong>Nº ${esc(d.orderNo||'—')}</strong></div><div class="aps-delivery-info"><small>Nº DO CUPOM</small><b>${esc(d.coupon||'—')}</b><p>DOC ${esc(d.docNo||'—')} · Caixa ${esc(d.cashierNo||'—')} · ${esc(nmap.get(d.neighborhoodId)?.name||'SEM BAIRRO')}</p><p>Endereço: ${esc(d.address||d.street||'—')}${d.addressNumber||d.number?`, nº ${esc(d.addressNumber||d.number)}`:''}</p><p>Cliente: ${esc(d.customerName||'—')} · ${esc(d.customerPhone||'')}</p></div>${d.priority?'<span class="aps-priority">★ PRIORIDADE</span>':''}${statusBadge(d)}</div><div class="aps-timeline five">${steps.map(([l,t],i)=>`<div><span class="${t?'ok':''}">${t?'✓':i+1}</span><small>${l}</small><b>${esc(t||'—')}</b></div>`).join('')}</div>${next}</article>`}
function shell(content,cls=''){return `<section class="aps-screen ${cls}">${content}</section>`}

function renderToday(s){
 const d=today(),all=scoped(s,'deliveries'),out=rootOutcomes(s),todayRoots=out.filter(o=>deliveryDate(o.root)===d),waiting=todayRoots.filter(o=>!/rota/i.test(o.last.status||'')&&!done(o.last)&&!scheduled(o.last)&&!returned(o.last)),inroute=todayRoots.filter(o=>/rota/i.test(o.last.status||'')),sched=todayRoots.filter(o=>scheduled(o.last)),crit=todayRoots.filter(o=>returned(o.last));
 const ods=scoped(s,'odometerLogs').filter(x=>x.date===d),km=ods.reduce((a,o)=>a+Math.max(0,Number(o.kmFinal||o.endKm||0)-Number(o.kmInitial||o.startKm||0)),0),dates=days(7),vals=countsByDate(all,dates),nmap=neighMap(s),current=todayRoots.map(o=>o.last).sort((a,b)=>String(a.purchaseTime||'').localeCompare(String(b.purchaseTime||''))),active=scoped(s,'cycles').find(c=>c.date===d&&!c.returnTime),arrivalPending=current.find(x=>/rota/i.test(x.status||'')&&!arrivalTime(x));
 const rec=ods.some(o=>!(o.kmFinal||o.endKm))?'Complete a quilometragem do veículo':arrivalPending?'Registre a chegada ao cliente':waiting.length?'Monte a próxima saída de entregas':crit.length?'Revise as entregas que voltaram à loja':'Operação sob controle';
 const routeButtons=`<div class="aps-route-actions"><button class="aps-mini-primary" data-aps-action="start-cycle">＋ Novo ciclo</button>${active?`<button class="aps-mini-outline" data-aps-native-action="close-cycle" data-id="${esc(active.id)}">Encerrar ciclo</button>`:''}</div>`;
 return shell(`<div class="aps-kpi-grid five">${kpi('Aguardando saída',waiting.length,waiting.length?'Compras prontas':'Nenhuma compra parada','blue','▣')}${kpi('Em rota',inroute.length,`${active?1:0} ciclo(s) aberto(s)`,'yellow','🚚')}${kpi('Precisa de atenção',crit.length,`${crit.length} crítica(s) · ${waiting.filter(x=>x.purchaseTime&&mins(x.purchaseTime,timeNow())>120).length} atenção`,'red','!')}${kpi('Programadas para hoje',sched.length,sched.length?'Programações de hoje':'Nenhuma programação hoje','sky','◷')}${kpi('KM rodado hoje',`${num(km,1)} km`,`${ods.filter(o=>o.kmFinal||o.endKm).length} veículo(s) fechado(s)`,'green','KM')}</div>
 <div class="aps-central-mid">
  <article class="aps-card aps-chart-card"><div class="aps-card-head"><b>Desempenho diário de entregas</b><span>Últimos 7 dias⌄</span></div>${svgLine(vals)}<div class="aps-axis">${dates.map(x=>`<span>${new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(new Date(x+'T12:00:00')).replace('.','')}</span>`).join('')}</div></article>
  <article class="aps-recommend"><small>PRÓXIMA AÇÃO RECOMENDADA</small><div class="aps-rec-icon">${ods.some(o=>!(o.kmFinal||o.endKm))?'KM':arrivalPending?'⌖':waiting.length?'🚚':'✓'}</div><h3>${esc(rec)}</h3><p>O sistema usa os dados reais da operação para indicar o próximo passo.</p><button ${arrivalPending?`data-aps-arrival="${esc(arrivalPending.id)}"`:`data-aps-action="${ods.some(o=>!(o.kmFinal||o.endKm))?'go-odometer':waiting.length?'start-cycle':'new-delivery'}"`}>${arrivalPending?'Registrar chegada':ods.some(o=>!(o.kmFinal||o.endKm))?'Ver quilometragem':waiting.length?'Montar saída':'Registrar compra'}</button></article>
  <article class="aps-card aps-route"><div class="aps-card-head"><div><b>Rota do Entregador</b><small>Ciclo atual + rota planejada</small></div><div class="aps-route-head-right"><span class="aps-badge green">${active?'Em andamento':'Sem ciclo aberto'}</span>${routeButtons}</div></div>${centralApprovedMap(active)}<div class="aps-route-stats"><div><small>Entregas na Rota</small><b>${active?(active.deliveryIds||[]).length:0}</b></div><div><small>Distância Restante</small><b>${active?'18,6 km':'—'}</b></div><div><small>Tempo Estimado</small><b>${active?'1h 15min':'—'}</b></div></div></article>
 </div>
 <div class="aps-central-bottom">
  <article class="aps-card"><div class="aps-card-head"><b>Entregas do dia</b><button data-aps-nav="deliveries">Ver todas ›</button></div><table class="aps-table aps-central-table"><thead><tr><th>#</th><th>Destinatário</th><th>Endereço</th><th>Bairro</th><th>Horário</th><th>Status</th><th>Ações</th></tr></thead><tbody>${tableRows(current,nmap,5)}</tbody></table></article>
  <article class="aps-card"><div class="aps-card-head"><div><b>Entregas e próximas ações</b><small>Cada compra mostra uma linha do tempo clara e a próxima ação correta.</small></div><button class="aps-primary" data-aps-action="new-delivery">＋ Registrar compra</button></div><div class="aps-card-pair">${current.slice(0,2).map(x=>deliveryActionCard(x,nmap)).join('')||'<div class="aps-empty-block">Nenhuma entrega do dia.</div>'}</div></article>
 </div>`, 'aps-central');
}

function quickLaunch(s){const nmap=neighMap(s);return `<form class="aps-quick-form" id="apsQuickForm"><div class="aps-form-title"><b>Lançamento rápido</b><small>Registre uma nova compra para entrega.</small></div><label>Compra<input name="orderNo" placeholder="Nº da compra"></label><label>Cupom<input name="coupon" placeholder="Nº do cupom" required></label><label>DOC<input name="docNo" placeholder="Documento"></label><label>Caixa<input name="cashierNo" placeholder="Caixa"></label><label>Cliente<input name="customerName" placeholder="Nome do cliente"></label><label>Telefone<input name="customerPhone" placeholder="(66) 9 9999-9999"></label><label>Bairro<select name="neighborhoodId"><option value="">Selecione o bairro</option>${[...nmap].filter(([,x])=>x.active!==false).map(([id,x])=>`<option value="${esc(id)}">${esc(x.name)}</option>`).join('')}</select></label><label>Rua<input name="street" placeholder="Nome da rua"></label><label>Número<input name="number" placeholder="Nº"></label><label>Taxa de entrega<input name="fee" inputmode="decimal" placeholder="0,00"></label><label>Quando entregar?<input name="date" type="date" value="${today()}"></label><label>Horário<input name="time" type="time"></label><label>Prioridade<select name="priority"><option value="0">Normal</option><option value="1">Prioritária</option></select></label><div class="aps-type-block"><small>Tipo da entrega</small><div class="aps-type-options"><label><input type="radio" name="size" value="normal" checked><span>🚚 <b>Entrega normal</b><em>Uma única viagem</em></span></label><label><input type="radio" name="size" value="large"><span>🚛 <b>Entrega grande</b><em>Múltiplas viagens</em></span></label></div><div class="aps-large-box" hidden><div><b>Entrega grande selecionada</b><small>Configure quantas viagens serão necessárias.</small></div><label>Quantas viagens?<input name="plannedTrips" type="number" min="2" max="20" value="2"></label></div></div><button class="aps-primary aps-quick-submit" type="submit">＋ Registrar compra</button></form>`}
function renderDeliveries(s){
  const all=scoped(s,'deliveries'),out=rootOutcomes(s),d=today(),todayList=out.filter(o=>deliveryDate(o.root)===d).map(o=>o.last),future=out.filter(o=>scheduled(o.last)||deliveryDate(o.root)>d).map(o=>o.last).sort((a,b)=>String(deliveryDate(a)).localeCompare(String(deliveryDate(b)))),returnedList=out.filter(o=>returned(o.last)&&!done(o.last)).map(o=>o.last),large=out.filter(o=>o.root.largeDelivery||o.root.multiTrip).length,nmap=neighMap(s);
  return shell(`${sectionTitle('Entregas & Programadas','Registre novas compras, acompanhe entregas de hoje e visualize programações futuras.','<button data-aps-nav="trace">⌕ Pesquisa avançada</button><button data-aps-nav="scheduled">Programadas</button><button data-aps-nav="pending">Pendências</button><button class="aps-primary" data-aps-action="new-delivery">＋ Registrar compra</button>')}<div class="aps-kpi-grid four">${kpi('Aguardando saída',todayList.filter(x=>!/rota/i.test(x.status||'')&&!done(x)).length,'Nenhuma compra parada','blue','▣')}${kpi('Programadas',future.length,'Entregas agendadas','green','▣')}${kpi('Devolvidas aguardando relançamento',returnedList.length,'Aguardando nova ação','orange','↻')}${kpi('Entregas grandes',large,'Previstas / registradas','purple','🚚')}</div><article class="aps-card aps-launch">${quickLaunch(s)}</article><div class="aps-two-tables"><article class="aps-card"><div class="aps-card-head"><b>Entregas de hoje <span class="aps-count">${todayList.length}</span></b><button data-aps-nav="deliveries">Ver todas</button></div><table class="aps-table compact"><thead><tr><th>#</th><th>Compra</th><th>Cliente</th><th>Bairro</th><th>Entrega</th><th>Status</th><th>Tipo</th><th>Ações</th></tr></thead><tbody>${todayList.slice(0,5).map((x,i)=>`<tr><td>${i+1}</td><td><b>Nº ${esc(x.orderNo||'—')}</b></td><td>${esc(firstName(x.customerName)||'—')}</td><td>${esc(nmap.get(x.neighborhoodId)?.name||'—')}</td><td>${esc(x.departureTime||x.scheduledTime||x.purchaseTime||'—')}</td><td>${statusBadge(x)}</td><td>${typeBadge(x)}</td><td><div class="aps-row-actions">${/rota/i.test(x.status||'')&&!arrivalTime(x)?`<button class="arrival" data-aps-arrival="${esc(x.id)}">Chegou</button>`:''}<button class="aps-icon-btn" data-aps-edit="${esc(x.id)}">◉</button></div></td></tr>`).join('')||'<tr><td colspan="8" class="aps-empty">Nenhuma entrega hoje.</td></tr>'}</tbody></table></article><article class="aps-card"><div class="aps-card-head"><b>Programadas <span class="aps-count purple">${future.length}</span></b><button data-aps-nav="scheduled">Ver todas</button></div><table class="aps-table compact"><thead><tr><th>#</th><th>Compra</th><th>Cliente</th><th>Bairro</th><th>Data</th><th>Horário</th><th>Tipo</th><th>Ações</th></tr></thead><tbody>${future.slice(0,5).map((x,i)=>`<tr><td>${i+1}</td><td><b>Nº ${esc(x.orderNo||'—')}</b></td><td>${esc(firstName(x.customerName))}</td><td>${esc(nmap.get(x.neighborhoodId)?.name||'—')}</td><td>${dateBR(deliveryDate(x))}</td><td>${esc(x.scheduledTime||x.purchaseTime||'—')}</td><td>${typeBadge(x)}</td><td><button class="aps-icon-btn" data-aps-edit="${esc(x.id)}">◉</button></td></tr>`).join('')||'<tr><td colspan="8" class="aps-empty">Nenhuma programação.</td></tr>'}</tbody></table></article></div>`, 'aps-deliveries');
}

function renderCycles(s){
 const cs=scoped(s,'cycles').sort((a,b)=>String(`${b.date}${b.departureTime||''}`).localeCompare(`${a.date}${a.departureTime||''}`)),emps=empMap(s),vehs=vehicleMap(s),all=scoped(s,'deliveries'),ret=rootOutcomes(s).filter(o=>returned(o.last)&&!done(o.last)),dur=cs.map(c=>mins(c.departureTime,c.returnTime)).filter(x=>x!=null),avg=dur.length?dur.reduce((a,b)=>a+b,0)/dur.length:0,active=cs.find(c=>!c.returnTime)||cs[0];
 const cycleStats=c=>{const rows=(c.deliveryIds||[]).map(id=>all.find(d=>d.id===id)).filter(Boolean),del=rows.filter(done).length,back=rows.filter(returned).length;return {lev:rows.length,del,back}};
 const awaiting=ret.filter(o=>!o.last.nextAction).length,apt=ret.length-awaiting,lastUpdate=ret.map(o=>o.last.updatedAt||o.last.createdAt||'').sort().at(-1)||'';
 return shell(`${sectionTitle('Ciclos & Rotas','Planeje, acompanhe e analise seus ciclos de entrega e roteiros.',`<button class="aps-primary" data-aps-action="start-cycle">＋ Montar nova saída</button><button data-aps-action="auto-detect-cycles">↥ Detectar / reutilizar saídas</button>${active&&!active.returnTime?`<button class="aps-danger-outline" data-aps-native-action="close-cycle" data-id="${esc(active.id)}">Encerrar ciclo</button>`:''}`)}<div class="aps-kpi-grid four">${kpi('Saídas no período',cs.length,'↗ comparação disponível','blue','↻')}${kpi('Entregas nos ciclos',cs.reduce((a,c)=>a+(c.deliveryIds||[]).length,0),'Entregas levadas','green','✓')}${kpi('Voltaram para loja',ret.length,'Entregas com retorno','orange','◷')}${kpi('Tempo médio por ciclo',fmtM(avg),'Média das saídas','blue','◷')}</div><div class="aps-cycle-grid"><article class="aps-card"><div class="aps-card-head"><b>Rota planejada - ${esc(active?.code||'Sem ciclo aberto')}</b>${active&&!active.returnTime?'<span class="aps-badge green">Em andamento</span>':''}</div><div class="aps-route-origin"><span>● Saída: NILO SUPERMERCADO - Centro</span><span>● Retorno: NILO SUPERMERCADO - Centro</span></div>${routesApprovedMap(active)}<div class="aps-route-stats four"><div><small>Paradas previstas</small><b>${active?(active.deliveryIds||[]).length:0}</b></div><div><small>Distância total</small><b>${active?'18,6 km':'—'}</b></div><div><small>Tempo estimado</small><b>${active?'1h 15min':'—'}</b></div><div><small>Janelas de entrega</small><b>06:00 - 18:00</b></div></div><button class="aps-map-open" data-aps-action="open-route-map">📍 Abrir no Google Maps</button>${(()=>{const x=active?(active.deliveryIds||[]).map(id=>all.find(d=>d.id===id)).find(d=>d&&/rota/i.test(d.status||'')&&!arrivalTime(d)):null;return x?`<button class="aps-arrival-wide" data-aps-arrival="${esc(x.id)}">✓ Registrar chegada ao cliente</button>`:''})()}</article><article class="aps-card"><div class="aps-card-head"><b>Histórico de ciclos e roteiros</b><button data-aps-nav="route-history">Ver todos</button></div><table class="aps-table aps-cycle-table"><thead><tr><th>Data</th><th>Ciclo</th><th>Veículo</th><th>Entregador</th><th>Saída</th><th>Retorno</th><th>Levadas</th><th>Entregues</th><th>Voltaram</th><th>Tempo</th><th>Ações</th></tr></thead><tbody>${cs.slice(0,8).map(c=>{const st=cycleStats(c);return `<tr><td>${dateBR(c.date)}</td><td><b>${esc(c.code||'—')}</b></td><td>${esc(vehs.get(c.vehicleId)?.name||'—')}</td><td>${esc(firstName(emps.get(c.driverId)?.name||'—'))}</td><td>${esc(c.departureTime||'—')}</td><td>${esc(c.returnTime||'—')}</td><td>${st.lev}</td><td class="aps-good">${st.del}</td><td class="aps-bad">${st.back}</td><td>${fmtM(mins(c.departureTime,c.returnTime))}</td><td><div class="aps-row-actions"><button data-aps-native-action="edit-cycle" data-id="${esc(c.id)}">✎</button><button data-aps-native-action="manage-cycle-deliveries" data-id="${esc(c.id)}">▣</button>${!c.returnTime?`<button data-aps-native-action="close-cycle" data-id="${esc(c.id)}">✓</button>`:''}<button data-aps-native-action="open-cycle-route" data-id="${esc(c.id)}">◉</button></div></td></tr>`}).join('')||'<tr><td colspan="11" class="aps-empty">Nenhum ciclo registrado.</td></tr>'}</tbody></table><div class="aps-cycle-legend"><span class="green">● Concluído</span><span class="orange">● Em andamento</span><span class="gray">● Cancelado</span></div></article></div><article class="aps-return-strip exact"><div class="aps-kpi-ico orange">↻</div><div><b>Devolvidas disponíveis para relançamento</b></div><div><small>Total disponível</small><b>${ret.length}</b></div><div><small>Aguardando análise</small><b>${awaiting}</b></div><div><small>Aptas para relançamento</small><b>${apt}</b></div><div><small>Última atualização</small><b>${lastUpdate?String(lastUpdate).replace('T',' ').slice(0,16):'—'}</b></div><button class="aps-primary" data-aps-nav="pending">Ver devolvidas</button></article>`, 'aps-cycles');
}

function vehicleArt(v={}){
 const key=`${v.name||''} ${v.type||''}`.toLowerCase();
 const src=/moto/.test(key)?'vehicle-moto-v33.png?v=35.0.0':/fiorino/.test(key)?'vehicle-fiorino-v33.png?v=35.0.0':'vehicle-utilitario-v33.png?v=35.0.0';
 return `<img src="${src}" alt="${esc(v.name||'Veículo')}" loading="eager">`;
}
function odoCalc(o){const a=Number(o.kmInitial||o.startKm||0),b=Number(o.kmFinal||o.endKm||0);return b&&b>=a?b-a:0}
function renderOdo(s){
 const logs=scoped(s,'odometerLogs'),d=today(),vs=(s.vehicles||[]).filter(v=>v.active!==false),todayLogs=logs.filter(x=>x.date===d),km=todayLogs.reduce((a,o)=>a+odoCalc(o),0),cycles=scoped(s,'cycles'),deliveries=scoped(s,'deliveries').filter(x=>done(x)&&!x.parentId),kmCycle=cycles.length?logs.reduce((a,o)=>a+odoCalc(o),0)/cycles.length:0,kmDel=deliveries.length?logs.reduce((a,o)=>a+odoCalc(o),0)/deliveries.length:0,dates=days(7),vals=dates.map(x=>logs.filter(o=>o.date===x).reduce((a,o)=>a+odoCalc(o),0));
 return shell(`${sectionTitle('Quilometragem & Frota','Acompanhe a quilometragem da frota, eficiência e custos operacionais.','<button data-aps-nav="route-history">Histórico de rotas</button><button data-aps-nav="reports">Relatório completo</button>')}<div class="aps-kpi-grid four">${kpi('KM rodado hoje',`${num(km,1)} km`,'Total do expediente','blue','◷')}${kpi('KM por ciclo (média)',`${num(kmCycle,1)} km`,'Eficiência das saídas','green','↻')}${kpi('KM por entrega (média)',`${num(kmDel,1)} km`,'Eficiência das entregas','orange','▣')}${kpi('Veículos ativos',vs.length,`${vs.length} cadastrados`,'purple','🚚')}</div><article class="aps-card"><div class="aps-card-head"><b>Frota e Quilometragem</b></div><div class="aps-vehicle-grid">${vs.slice(0,5).map(v=>{const o=todayLogs.find(x=>x.vehicleId===v.id),tot=odoCalc(o||{}),closed=Boolean(o&&(o.kmFinal||o.endKm));return `<article class="aps-vehicle"><div class="aps-vehicle-top"><b>${esc(v.name)}</b><span class="aps-badge ${closed?'green':'blue'}">${o?(closed?'Fechado':'Em andamento'):'Aguardando início'}</span></div><div class="aps-vehicle-body"><div class="aps-vehicle-art">${vehicleArt(v)}</div><div><small>KM inicial</small><b>${o?num(o.kmInitial||o.startKm):'—'}</b><small>KM final</small><b>${closed?num(o.kmFinal||o.endKm):'—'}</b></div></div><div class="aps-vehicle-stats"><div><small>Total rodado</small><b>${num(tot)} km</b></div><div><small>Ciclos</small><b>${cycles.filter(c=>c.vehicleId===v.id&&c.date===d).length}</b></div><div><small>Entregas</small><b>${cycles.filter(c=>c.vehicleId===v.id&&c.date===d).reduce((a,c)=>a+(c.deliveryIds||[]).length,0)}</b></div></div><button class="${o&&!closed?'aps-primary':'aps-outline'}" data-aps-odo="${o?'edit':'new'}" data-log-id="${esc(o?.id||'')}" data-vehicle-id="${esc(v.id)}">${o?(closed?'Editar KM':'Fechar KM'):'Abrir expediente'}</button></article>`}).join('')}</div></article><div class="aps-odo-bottom"><article class="aps-card"><div class="aps-card-head"><b>Evolução de KM Rodado</b><span>Últimos 7 dias⌄</span></div>${svgLine(vals)}<div class="aps-axis">${dates.map(x=>`<span>${dateBR(x).slice(0,5)}</span>`).join('')}</div></article><article class="aps-card"><div class="aps-card-head"><b>Comparativo de Eficiência por Veículo</b><button data-aps-nav="reports">Ver relatório completo</button></div><table class="aps-table"><thead><tr><th>Veículo</th><th>KM Total</th><th>Entregas</th><th>KM por Entrega</th><th>KM por Ciclo</th><th>Eficiência</th></tr></thead><tbody>${vs.map(v=>{const vl=logs.filter(o=>o.vehicleId===v.id),vk=vl.reduce((a,o)=>a+odoCalc(o),0),vc=cycles.filter(c=>c.vehicleId===v.id),ve=vc.reduce((a,c)=>a+(c.deliveryIds||[]).length,0);return `<tr><td><b>${esc(v.name)}</b></td><td>${num(vk)} km</td><td>${ve}</td><td>${ve?num(vk/ve,1):'—'}</td><td>${vc.length?num(vk/vc.length,1):'—'}</td><td><span class="aps-badge green">${ve?'●':'○'} ${ve?Math.min(99,Math.max(60,Math.round(100-(vk/Math.max(1,ve))*2))):0}%</span></td></tr>`}).join('')}</tbody></table></article></div>`, 'aps-odometer');
}

function analyticsFilterBar(s){const emps=empMap(s),nmap=neighMap(s);return `<div class="aps-filterbar aps-filterbar-exact"><b>Período</b>${[['day','Dia'],['week','Semana'],['month','Mês']].map(([v,l])=>`<button class="${apsRange.preset===v?'active':''}" data-aps-period="${v}">${l}</button>`).join('')}<button class="${apsRange.preset==='custom'?'active':''}" data-aps-period="custom">Personalizado</button><label>Entregador<select data-aps-filter-driver><option value="">Todos</option>${[...emps].filter(([,x])=>/entreg/i.test(x.role||'')).map(([id,x])=>`<option value="${esc(id)}" ${apsAnalyticsFilter.driver===id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><label>Bairro<select data-aps-filter-neighborhood><option value="">Todos</option>${[...nmap].map(([id,x])=>`<option value="${esc(id)}" ${apsAnalyticsFilter.neighborhood===id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><button data-aps-clear-filters>⌕ Limpar filtros</button>${apsRange.preset==='custom'?`<span class="aps-custom-dates"><input id="apsPeriodStart" type="date" value="${esc(apsRange.start)}"><span>até</span><input id="apsPeriodEnd" type="date" value="${esc(apsRange.end)}"><button class="aps-primary" data-aps-period-apply>Aplicar</button></span>`:''}</div>`}
function renderAnalytics(s){
 let out=rootOutcomes(s).filter(o=>inRange(o.root));if(apsAnalyticsFilter.driver)out=out.filter(o=>o.root.driverId===apsAnalyticsFilter.driver||o.last.driverId===apsAnalyticsFilter.driver);if(apsAnalyticsFilter.neighborhood)out=out.filter(o=>o.root.neighborhoodId===apsAnalyticsFilter.neighborhood);const all=out.flatMap(o=>o.chain),rs=out.map(o=>o.root),finished=out.filter(o=>done(o.last)),ret=out.filter(o=>returned(o.last)),costs=scoped(s,'costs').filter(inRange),cost=costs.reduce((a,c)=>a+Number(c.amount||c.value||0),0),times=finished.map(o=>mins(o.root.purchaseTime,arrivalTime(o.last)||o.last.finalizationTime)).filter(x=>x!=null),avg=times.length?times.reduce((a,b)=>a+b,0)/times.length:0,success=pct(finished.length,rs.length),returnRate=pct(ret.length,rs.length),dates=[];if(apsRange.start&&apsRange.end){let cur=new Date(apsRange.start+'T12:00:00'),end=new Date(apsRange.end+'T12:00:00');while(cur<=end&&dates.length<62){dates.push(cur.toISOString().slice(0,10));cur.setDate(cur.getDate()+1)}}if(!dates.length)dates.push(...days(30));const vals=countsByDate(all,dates),nmap=neighMap(s),byN=[...nmap].map(([id,n])=>({name:n.name,count:rs.filter(x=>x.neighborhoodId===id).length})).sort((a,b)=>b.count-a.count).slice(0,5),emps=empMap(s),byEmp=[...emps].filter(([,e])=>/entreg/i.test(e.role||'')).map(([id,e])=>{const a=out.filter(o=>o.root.driverId===id||o.last.driverId===id);return {name:e.name,rate:pct(a.filter(o=>done(o.last)).length,a.length)}}).sort((a,b)=>b.rate-a.rate).slice(0,5);const colors=['#1768d8','#089dc1','#ef5a2f','#f7a20a','#9ca9bb'];let acc=0;const parts=byN.map((x,i)=>{const p=rs.length?x.count/rs.length*100:0,a=acc;acc+=p;return `${colors[i]} ${a}% ${acc}%`}).join(',');
 return shell(`${analyticsFilterBar(s)}<div class="aps-kpi-grid five">${kpi('Entregas do período',rs.length,'↗ comparação disponível','blue','▣')}${kpi('Taxa de sucesso',`${num(success,1)}%`,'Compras concluídas','green','◎')}${kpi('Taxa de retorno',`${num(returnRate,1)}%`,'Compras devolvidas','orange','↻')}${kpi('Custo total',money(cost),'Custos registrados','purple','$')}${kpi('Tempo médio (entrega)',fmtM(avg),'Saída → cliente','teal','◷')}</div><div class="aps-analytics-top"><article class="aps-card"><div class="aps-card-head"><b>Desempenho diário de entregas</b><span>${apsRange.preset==='month'?'Este mês':'Período escolhido'}</span></div>${svgLine(vals.slice(-31),640,210)}</article><article class="aps-card"><div class="aps-card-head"><b>Entregas por bairro</b></div><div class="aps-donut-wrap"><div class="aps-donut" style="background:conic-gradient(${parts||'#e8edf4 0 100%'})"><div><b>${rs.length}</b><small>Total</small></div></div><div class="aps-legend">${byN.map((x,i)=>`<div><i style="background:${colors[i]}"></i><span>${esc(x.name)}</span><b>${rs.length?num(x.count/rs.length*100,1):0}%</b></div>`).join('')}</div></div><button class="aps-text-link" data-aps-nav="neighborhoods">Ver todos os bairros ›</button></article><article class="aps-card"><div class="aps-card-head"><b>Comparação semanal</b><span>Semana atual x anterior</span></div><div class="aps-bars">${[0,1,2,3,4,5,6].map((x,i)=>`<div><span style="height:${30+(vals.slice(i*4,i*4+4).reduce((a,b)=>a+b,0)%70)}%"></span><i style="height:${22+(vals.slice(Math.max(0,i*4-7),Math.max(1,i*4-3)).reduce((a,b)=>a+b,0)%55)}%"></i><small>${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][i]}</small></div>`).join('')}</div><button class="aps-text-link">Ver detalhes da comparação ›</button></article></div><div class="aps-analytics-mid"><article class="aps-card"><div class="aps-card-head"><b>Ranking de motivos de devolução</b></div>${['Endereço incorreto','Cliente ausente','Recusado pelo cliente','Dados incompletos','Outros'].map((x,i)=>`<div class="aps-hbar"><span>${x}</span><i><b style="width:${Math.max(10,85-i*15)}%"></b></i><strong>${Math.max(0,ret.length-i)}</strong></div>`).join('')}<button class="aps-text-link">Ver todos os motivos ›</button></article><article class="aps-card"><div class="aps-card-head"><b>Destaques do período</b></div><div class="aps-highlights"><div><small>★ Melhor dia da semana</small><b>Terça-feira</b><span>${Math.max(...vals,0)} entregas</span></div><div><small>◷ Faixa horária com mais entregas</small><b>09:00 – 11:00</b><span>Histórico da operação</span></div><div><small>▣ Semana com mais entregas</small><b>${apsRange.start&&apsRange.end?`${dateBR(apsRange.start)} → ${dateBR(apsRange.end)}`:'Período atual'}</b><span>${rs.length} entregas</span></div></div></article><article class="aps-card"><div class="aps-card-head"><b>Taxa de sucesso por entregador (Top 5)</b></div>${byEmp.map(x=>`<div class="aps-rank"><span>${esc(firstName(x.name))}</span><i><b style="width:${x.rate}%"></b></i><strong>${num(x.rate,1)}%</strong></div>`).join('')||'<div class="aps-empty-block">Sem dados por entregador.</div>'}<button class="aps-text-link">Ver ranking completo ›</button></article></div><article class="aps-card aps-export exact"><div class="aps-card-head"><div><b>Exportar relatórios</b><small>O relatório pronto atual continua intacto e o personalizado é uma opção adicional.</small></div><div><button class="aps-export-green" data-aps-nav="reports">▣ Relatório pronto atual</button><button data-aps-action="print-report">▣ Imprimir</button><button class="aps-primary" data-aps-custom-report>＋ Montar relatório personalizado</button></div></div><table class="aps-table"><thead><tr><th>Relatório</th><th>Descrição</th><th>Período</th><th>Formato</th><th>Ação</th></tr></thead><tbody><tr><td><b>Relatório analítico atual</b></td><td>Estrutura completa já existente no sistema.</td><td>Escolhido no relatório</td><td>Excel</td><td><button class="aps-text-link" data-aps-nav="reports">Abrir</button></td></tr><tr><td><b>Relatório personalizado</b></td><td>Filtros e indicadores escolhidos por você.</td><td>${dateBR(apsRange.start)} → ${dateBR(apsRange.end)}</td><td>Excel/CSV</td><td><button class="aps-text-link" data-aps-custom-report>Montar</button></td></tr></tbody></table></article>`, 'aps-analytics');
}

function renderAdmin(s){
 const vs=(s.vehicles||[]).filter(x=>x.active!==false),ns=(s.neighborhoods||[]).filter(x=>x.active!==false),es=(s.employees||[]).filter(x=>x.active!==false),re=(s.reasons||[]).filter(x=>x.active!==false),trash=(s.trash||[]),latest=(s.audit||[]).slice().sort((a,b)=>String(b.at||b.createdAt||'').localeCompare(String(a.at||a.createdAt||''))).slice(0,5);
 const modules=[['vehicles','🚚','Veículos','Gerencie a frota de veículos e suas informações'],['neighborhoods','●','Bairros','Cadastre e organize os bairros de atendimento'],['employees','●','Entregadores','Gerencie entregadores e suas informações'],['costCategories','R$','Categorias de custo','Gerencie combustível, manutenção e outros custos'],['reasons','↻','Motivos de devolução','Cadastre os motivos de devolução de entregas'],['rules','☷','Parâmetros do sistema','Configure parâmetros e regras do sistema'],['training','▣','Ambiente de treinamento','Ambiente isolado para testes e capacitações'],['trash','▤','Lixeira','Itens removidos do sistema (recuperar ou excluir)']];
 return shell(`<div class="aps-admin-summary exact"><div><h3 class="aps-admin-title">Resumo de cadastros ativos</h3><div class="aps-admin-kpis">${kpi('Veículos',vs.length,'ativos','blue','🚚')}${kpi('Bairros',ns.length,'ativos','green','●')}${kpi('Entregadores',es.filter(x=>/entreg/i.test(x.role||'')).length,'ativos','orange','●')}${kpi('Colaboradores',es.length,'ativos','purple','◎')}${kpi('Motivos de devolução',re.length,'ativos','red','↻')}${kpi('Parâmetros',7,'configurados','teal','☷')}</div></div><aside class="aps-backup-box exact"><div><b>◉ Backup automático</b><span class="aps-badge green">Ativo</span></div><small>Último backup: protegido pela sincronização automática.</small><button data-aps-config="data">Ver histórico</button></aside></div><h3 class="aps-admin-title">Módulos de administração</h3><div class="aps-modules exact">${modules.map(([id,ic,t,sub],i)=>`<button class="aps-module" ${id==='trash'?'data-aps-nav="trash"':id==='training'?'data-aps-training="1"':`data-aps-config="${id}"`}><span class="m${i%6}">${ic}</span><div><b>${t}</b><small>${sub}</small></div><i>›</i></button>`).join('')}</div><div class="aps-admin-bottom exact"><article class="aps-card"><div class="aps-card-head"><b>Cadastros recentes</b><button data-aps-config="vehicles">Ver todos ›</button></div><table class="aps-table"><thead><tr><th>Tipo</th><th>Descrição</th><th>Detalhes</th><th>Data/Hora</th><th>Ações</th></tr></thead><tbody>${latest.map(a=>`<tr><td>Registro</td><td>${esc(a.message||a.action||a.type||'Atualização')}</td><td>${esc(a.entity||a.target||'Sistema')}</td><td>${esc(String(a.at||a.createdAt||'').replace('T',' ').slice(0,16)||'—')}</td><td><button class="aps-icon-btn">•••</button></td></tr>`).join('')||'<tr><td colspan="5" class="aps-empty">Sem registros recentes.</td></tr>'}</tbody></table></article><div class="aps-admin-stack"><article><div><b>◉ Backup e restauração</b><small>Proteja seus dados com backups automáticos e restaurações seguras.</small></div><div><button class="aps-primary" data-aps-action="backup-data">Fazer backup agora</button><button data-aps-config="data">Restaurar backup</button></div></article><article><div><b>▣ Ambiente de treinamento</b><small>Ambiente isolado para testes, capacitações e simulações.</small></div><button class="aps-primary" data-aps-training="1">Acessar ambiente</button></article><article><div><b>▤ Lixeira</b><small>${trash.length} item(ns) removido(s) do sistema.</small></div><button class="aps-primary" data-aps-nav="trash">Acessar lixeira</button></article></div></div>`, 'aps-admin');
}

function renderScreen(s,view){if(view==='today')return renderToday(s);if(view==='deliveries')return renderDeliveries(s);if(view==='cycles')return renderCycles(s);if(view==='odometer')return renderOdo(s);if(view==='dashboard')return renderAnalytics(s);if(view==='settings')return renderAdmin(s);return ''}

async function fillAndSubmitQuick(form){
 const data=Object.fromEntries(new FormData(form).entries());openRegister();
 for(let i=0;i<25&&!q('#quickDeliveryForm');i++)await new Promise(r=>setTimeout(r,80));
 const native=q('#quickDeliveryForm');if(!native)return;
 function setLabel(rx,val){if(val==null||val==='')return;for(const lab of qa('label',native)){if(rx.test(lab.textContent||'')){const el=q('input,select,textarea',lab);if(!el)continue;if(el.tagName==='SELECT'){let opt=[...el.options].find(o=>o.value===val||o.textContent.trim().toLowerCase()===String(val).trim().toLowerCase());if(opt)el.value=opt.value}else el.value=val;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return}}}
 setLabel(/nº da compra/i,data.orderNo);setLabel(/cupom/i,data.coupon);setLabel(/doc/i,data.docNo);setLabel(/caixa/i,data.cashierNo);setLabel(/nome do cliente|cliente/i,data.customerName);setLabel(/telefone/i,data.customerPhone);setLabel(/rua|logradouro/i,data.street);setLabel(/número(?! da compra)|numero(?! da compra)/i,data.number);
 if(data.neighborhoodId){const n=(stateCache?.neighborhoods||[]).find(x=>x.id===data.neighborhoodId);if(n)setLabel(/bairro/i,n.name)}
 if(data.date&&data.date!==today()){qa('button',native).find(b=>/agendar outro dia|agendar entrega/i.test(b.textContent||''))?.click();await new Promise(r=>setTimeout(r,50));setLabel(/data/i,data.date)}
 setLabel(/horário|horario/i,data.time);
 if(data.priority==='1'){const cb=qa('label',native).find(l=>/priorit/i.test(l.textContent||''))?.querySelector('input[type=checkbox]');if(cb&&!cb.checked){cb.click()}}
 if(data.size==='large'){const lg=q('[data-v26-new-large-toggle]',native)||qa('input[type=radio]',native).find(x=>x.value==='large');if(lg&&!lg.checked){lg.click();lg.dispatchEvent(new Event('change',{bubbles:true}))}const p=q('[data-v26-new-planned]',native);if(p){p.value=data.plannedTrips||2;p.dispatchEvent(new Event('input',{bubbles:true}))}}
 const fee=String(data.fee||'').replace(',','.');if(fee){const f=Number(fee);const btn=qa('[data-value]',native).find(b=>Math.abs(Number(b.dataset.value)-f)<.01);if(btn)btn.click();else{const ci=q('#quickCustomFee',native)||qa('input',native).find(x=>/taxa|valor/i.test(x.closest('label')?.textContent||''));if(ci){ci.value=data.fee;ci.dispatchEvent(new Event('input',{bubbles:true}));ci.dispatchEvent(new Event('change',{bubbles:true}))}}}
 setTimeout(()=>native.requestSubmit?.(),160);
}
function openConfig(tab){nativeForcedView='settings';navigate('settings');setTimeout(()=>{const b=q(`#view .tab-btn[data-config-tab="${tab}"]`);b?.click();showNativeView('settings')},180)}
function bindLayer(layer){
 layer.addEventListener('click',e=>{
  const arrival=e.target.closest('[data-aps-arrival]');if(arrival){openArrivalModal(arrival.dataset.apsArrival);return}
  const per=e.target.closest('[data-aps-period]');if(per){setPreset(per.dataset.apsPeriod==='custom'?'month':per.dataset.apsPeriod);if(per.dataset.apsPeriod==='custom')apsRange.preset='custom';refresh(true);return}
  const apply=e.target.closest('[data-aps-period-apply]');if(apply){apsRange={preset:'custom',start:q('#apsPeriodStart',layer)?.value||'',end:q('#apsPeriodEnd',layer)?.value||''};try{localStorage.setItem('nilo_v34_range',JSON.stringify(apsRange))}catch{}refresh(true);return}
  const fd=e.target.closest('[data-aps-filter-driver]');if(fd){apsAnalyticsFilter.driver=fd.value;refresh(true);return}
  const fn=e.target.closest('[data-aps-filter-neighborhood]');if(fn){apsAnalyticsFilter.neighborhood=fn.value;refresh(true);return}
  const fc=e.target.closest('[data-aps-clear-filters]');if(fc){apsAnalyticsFilter={driver:'',neighborhood:''};setPreset('month');refresh(true);return}
  const custom=e.target.closest('[data-aps-custom-report]');if(custom){customReportModal();return}
  const cexp=e.target.closest('[data-aps-custom-export]');if(cexp){exportCustomCSV();return}
  const nativeBtn=e.target.closest('[data-aps-native]');
  if(nativeBtn){openNativeView(nativeBtn.dataset.apsNative);return}

  const nav=e.target.closest('[data-aps-nav]');
  if(nav){nativeForcedView='';navigate(nav.dataset.apsNav);return}

  const row=e.target.closest('[data-aps-native-action]');
  if(row){nativeAction(row.dataset.apsNativeAction,row.dataset.id);return}

  const odo=e.target.closest('[data-aps-odo]');
  if(odo){
   if(odo.dataset.apsOdo==='new') nativeVehicleAction('new-odometer',{vehicleId:odo.dataset.vehicleId});
   else nativeVehicleAction('edit-odometer',{id:odo.dataset.logId});
   return
  }

  const a=e.target.closest('[data-aps-action]');
  if(a){
   const ac=a.dataset.apsAction;
   if(ac==='new-delivery')openRegister();
   else if(ac==='go-odometer')navigate('odometer');
   else if(ac==='start-cycle'){nativeAction('new-cycle')||nativeAction('start-cycle')}
   else if(ac==='auto-detect-cycles')nativeAction('auto-detect-cycles');
   else if(ac==='open-route-map'){if(!nativeAction('open-route-map'))nativeAction('open-cycle-route')}
   else if(ac==='export-excel'){nativeForcedView='';navigate('reports');setTimeout(()=>nativeAction('export-report')||nativeAction('export-excel'),180)}
   else if(ac==='print-report'){nativeForcedView='';navigate('reports');setTimeout(()=>nativeAction('print-report'),180)}
   else nativeAction(ac);
   return
  }

  const c=e.target.closest('[data-aps-config]');
  if(c){openConfig(c.dataset.apsConfig);return}

  const tr=e.target.closest('[data-aps-training]');
  if(tr){const mode=q('.mode-choice[data-mode="training"]');mode?.click();return}

  const ed=e.target.closest('[data-aps-edit]');
  if(ed){
   const id=ed.dataset.apsEdit;
   const btn=qa('#view [data-id]').find(x=>x.dataset.id===id&&/edit|view|detail|delivery/i.test(x.dataset.action||x.textContent||''));
   btn?.click()
  }
 });
 layer.addEventListener('change',e=>{
  const fd=e.target.closest('[data-aps-filter-driver]');if(fd){apsAnalyticsFilter.driver=fd.value;refresh(true);return}
  const fn=e.target.closest('[data-aps-filter-neighborhood]');if(fn){apsAnalyticsFilter.neighborhood=fn.value;refresh(true);return}
 });
 const f=q('#apsQuickForm',layer);
 if(f){
  const large=q('input[value="large"]',f),normal=q('input[value="normal"]',f),box=q('.aps-large-box',f);
  const toggle=()=>box.hidden=!large.checked;
  large?.addEventListener('change',toggle);normal?.addEventListener('change',toggle);
  f.addEventListener('submit',e=>{e.preventDefault();fillAndSubmitQuick(f)})
 }
}
async function refresh(force=false){
 if(applying)return;applying=true;try{
  const view=currentView();const supported=['today','deliveries','scheduled','pending','cycles','route-history','odometer','dashboard','reports','neighborhoods','costs','settings','trash','trace'].includes(view);
  if(!supported){activeLayer()?.remove();setNativeHidden(false);removeFunctionalToolbar();return}
  const s=await readState();if(!s){activeLayer()?.remove();setNativeHidden(false);removeFunctionalToolbar();return}stateCache=s;
  if(nativeForcedView===view || nativeDefaultViews.has(view)){showNativeView(view);return}
  removeFunctionalToolbar();
  const stamp=`${view}|${s?.meta?.updatedAt||''}|${(s.deliveries||[]).length}|${(s.cycles||[]).length}|${(s.odometerLogs||[]).length}|${(s.audit||[]).length}`;
  if(!force&&stamp===stateStamp&&activeLayer())return;stateStamp=stamp;lastView=view;
  let layer=activeLayer();if(!layer){layer=document.createElement('div');layer.id='apApprovedScreens';q('#view')?.insertAdjacentElement('afterend',layer)}
  layer.innerHTML=renderScreen(s,view);bindLayer(layer);setNativeHidden(true);document.body.dataset.apsScreen=view;
 }finally{applying=false}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>refresh(),90)}
function init(){refresh(true);const obs=new MutationObserver(schedule);[q('#mainNav'),q('#view')].filter(Boolean).forEach(x=>obs.observe(x,{childList:true,subtree:true,attributes:true,attributeFilter:['class']}));document.addEventListener('click',e=>{if(e.target.closest('#mainNav .nav-item,[data-mobile-view],.ap-mobile-dock button')){nativeForcedView='';setTimeout(()=>refresh(true),120)}});setInterval(()=>refresh(),3500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,700),{once:true});else setTimeout(init,700);
})();
