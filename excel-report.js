import { Deliveries, Vehicles, Drivers, Collaborators, Neighborhoods, CostCategories, Cycles, OdometerLogs, Costs, DayClosures } from './db.js?v=3.0';
import { STATUS_META } from './helpers.js?v=3.0';

const DEFAULT_TARGETS = { startMinutes:120, arrivalMinutes:210, warningMinutes:30, successTarget:90 };
const DAY_NAMES = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];

function targets(){
  try { return { ...DEFAULT_TARGETS, ...JSON.parse(localStorage.getItem('orbita_operational_targets') || '{}') }; }
  catch { return { ...DEFAULT_TARGETS }; }
}
function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function dayKey(v){
  if(!v) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const d=new Date(v); if(Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function monthKey(v){ const k=dayKey(v); return k ? `${k.slice(5,7)}/${k.slice(0,4)}` : ''; }
function timeText(v){ if(!v)return''; const d=new Date(v); return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
function dateText(v){ const k=dayKey(v); if(!k)return''; const [y,m,d]=k.split('-'); return `${d}/${m}/${y}`; }
function dateTimeText(v){ if(!v)return''; const d=new Date(v); return Number.isNaN(d.getTime())?'':`${dateText(v)} ${timeText(v)}`; }
function diffMin(a,b){ if(!a||!b)return null; const x=new Date(a).getTime(), y=new Date(b).getTime(); return Number.isFinite(x)&&Number.isFinite(y)?Math.max(0,(y-x)/60000):null; }
function mean(values){ const v=values.filter((x)=>Number.isFinite(x)); return v.length?v.reduce((s,x)=>s+x,0)/v.length:0; }
function mode(values){ const counts={}; let best='',max=0; values.filter(Boolean).forEach((v)=>{counts[v]=(counts[v]||0)+1;if(counts[v]>max){best=v;max=counts[v];}});return best; }
function unique(values){ return [...new Set(values.filter((v)=>v!==null&&v!==undefined&&String(v)!==''))]; }
function groupBy(rows,keyFn){ const out=new Map(); rows.forEach((r)=>{const k=keyFn(r);if(!out.has(k))out.set(k,[]);out.get(k).push(r);}); return out; }
function statusLabel(r){ return STATUS_META[r.status]?.label || r.status || ''; }
function hasProblem(r){ return ['retorno','reentrega','cancelada'].includes(r.status) || (r.returnAttempts||[]).length>0; }
function isFinal(r){ return r.status==='finalizada'; }
function isRevenue(r){ return r.status==='finalizada' || (r.status==='retirada_loja' && !r.refunded); }
function startLate(r){ if(!r.entryTime)return false; const end=r.leftStoreAt?new Date(r.leftStoreAt).getTime():Date.now(); return end-new Date(r.entryTime).getTime()>targets().startMinutes*60000; }
function arrivalLate(r){ if(!r.entryTime)return false; const end=r.clientArrivalAt?new Date(r.clientArrivalAt).getTime():(r.deliveredAt?new Date(r.deliveredAt).getTime():Date.now()); return end-new Date(r.entryTime).getTime()>targets().arrivalMinutes*60000; }
function inPeriod(v,period){ const k=dayKey(v); if(!k)return false; return (!period?.start||k>=period.start)&&(!period?.end||k<=period.end); }
function percent(n,d){ return d?n/d:0; }
function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }
function qualityScore(rows){ if(!rows.length)return 100; const success=percent(rows.filter(isFinal).length,rows.length)*55; const punctual=(1-percent(rows.filter((r)=>startLate(r)||arrivalLate(r)).length,rows.length))*30; const problems=(1-percent(rows.filter(hasProblem).length,rows.length))*15; return clamp(success+punctual+problems,0,100); }
function currentSituation(r){
  if(r.status==='finalizada')return'Entregue';
  if(r.status==='retirada_loja')return'Retirada na loja';
  if(r.status==='cancelada')return'Cancelada';
  if(r.status==='reentrega')return'Reagendada/Reentrega';
  if(r.status==='retorno')return'Devolvida/Retorno';
  if(r.status==='programada')return'Programada';
  if(['em_rota','no_cliente'].includes(r.status))return'Em rota';
  return'Na loja';
}
function revenueGross(rows){ return rows.filter(isRevenue).reduce((s,r)=>s+num(r.deliveryFee),0); }
function refunds(rows){ return rows.filter((r)=>r.refunded).reduce((s,r)=>s+num(r.deliveryFee),0); }
function netRevenue(rows){ return revenueGross(rows)-refunds(rows); }
function routeMinutes(r){ return diffMin(r.leftStoreAt,r.deliveredAt||r.clientArrivalAt); }
function waitMinutes(r){ return diffMin(r.entryTime,r.leftStoreAt); }
function clientMinutes(r){ return diffMin(r.entryTime,r.deliveredAt||r.clientArrivalAt); }
function rootId(r){ return r.rootDeliveryId || r.rootId || r.id || ''; }
function previousId(r){ return r.previousDeliveryId || r.previousId || ''; }
function attempt(r){ return r.attemptNumber || r.attempt || 1; }
function nextAction(r){
  if(r.status==='reentrega') return r.nextAttemptAt?`Nova tentativa ${dateTimeText(r.nextAttemptAt)}`:'Nova tentativa pendente';
  if(r.status==='programada') return r.scheduledAt?`Entregar ${dateTimeText(r.scheduledAt)}`:'Aguardar programação';
  if(r.status==='retorno') return 'Tratar retorno';
  if(r.status==='na_loja') return 'Formar ciclo';
  if(r.status==='em_rota') return 'Acompanhar rota';
  if(r.status==='no_cliente') return 'Finalizar atendimento';
  return '';
}

function xmlEscape(v){ return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function safeSheetName(name){ return String(name).replace(/[\\/?*\[\]:]/g,' ').slice(0,31); }
function styleFor(header,value){
  const h=String(header||'').toLowerCase();
  if(typeof value==='number'){
    if(h.includes('%')||h.includes('percentual')||h.includes('taxa de')||h.includes('sucesso')) return 'Percent';
    if(h.includes('fatur')||h.includes('reembolso')||h.includes('receita')||h.includes('custo')||h.includes('saldo')||h.includes('valor')||h.includes('taxa registrada')||h.includes('taxa cobrada')||h.includes('taxas vinculadas')) return 'Currency';
    if(h.includes('km')) return 'Km';
    if(h.includes('min')||h.includes('tempo')) return 'Minutes';
    return Number.isInteger(value)?'Integer':'Number';
  }
  return 'Default';
}
function cellXml(value,style='Default'){
  if(value===null||value===undefined||value==='') return `<Cell ss:StyleID="${style}"><Data ss:Type="String"></Data></Cell>`;
  if(typeof value==='number'&&Number.isFinite(value)) return `<Cell ss:StyleID="${style}"><Data ss:Type="Number">${value}</Data></Cell>`;
  return `<Cell ss:StyleID="${style}"><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}
function colWidth(header, rows, i){
  let max=String(header??'').length;
  for(let r=0;r<Math.min(rows.length,80);r++) max=Math.max(max,String(rows[r]?.[i]??'').length);
  return Math.max(58,Math.min(260,28+max*6.1));
}
function sheetXml({name,header,rows}){
  const cols=header.map((h,i)=>`<Column ss:AutoFitWidth="0" ss:Width="${colWidth(h,rows,i).toFixed(0)}"/>`).join('');
  const headerXml=`<Row ss:AutoFitHeight="0" ss:Height="30">${header.map((h)=>cellXml(h,'Header')).join('')}</Row>`;
  const body=rows.map((row)=>`<Row>${header.map((h,i)=>cellXml(row[i],styleFor(h,row[i]))).join('')}</Row>`).join('');
  return `<Worksheet ss:Name="${xmlEscape(safeSheetName(name))}"><Table>${cols}${headerXml}${body}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions><AutoFilter x:Range="R1C1:R${Math.max(1,rows.length+1)}C${header.length}" xmlns="urn:schemas-microsoft-com:office:excel"/></Worksheet>`;
}
function workbookXml(sheets){
  return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40"><DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Author>Órbita · Triela Soluções</Author><Company>Nilo</Company><Version>16.00</Version></DocumentProperties><ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel"><WindowHeight>12000</WindowHeight><WindowWidth>24000</WindowWidth><ProtectStructure>False</ProtectStructure><ProtectWindows>False</ProtectWindows></ExcelWorkbook><Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10"/><Borders/></Style><Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#173B5B" ss:Pattern="Solid"/><Borders/></Style><Style ss:ID="Integer"><NumberFormat ss:Format="0"/></Style><Style ss:ID="Number"><NumberFormat ss:Format="0.00"/></Style><Style ss:ID="Currency"><NumberFormat ss:Format='&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00'/></Style><Style ss:ID="Percent"><NumberFormat ss:Format="0.0%"/></Style><Style ss:ID="Minutes"><NumberFormat ss:Format='0.0 &quot;min&quot;'/></Style><Style ss:ID="Km"><NumberFormat ss:Format='0.00 &quot;km&quot;'/></Style></Styles>${sheets.map(sheetXml).join('')}</Workbook>`;
}
function downloadWorkbook(filename,sheets){
  const blob=new Blob(['\ufeff',workbookXml(sheets)],{type:'application/vnd.ms-excel;charset=utf-8;'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function dailyMetrics(dayRows, dayCosts, dayCycles, dayKm){
  const startEval=dayRows.filter((r)=>r.leftStoreAt); const arrEval=dayRows.filter((r)=>r.clientArrivalAt||r.deliveredAt);
  const delivered=dayRows.filter(isFinal); const scheduled=dayRows.filter((r)=>r.type==='agendada'||r.scheduledAt);
  const completeId=dayRows.filter((r)=>r.clientName&&r.phone).length;
  return {
    purchases:dayRows.length, records:dayRows.length, delivered:delivered.length,
    store:dayRows.filter((r)=>r.status==='na_loja').length, route:dayRows.filter((r)=>['em_rota','no_cliente'].includes(r.status)).length,
    scheduledOpen:dayRows.filter((r)=>r.status==='programada').length,
    rescheduledOpen:dayRows.filter((r)=>r.status==='reentrega').length,
    deliveredAfterSchedule:delivered.filter((r)=>scheduled.includes(r)).length,
    returned:dayRows.filter((r)=>['retorno','reentrega'].includes(r.status)||(r.returnAttempts||[]).length).length,
    withdrawn:dayRows.filter((r)=>r.status==='retirada_loja').length, cancelled:dayRows.filter((r)=>r.status==='cancelada').length,
    startLate:dayRows.filter(startLate).length, arrivalLate:dayRows.filter(arrivalLate).length,
    firstAttempt:percent(delivered.filter((r)=>(r.returnAttempts||[]).length===0).length,dayRows.length),
    startLateRate:percent(dayRows.filter(startLate).length,startEval.length||dayRows.length), arrivalLateRate:percent(dayRows.filter(arrivalLate).length,arrEval.length||dayRows.length),
    gross:revenueGross(dayRows), refund:refunds(dayRows), net:netRevenue(dayRows), costs:dayCosts.reduce((s,c)=>s+num(c.amount),0),
    balance:netRevenue(dayRows)-dayCosts.reduce((s,c)=>s+num(c.amount),0), cycles:dayCycles.length,
    km:dayKm.filter((l)=>l.kmEnd!=null).reduce((s,l)=>s+Math.max(0,num(l.kmEnd)-num(l.kmStart)),0),
    avgWait:mean(dayRows.map(waitMinutes)), avgStoreClient:mean(dayRows.map((r)=>diffMin(r.leftStoreAt,r.clientArrivalAt||r.deliveredAt))), avgClient:mean(dayRows.map(clientMinutes)), avgRoute:mean(dayRows.map(routeMinutes)),
    clients:dayRows.filter((r)=>r.clientName).length, phones:dayRows.filter((r)=>r.phone).length, identification:percent(completeId,dayRows.length),
  };
}

export async function exportFullExcelReport(env, period){
  const [allDeliveries,vehicles,drivers,collaborators,neighborhoods,categories,cyclesAll,kmAll,costsAll,closuresAll]=await Promise.all([
    Deliveries.active(env),Vehicles.all(),Drivers.all(),Collaborators.all(),Neighborhoods.all(),CostCategories.all(),Cycles.all(),OdometerLogs.all(),Costs.all(),DayClosures.all(),
  ]);
  const rows=allDeliveries.filter((r)=>inPeriod(r.entryTime,period));
  const cycles=cyclesAll.filter((c)=>c.environment===env&&!c.deletedAt&&inPeriod(c.startedAt,period));
  const km=kmAll.filter((l)=>l.environment===env&&inPeriod(l.shiftDate,period));
  const costs=costsAll.filter((c)=>c.environment===env&&!c.deletedAt&&inPeriod(c.date,period));
  const closures=closuresAll.filter((c)=>c.environment===env&&inPeriod(c.date,period));
  const vName=(id)=>vehicles.find((v)=>v.id===id)?.label||''; const dName=(id)=>drivers.find((d)=>d.id===id)?.name||''; const nName=(id)=>neighborhoods.find((n)=>n.id===id)?.name||''; const cName=(id)=>categories.find((c)=>c.id===id)?.name||'';
  const totalCosts=costs.reduce((s,c)=>s+num(c.amount),0), totalKm=km.filter((l)=>l.kmEnd!=null).reduce((s,l)=>s+Math.max(0,num(l.kmEnd)-num(l.kmStart)),0);
  const finalized=rows.filter(isFinal), problems=rows.filter(hasProblem);
  const reportStart=period?.start||dayKey(rows[0]?.entryTime)||'', reportEnd=period?.end||dayKey(rows.at(-1)?.entryTime)||dayKey(new Date());
  const sheets=[]; const add=(name,header,data)=>sheets.push({name,header,rows:data});

  add('RESUMO_EXECUTIVO',['Indicador','Valor'],[
    ['Versão do sistema','2.9.0'],['Ambiente',env==='treino'?'Treinamento':'Operação real'],['Período inicial',reportStart],['Período final',reportEnd],['Gerado em',dateTimeText(new Date())],
    ['Compras/entregas',rows.length],['Finalizadas no cliente',finalized.length],['Taxa de finalização %',percent(finalized.length,rows.length)],['Saídas acima de 2h',rows.filter(startLate).length],['Entregas acima de 3h30',rows.filter(arrivalLate).length],
    ['Problemas/ocorrências',problems.length],['Taxas/faturamento bruto',revenueGross(rows)],['Reembolsos',refunds(rows)],['Faturamento líquido',netRevenue(rows)],['Custos',totalCosts],['Saldo operacional',netRevenue(rows)-totalCosts],['Ciclos',cycles.length],['KM rodado',totalKm],['Nota de qualidade',qualityScore(rows)],
  ]);

  const days=unique([...rows.map((r)=>dayKey(r.entryTime)),...costs.map((c)=>dayKey(c.date)),...cycles.map((c)=>dayKey(c.startedAt)),...km.map((l)=>dayKey(l.shiftDate))]).sort();
  add('RESUMO_DIARIO',['Data','Dia da semana','Compras','Registros','Compras entregues','Na loja','Em rota','Programadas abertas','Reagendadas abertas','Entregues após programação','Devolvidas','Retiradas','Canceladas','Saída > 2h','Entrega > 3h30','Sucesso 1ª tentativa %','Taxa saída fora do padrão %','Taxa entrega fora do padrão %','Faturamento bruto','Reembolsos','Faturamento líquido','Custos','Saldo','Ciclos','KM','Compra → saída média min','Loja → cliente média min','Compra → cliente média min','Rota média min','Clientes identificados','Telefones informados','Identificação completa %'],days.map((d)=>{
    const dr=rows.filter((r)=>dayKey(r.entryTime)===d), dc=costs.filter((c)=>dayKey(c.date)===d), dcy=cycles.filter((c)=>dayKey(c.startedAt)===d), dk=km.filter((l)=>dayKey(l.shiftDate)===d), m=dailyMetrics(dr,dc,dcy,dk);
    return [d,DAY_NAMES[new Date(`${d}T12:00:00`).getDay()],m.purchases,m.records,m.delivered,m.store,m.route,m.scheduledOpen,m.rescheduledOpen,m.deliveredAfterSchedule,m.returned,m.withdrawn,m.cancelled,m.startLate,m.arrivalLate,m.firstAttempt,m.startLateRate,m.arrivalLateRate,m.gross,m.refund,m.net,m.costs,m.balance,m.cycles,m.km,m.avgWait,m.avgStoreClient,m.avgClient,m.avgRoute,m.clients,m.phones,m.identification];
  }));

  add('SLA_PRAZOS',['Data','Registros com saída calculável','Saídas dentro de 2h','Saídas acima de 2h','Cumprimento saída %','Compra → saída média min','Entregas calculáveis','Entregas dentro de 3h30','Entregas acima de 3h30','Cumprimento entrega %','Compra → cliente média min'],days.map((d)=>{const dr=rows.filter((r)=>dayKey(r.entryTime)===d),se=dr.filter((r)=>r.leftStoreAt),ae=dr.filter((r)=>r.clientArrivalAt||r.deliveredAt),sl=se.filter(startLate).length,al=ae.filter(arrivalLate).length;return[d,se.length,se.length-sl,sl,percent(se.length-sl,se.length),mean(se.map(waitMinutes)),ae.length,ae.length-al,al,percent(ae.length-al,ae.length),mean(ae.map(clientMinutes))];}));
  add('FLUXO_OPERACIONAL',['Data','Compras originais','Registros','Com saída registrada','Aguardando saída','Finalizadas no cliente','Em rota','Programadas abertas','Taxa de finalização %'],days.map((d)=>{const dr=rows.filter((r)=>dayKey(r.entryTime)===d);return[d,dr.length,dr.length,dr.filter((r)=>r.leftStoreAt).length,dr.filter((r)=>!r.leftStoreAt&&r.status==='na_loja').length,dr.filter(isFinal).length,dr.filter((r)=>['em_rota','no_cliente'].includes(r.status)).length,dr.filter((r)=>r.status==='programada').length,percent(dr.filter(isFinal).length,dr.length)];}));

  const months=unique(rows.map((r)=>monthKey(r.entryTime))).sort();
  add('RESUMO_MENSAL',['Mês','Compras','Registros','Compras entregues','Taxa de finalização %','Programadas/reagendadas abertas','Entregues após programação','Saídas dentro de 2h %','Entregas dentro de 3h30 %','Compra → saída média min','Compra → cliente média min','Faturamento bruto','Reembolsos','Faturamento líquido','Custos','Saldo','KM'],months.map((m)=>{const mr=rows.filter((r)=>monthKey(r.entryTime)===m),mc=costs.filter((c)=>monthKey(c.date)===m),mk=km.filter((l)=>monthKey(l.shiftDate)===m);const se=mr.filter((r)=>r.leftStoreAt),ae=mr.filter((r)=>r.clientArrivalAt||r.deliveredAt);const gross=revenueGross(mr),ref=refunds(mr),net=gross-ref,cost=mc.reduce((s,c)=>s+num(c.amount),0);return[m,mr.length,mr.length,mr.filter(isFinal).length,percent(mr.filter(isFinal).length,mr.length),mr.filter((r)=>['programada','reentrega'].includes(r.status)).length,mr.filter((r)=>isFinal(r)&&(r.scheduledAt||(r.reschedules||[]).length)).length,percent(se.filter((r)=>!startLate(r)).length,se.length),percent(ae.filter((r)=>!arrivalLate(r)).length,ae.length),mean(se.map(waitMinutes)),mean(ae.map(clientMinutes)),gross,ref,net,cost,net-cost,mk.filter((l)=>l.kmEnd!=null).reduce((s,l)=>s+Math.max(0,num(l.kmEnd)-num(l.kmStart)),0)];}));

  let prevRows=[]; let prevLabel='Período anterior';
  if(period?.start&&period?.end){const start=new Date(`${period.start}T12:00:00`),end=new Date(`${period.end}T12:00:00`),span=Math.round((end-start)/86400000)+1;const pe=new Date(start);pe.setDate(pe.getDate()-1);const ps=new Date(pe);ps.setDate(ps.getDate()-span+1);const psKey=dayKey(ps),peKey=dayKey(pe);prevRows=allDeliveries.filter((r)=>inPeriod(r.entryTime,{start:psKey,end:peKey}));prevLabel=`Período anterior (${dateText(psKey)} a ${dateText(peKey)})`;}
  const compareDefs=[['Compras originais',(x)=>x.length],['Compras entregues no cliente',(x)=>x.filter(isFinal).length],['Taxa de finalização %',(x)=>percent(x.filter(isFinal).length,x.length)],['Saídas > 2h',(x)=>x.filter(startLate).length],['Entregas > 3h30',(x)=>x.filter(arrivalLate).length],['Faturamento líquido',(x)=>netRevenue(x)],['Problemas',(x)=>x.filter(hasProblem).length],['Tempo médio compra → cliente',(x)=>mean(x.map(clientMinutes))]];
  add('COMPARATIVO',['Indicador','Período atual',prevLabel,'Diferença','Variação %'],compareDefs.map(([label,fn])=>{const a=fn(rows),b=fn(prevRows),diff=a-b;return[label,a,b,diff,b?diff/Math.abs(b):0];}));

  add('DIAS_SEMANA',['Dia da semana','Compras','Finalizadas','Sucesso %','Atrasadas','Taxa de atraso %','Problemas','Faturamento líquido','Espera média min','Rota média min'],DAY_NAMES.map((name,i)=>{const gr=rows.filter((r)=>new Date(r.entryTime).getDay()===i),late=gr.filter((r)=>startLate(r)||arrivalLate(r)).length;return[name,gr.length,gr.filter(isFinal).length,percent(gr.filter(isFinal).length,gr.length),late,percent(late,gr.length),gr.filter(hasProblem).length,netRevenue(gr),mean(gr.map(waitMinutes)),mean(gr.map(routeMinutes))];}));
  const hourRanges=Array.from({length:24},(_,h)=>h);
  add('HORARIOS_PICO',['Faixa de horário','Compras','Finalizadas','Sucesso %','Atrasadas','Taxa de atraso %','Faturamento líquido','Espera média min'],hourRanges.map((h)=>{const gr=rows.filter((r)=>new Date(r.entryTime).getHours()===h),late=gr.filter((r)=>startLate(r)||arrivalLate(r)).length;return[`${String(h).padStart(2,'0')}:00–${String(h).padStart(2,'0')}:59`,gr.length,gr.filter(isFinal).length,percent(gr.filter(isFinal).length,gr.length),late,percent(late,gr.length),netRevenue(gr),mean(gr.map(waitMinutes))];}));

  const feeGroups=[...groupBy(rows,(r)=>num(r.deliveryFee)).entries()].sort((a,b)=>a[0]-b[0]);
  add('TAXAS_PDV',['Taxa cobrada','Compras','Percentual das compras','Faturamento bruto','Reembolsos','Faturamento líquido','Caixa mais frequente','Bairro mais frequente','Clientes identificados'],feeGroups.map(([fee,gr])=>[fee,gr.length,percent(gr.length,rows.length),revenueGross(gr),refunds(gr),netRevenue(gr),mode(gr.map((r)=>r.pdv||'Não informado')),mode(gr.map((r)=>nName(r.neighborhoodId))),gr.filter((r)=>r.clientName).length]));

  const statusGroups=[...groupBy(rows,currentSituation).entries()];
  add('STATUS',['Situação consolidada da compra','Quantidade de compras','Percentual das compras','Faturamento atribuído','Compra → saída média min','Loja → cliente média min','Compra → cliente média min','Rota média min','Saída > 2h','Entrega > 3h30'],statusGroups.map(([label,gr])=>[label,gr.length,percent(gr.length,rows.length),netRevenue(gr),mean(gr.map(waitMinutes)),mean(gr.map((r)=>diffMin(r.leftStoreAt,r.clientArrivalAt||r.deliveredAt))),mean(gr.map(clientMinutes)),mean(gr.map(routeMinutes)),gr.filter(startLate).length,gr.filter(arrivalLate).length]));

  const ranking=[];
  const addRanking=(dimension,ids,nameFn)=>{ids.forEach((id)=>{const gr=rows.filter((r)=>dimension==='Veículo'?r.vehicleId===id:dimension==='Entregador'?r.driverId===id:r.neighborhoodId===id);if(!gr.length)return;const late=gr.filter((r)=>startLate(r)||arrivalLate(r)).length,prob=gr.filter(hasProblem).length;ranking.push([dimension,nameFn(id),gr.length,gr.filter(isFinal).length,percent(gr.filter(isFinal).length,gr.length),late,percent(late,gr.length),prob,percent(prob,gr.length),mean(gr.map(routeMinutes)),netRevenue(gr),qualityScore(gr)]);});};
  addRanking('Veículo',vehicles.map((v)=>v.id),vName); addRanking('Entregador',drivers.map((d)=>d.id),dName); addRanking('Bairro',neighborhoods.map((n)=>n.id),nName);
  ranking.sort((a,b)=>b[11]-a[11]||b[3]-a[3]);
  add('RANKING_OPERACIONAL',['Dimensão','Nome','Registros','Finalizadas','Sucesso %','Atrasadas','Taxa de atraso %','Problemas','Taxa de problemas %','Rota média min','Faturamento atribuído','Nota de qualidade'],ranking);

  add('METODOLOGIA',['Indicador','Como é calculado','Finalidade'],[
    ['Compras originais','Registros de entrega no período selecionado','Medir volume operacional'],['Taxa de finalização','Finalizadas ÷ registros','Acompanhar conclusão das entregas'],['Saída > 2h','Saída da loja posterior ao limite configurado','Controlar SLA de saída'],['Entrega > 3h30','Chegada/finalização posterior ao limite configurado','Controlar SLA de chegada'],['Sucesso 1ª tentativa','Finalizadas sem retorno ÷ registros','Medir resolução sem reentrega'],['Faturamento líquido','Taxas contabilizadas − reembolsos','Ver receita líquida de entrega'],['Saldo','Faturamento líquido − custos lançados','Ver resultado operacional'],['KM rodado','KM final − KM inicial','Medir deslocamento da frota'],['Nota qualidade','Sucesso, pontualidade e ocorrências ponderados','Comparar desempenho operacional'],['Problemas','Retornos, reentregas, cancelamentos ou ocorrências registradas','Identificar perdas de eficiência'],
  ]);

  add('ENTREGAS',['ID','ID raiz','ID anterior','Tentativa','Data','Nº Compra','Nº do cupom','Nº DOC','Nº Caixa','Nome do cliente','Telefone','Bairro','Rua/Avenida','Número','Complemento','Referência','Prioridade','Posição no roteiro','Taxa registrada','Reembolso','Data reembolso','Receita líquida','Entregador','Veículo','Ciclo','Entrada','Saída','Finalização','Retorno Loja','Compra → Saída Min','Loja → Cliente Min','Compra → Cliente Finalizada Min','Tempo Total/Transcorrido Agora Min','Saldo do Prazo 3h30 Min','Rota Min','Aplicável ao SLA comum','Saída > 2h','Entrega > 3h30','Situação Atual do Prazo','Status deste registro','Situação consolidada da compra','Entregue em alguma tentativa','Data Programada','Hora Programada','Tipo Programação','Detalhes do agendamento','Voltou sem entrega','Motivo da volta','Detalhe da volta','Motivo padronizado','Motivo complementar','Próxima Ação','Observações','Criado em','Atualizado em'],rows.map((r)=>{
    const total=diffMin(r.entryTime,r.deliveredAt||new Date()),deadline=targets().arrivalMinutes-(diffMin(r.entryTime,r.clientArrivalAt||r.deliveredAt||new Date())||0),ret=(r.returnAttempts||[]).at(-1)||{};
    return[r.id,rootId(r),previousId(r),attempt(r),dayKey(r.entryTime),r.purchaseNumber,r.coupon,r.doc,r.pdv,r.clientName,r.phone,nName(r.neighborhoodId),r.street,r.houseNumber,r.complement,r.reference,r.priority,r.routePosition||'',num(r.deliveryFee),r.refunded?'SIM':'NÃO',r.refundedAt?dateText(r.refundedAt):'',r.refunded?0:num(r.deliveryFee),dName(r.driverId),vName(r.vehicleId),r.cycleId||'',timeText(r.entryTime),timeText(r.leftStoreAt),timeText(r.deliveredAt),timeText(r.returnedAt),waitMinutes(r),diffMin(r.leftStoreAt,r.clientArrivalAt||r.deliveredAt),clientMinutes(r),total,deadline,routeMinutes(r),r.type==='agendada'?'NÃO':'SIM',startLate(r)?'SIM':'NÃO',arrivalLate(r)?'SIM':'NÃO',arrivalLate(r)?'ATRASADA':startLate(r)?'SAÍDA ATRASADA':'NO PRAZO',statusLabel(r),currentSituation(r),r.deliveredAt?'SIM':'NÃO',r.scheduledAt?dayKey(r.scheduledAt):'',r.scheduledAt?timeText(r.scheduledAt):'',r.type||'',(r.reschedules||[]).at(-1)?.reason||'',r.returnedAt?'SIM':'NÃO',r.returnReasonLabel||ret.reasonLabel||'',r.returnNote||ret.note||'',r.returnReasonLabel||'',r.returnNote||'',nextAction(r),r.notes||'',dateTimeText(r.createdAt),dateTimeText(r.updatedAt)];
  }));

  add('CONTATOS_CLIENTES',['Data','Nº Compra','Nº do cupom','Nº DOC','Nº Caixa','Nome do cliente','Telefone','Bairro','Endereço completo','Referência','Prioridade','Situação consolidada','Última data programada','Último horário programado','Detalhes do agendamento','Próxima Ação','Observações'],rows.map((r)=>[dayKey(r.entryTime),r.purchaseNumber,r.coupon,r.doc,r.pdv,r.clientName,r.phone,nName(r.neighborhoodId),[r.street,r.houseNumber,r.complement].filter(Boolean).join(', '),r.reference,r.priority,currentSituation(r),r.scheduledAt?dayKey(r.scheduledAt):'',r.scheduledAt?timeText(r.scheduledAt):'',(r.reschedules||[]).at(-1)?.reason||'',nextAction(r),r.notes||'']));

  const clientGroups=[...groupBy(rows,(r)=>(r.phone||r.clientName||'').trim().toLowerCase()).entries()].filter(([k])=>k);
  add('CLIENTES',['Cliente','Telefone','Compras','Cliente recorrente','Primeira compra','Última compra','Bairros atendidos','Bairro mais frequente','Finalizadas','Problemas','Reagendamentos','Devoluções','Faturamento líquido'],clientGroups.map(([,gr])=>{const dates=gr.map((r)=>dayKey(r.entryTime)).sort();return[gr.find((r)=>r.clientName)?.clientName||'',gr.find((r)=>r.phone)?.phone||'',gr.length,gr.length>1?'SIM':'NÃO',dates[0]||'',dates.at(-1)||'',unique(gr.map((r)=>nName(r.neighborhoodId))).length,mode(gr.map((r)=>nName(r.neighborhoodId))),gr.filter(isFinal).length,gr.filter(hasProblem).length,gr.reduce((s,r)=>s+(r.reschedules||[]).length,0),gr.filter((r)=>['retorno','reentrega'].includes(r.status)||(r.returnAttempts||[]).length).length,netRevenue(gr)];}));

  const pdvGroups=[...groupBy(rows,(r)=>r.pdv||'Não informado').entries()].sort((a,b)=>b[1].length-a[1].length);
  add('CAIXAS_PDV',['Nº Caixa','Compras','Finalizadas','Sucesso %','Atrasadas','Taxa de atraso %','DOCs duplicados','Clientes identificados','Faturamento bruto','Reembolsos','Faturamento líquido','Taxa média'],pdvGroups.map(([pdv,gr])=>{const docs=gr.map((r)=>r.doc).filter(Boolean),dups=docs.length-unique(docs).length,late=gr.filter((r)=>startLate(r)||arrivalLate(r)).length;return[pdv,gr.length,gr.filter(isFinal).length,percent(gr.filter(isFinal).length,gr.length),late,percent(late,gr.length),dups,gr.filter((r)=>r.clientName).length,revenueGross(gr),refunds(gr),netRevenue(gr),mean(gr.map((r)=>num(r.deliveryFee)))];}));

  const occMap=new Map(); rows.forEach((r)=>{const labels=[];(r.returnAttempts||[]).forEach((a)=>labels.push(a.reasonLabel||a.reason||r.returnReasonLabel||'Retorno'));if(r.status==='cancelada')labels.push('Cancelada');if(!labels.length&&hasProblem(r))labels.push(r.returnReasonLabel||currentSituation(r));labels.forEach((label)=>{if(!occMap.has(label))occMap.set(label,[]);occMap.get(label).push(r);});});
  add('OCORRENCIAS',['Motivo ou ocorrência','Registros','Compras afetadas','Devoluções','Reagendamentos','Cancelamentos','Bairro mais frequente','Entregador mais frequente','Veículo mais frequente'],[...occMap.entries()].map(([label,gr])=>[label,gr.length,unique(gr.map((r)=>r.id)).length,gr.filter((r)=>['retorno','reentrega'].includes(r.status)||(r.returnAttempts||[]).length).length,gr.filter((r)=>(r.reschedules||[]).length||r.status==='reentrega').length,gr.filter((r)=>r.status==='cancelada').length,mode(gr.map((r)=>nName(r.neighborhoodId))),mode(gr.map((r)=>dName(r.driverId))),mode(gr.map((r)=>vName(r.vehicleId)))]));

  const qualityDefs=[['Nº do cupom',(r)=>r.coupon,'Obrigatório nos novos registros'],['Nº DOC',(r)=>r.doc,'Obrigatório'],['Nº Caixa/PDV',(r)=>r.pdv,'Obrigatório'],['Bairro',(r)=>r.neighborhoodId,'Obrigatório'],['Endereço',(r)=>r.street,'Obrigatório'],['Telefone',(r)=>r.phone,'Opcional, importante para contato'],['Nome do cliente',(r)=>r.clientName,'Opcional'],['Veículo',(r)=>r.vehicleId,'Preenchido ao iniciar ciclo'],['Entregador',(r)=>r.driverId,'Preenchido ao iniciar ciclo'],['Hora de finalização',(r)=>r.status!=='finalizada'||r.deliveredAt,'Necessária para métricas de tempo']];
  add('QUALIDADE_DADOS',['Campo','Base analisada','Preenchidos','Ausentes','Completude %','Observação'],qualityDefs.map(([label,fn,note])=>{const filled=rows.filter((r)=>Boolean(fn(r))).length;return[label,rows.length,filled,rows.length-filled,percent(filled,rows.length),note];}));

  const inconsist=[]; const required=[['Cupom','coupon'],['DOC','doc'],['Caixa','pdv'],['Endereço','street'],['Bairro','neighborhoodId']]; rows.forEach((r)=>{const missing=required.filter(([,f])=>!r[f]).map(([l])=>l);if(missing.length)inconsist.push(['Campos obrigatórios ausentes',dayKey(r.entryTime),r.purchaseNumber||r.coupon||'',r.doc||'',r.pdv||'',missing.join(', ')]);if(r.deliveredAt&&!r.clientArrivalAt)inconsist.push(['Horário incompleto',dayKey(r.entryTime),r.purchaseNumber||r.coupon||'',r.doc||'',r.pdv||'','Finalizada sem chegada no cliente']);});
  const docGroups=groupBy(rows.filter((r)=>r.doc),(r)=>r.doc);[...docGroups.entries()].filter(([,gr])=>gr.length>1).forEach(([doc,gr])=>inconsist.push(['DOC duplicado',dayKey(gr[0].entryTime),gr.map((r)=>r.purchaseNumber).join(' / '),doc,gr.map((r)=>r.pdv).join(' / '),`${gr.length} registros com o mesmo DOC`]));
  add('INCONSISTENCIAS',['Tipo','Data','Compra/Nº do cupom','DOC','Caixa','Detalhe'],inconsist);

  const scheduled=rows.filter((r)=>r.scheduledAt); const agendaGroups=[...groupBy(scheduled,(r)=>dayKey(r.scheduledAt)).entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  add('PREVISAO_AGENDA',['Data programada','Situação da agenda','Entregas','Reagendadas','Clientes com telefone','Bairros diferentes','Bairro mais frequente','Taxas vinculadas','Próxima ação mais frequente'],agendaGroups.map(([d,gr])=>[d,d>=dayKey(new Date())?'Futura':'Histórica',gr.length,gr.filter((r)=>(r.reschedules||[]).length).length,gr.filter((r)=>r.phone).length,unique(gr.map((r)=>r.neighborhoodId)).length,mode(gr.map((r)=>nName(r.neighborhoodId))),gr.reduce((s,r)=>s+num(r.deliveryFee),0),mode(gr.map(nextAction))]));

  const historyStart=allDeliveries.length?dayKey([...allDeliveries].sort((a,b)=>String(a.entryTime).localeCompare(String(b.entryTime)))[0].entryTime):''; const historyEnd=allDeliveries.length?dayKey([...allDeliveries].sort((a,b)=>String(a.entryTime).localeCompare(String(b.entryTime))).at(-1).entryTime):''; const wdStats=DAY_NAMES.map((_,i)=>{const d=allDeliveries.filter((r)=>new Date(r.entryTime).getDay()===i);const dates=unique(d.map((r)=>dayKey(r.entryTime)));return dates.length?d.length/dates.length:0;});
  const future=[]; for(let i=1;i<=35;i++){const d=new Date();d.setDate(d.getDate()+i);const dk=dayKey(d),wd=d.getDay(),scheduledOpen=allDeliveries.filter((r)=>r.scheduledAt&&dayKey(r.scheduledAt)===dk&&!['finalizada','cancelada'].includes(r.status)).length,estimate=wdStats[wd]||0;future.push([dk,DAY_NAMES[wd],`Semana ${Math.ceil(i/7)}`,`${Math.ceil(d.getDate()/7)}ª semana`,estimate,scheduledOpen,estimate+scheduledOpen,allDeliveries.length>=60?'Boa':allDeliveries.length>=20?'Moderada':'Inicial',historyStart&&historyEnd?`${dateText(historyStart)} a ${dateText(historyEnd)}`:'Base insuficiente']);}
  add('PREVISAO_MOVIMENTO',['Data prevista','Dia da semana','Semana da previsão','Semana do mês','Estimativa pelo histórico','Programadas em aberto','Movimento previsto','Nível de confiança','Base histórica'],future);

  add('CUSTOS',['Data','Hora','Veículo','Categoria','Descrição','Valor','KM Atual','Fornecedor','Comprovante','Responsável','Observações'],costs.map((c)=>[dayKey(c.date),c.createdAt?timeText(c.createdAt):'',vName(c.vehicleId),cName(c.categoryId),c.description||c.note||'',num(c.amount),c.kmCurrent||'',c.supplier||'',c.receipt||'',dName(c.driverId)||c.responsible||'',c.note||'']));

  add('CICLOS',['Data','Ciclo','Tipo','Veículo','Entregador','Saída','Retorno','Entregas levadas','Entregas concluídas','Entregas que voltaram','Prioridades','Bairros','Ordem sugerida das NFs','KM Médio por Ciclo','Tempo Min','Receita'],cycles.map((c)=>{const cr=rows.filter((r)=>(c.deliveryIds||[]).includes(r.id)),log=km.find((l)=>l.id===c.odometerLogId),kmDay=log?.kmEnd!=null?Math.max(0,num(log.kmEnd)-num(log.kmStart)):0;const sameLogCycles=cycles.filter((x)=>x.odometerLogId&&x.odometerLogId===c.odometerLogId).length||1;return[dayKey(c.startedAt),c.id,c.type||'OPERACIONAL',vName(c.vehicleId),dName(c.driverId),timeText(c.startedAt),timeText(c.closedAt),(c.deliveryIds||[]).length,cr.filter(isFinal).length,cr.filter((r)=>(r.returnAttempts||[]).some((a)=>!a.cycleId||a.cycleId===c.id)).length,cr.filter((r)=>r.priority==='alta').length,unique(cr.map((r)=>nName(r.neighborhoodId))).join(' → '),cr.map((r)=>r.coupon||r.purchaseNumber).join(' → '),kmDay/sameLogCycles,diffMin(c.startedAt,c.closedAt),netRevenue(cr)];}));

  add('ODOMETRO_DIARIO',['Data','Veículo','KM Inicial','KM Final','KM Rodado','Ciclos','Entregas','Entregas por Ciclo','KM por Ciclo','KM por Entrega','Status'],km.map((l)=>{const lc=cycles.filter((c)=>c.odometerLogId===l.id||(dayKey(c.startedAt)===l.shiftDate&&c.vehicleId===l.vehicleId)),ids=unique(lc.flatMap((c)=>c.deliveryIds||[])),rod=l.kmEnd!=null?Math.max(0,num(l.kmEnd)-num(l.kmStart)):0;return[l.shiftDate,vName(l.vehicleId),num(l.kmStart),l.kmEnd==null?'':num(l.kmEnd),l.kmEnd==null?'':rod,lc.length,ids.length,lc.length?ids.length/lc.length:0,lc.length?rod/lc.length:0,ids.length?rod/ids.length:0,l.kmEnd==null?'ABERTO':'FECHADO'];}));

  add('VEICULOS',['Veículo','Registros','Finalizadas','Sucesso %','Faturamento','Custos','Saldo','KM','Custo por Entrega','Custo por KM','Ciclos','Entregas por Ciclo','Rota média min','Atrasadas','Taxa atraso %','Problemas','Nota qualidade'],vehicles.map((v)=>{const gr=rows.filter((r)=>r.vehicleId===v.id),vc=costs.filter((c)=>c.vehicleId===v.id).reduce((s,c)=>s+num(c.amount),0),vk=km.filter((l)=>l.vehicleId===v.id&&l.kmEnd!=null).reduce((s,l)=>s+Math.max(0,num(l.kmEnd)-num(l.kmStart)),0),vcy=cycles.filter((c)=>c.vehicleId===v.id),late=gr.filter((r)=>startLate(r)||arrivalLate(r)).length;return[v.label,gr.length,gr.filter(isFinal).length,percent(gr.filter(isFinal).length,gr.length),netRevenue(gr),vc,netRevenue(gr)-vc,vk,gr.filter(isFinal).length?vc/gr.filter(isFinal).length:0,vk?vc/vk:0,vcy.length,vcy.length?gr.length/vcy.length:0,mean(gr.map(routeMinutes)),late,percent(late,gr.length),gr.filter(hasProblem).length,qualityScore(gr)];}));

  const people=[...collaborators.map((c)=>({id:c.id,name:c.name,role:c.role||'Colaborador'})),...drivers.filter((d)=>!collaborators.some((c)=>c.name===d.name)).map((d)=>({id:d.id,name:d.name,role:'Entregador',driver:true}))];
  add('COLABORADORES',['Colaborador','Função','Registros','Finalizadas','Sucesso %','Faturamento','Espera média min','Até cliente média min','Rota média min','Devoluções','Reagendamentos','Atrasadas','Taxa atraso %','Problemas','Nota qualidade'],people.map((p)=>{const did=drivers.find((d)=>d.id===p.id||d.name===p.name)?.id,gr=did?rows.filter((r)=>r.driverId===did):[],late=gr.filter((r)=>startLate(r)||arrivalLate(r)).length;return[p.name,p.role,gr.length,gr.filter(isFinal).length,percent(gr.filter(isFinal).length,gr.length),netRevenue(gr),mean(gr.map(waitMinutes)),mean(gr.map(clientMinutes)),mean(gr.map(routeMinutes)),gr.filter((r)=>['retorno','reentrega'].includes(r.status)||(r.returnAttempts||[]).length).length,gr.reduce((s,r)=>s+(r.reschedules||[]).length,0),late,percent(late,gr.length),gr.filter(hasProblem).length,qualityScore(gr)];}));

  add('BAIRROS',['Bairro','Registros','Compras entregues','Sucesso %','Faturamento','Espera média min','Rota média min','Endereço Errado','Programações registradas','Reagendamentos registrados','Programadas abertas','Reagendadas abertas','Entregues após programação','Devoluções','Atrasadas','Taxa atraso %','Taxa Devolução %','Taxa Problemas %','Nota qualidade'],neighborhoods.map((n)=>{const gr=rows.filter((r)=>r.neighborhoodId===n.id),late=gr.filter((r)=>startLate(r)||arrivalLate(r)).length,dev=gr.filter((r)=>['retorno','reentrega'].includes(r.status)||(r.returnAttempts||[]).length).length,prob=gr.filter(hasProblem).length;return[n.name,gr.length,gr.filter(isFinal).length,percent(gr.filter(isFinal).length,gr.length),netRevenue(gr),mean(gr.map(waitMinutes)),mean(gr.map(routeMinutes)),gr.filter((r)=>String(r.returnReasonLabel||'').toLowerCase().includes('endere')).length,gr.filter((r)=>r.scheduledAt).length,gr.reduce((s,r)=>s+(r.reschedules||[]).length,0),gr.filter((r)=>r.status==='programada').length,gr.filter((r)=>r.status==='reentrega').length,gr.filter((r)=>isFinal(r)&&(r.scheduledAt||(r.reschedules||[]).length)).length,dev,late,percent(late,gr.length),percent(dev,gr.length),percent(prob,gr.length),qualityScore(gr)];}));

  add('PROGRAMADAS',['Origem da compra','Última data programada','Hora programada','Tipo consolidado','Detalhes do agendamento','Fora do indicador comum de atraso','Nº Compra','Nº do cupom','Nº DOC','Nº Caixa','Nome do cliente','Telefone','Bairro','Situação consolidada','Entregue no cliente','Data da entrega','Hora da entrega','Tentativa entregue','Programações registradas','Tentativas ligadas','Motivo mais recente','Próxima ação'],scheduled.map((r)=>[dayKey(r.entryTime),dayKey(r.scheduledAt),timeText(r.scheduledAt),(r.reschedules||[]).length?'Reagendada':'Programada',(r.reschedules||[]).at(-1)?.reason||'',r.type==='agendada'?'SIM':'NÃO',r.purchaseNumber,r.coupon,r.doc,r.pdv,r.clientName,r.phone,nName(r.neighborhoodId),currentSituation(r),r.deliveredAt?'SIM':'NÃO',r.deliveredAt?dayKey(r.deliveredAt):'',r.deliveredAt?timeText(r.deliveredAt):'',r.deliveredAt?attempt(r):'',1+(r.reschedules||[]).length,1+(r.returnAttempts||[]).length,r.returnReasonLabel||(r.reschedules||[]).at(-1)?.reason||'',nextAction(r)]));

  const pending=[]; rows.filter((r)=>startLate(r)).forEach((r)=>pending.push(['ATENÇÃO',dayKey(r.entryTime),'delivery',`Compra Nº ${r.purchaseNumber} • Cupom ${r.coupon||'—'}`,'Saída fora do padrão configurado',nName(r.neighborhoodId)])); rows.filter((r)=>arrivalLate(r)).forEach((r)=>pending.push(['ATENÇÃO',dayKey(r.entryTime),'delivery',`Compra Nº ${r.purchaseNumber} • Cupom ${r.coupon||'—'}`,'Entrega/chegada fora do padrão configurado',nName(r.neighborhoodId)])); cycles.filter((c)=>c.status==='aberto').forEach((c)=>pending.push(['CRÍTICA',dayKey(c.startedAt),'cycle','Ciclo ainda aberto',`${vName(c.vehicleId)} · ${dName(c.driverId)}`,'Fechar ciclo'])); km.filter((l)=>l.kmEnd==null).forEach((l)=>pending.push(['INFORMATIVA',l.shiftDate,'odometer',`KM final pendente • ${vName(l.vehicleId)}`,'O expediente foi aberto, mas ainda não foi fechado.',`KM inicial ${l.kmStart}`]));
  add('PENDENCIAS',['Prioridade','Data','Tipo','Título','Detalhe','Meta'],pending);

  add('FECHAMENTOS_DIA',['Data','Encerrado em','Entregas no encerramento','Ciclos no encerramento','KM no encerramento','Avisos'],closures.map((c)=>{const d=c.date,dr=allDeliveries.filter((r)=>dayKey(r.entryTime)===d),dcy=cyclesAll.filter((x)=>x.environment===env&&dayKey(x.startedAt)===d),dk=kmAll.filter((l)=>l.environment===env&&l.shiftDate===d&&l.kmEnd!=null).reduce((s,l)=>s+Math.max(0,num(l.kmEnd)-num(l.kmStart)),0),warn=dr.filter((r)=>startLate(r)||arrivalLate(r)||hasProblem(r)).length;return[d,dateTimeText(c.closedAt),c.summary?.deliveries??dr.length,dcy.length,dk,warn];}));

  add('HISTORICO',['ID','ID raiz','ID anterior','Tentativa','Data','Nº Compra','Nº do cupom','Nº DOC','Nº Caixa','Cliente','Telefone','Status deste registro','Situação consolidada da compra','Entregue em alguma tentativa','Agendamento','Voltou sem entrega','Motivo da volta','Criado em','Atualizado em'],rows.map((r)=>[r.id,rootId(r),previousId(r),attempt(r),dayKey(r.entryTime),r.purchaseNumber,r.coupon,r.doc,r.pdv,r.clientName,r.phone,statusLabel(r),currentSituation(r),r.deliveredAt?'SIM':'NÃO',r.scheduledAt?dateTimeText(r.scheduledAt):'',r.returnedAt?'SIM':'NÃO',r.returnReasonLabel||'',dateTimeText(r.createdAt),dateTimeText(r.updatedAt)]));

  const filename=`orbita-relatorio-completo-${env}-${reportStart||'inicio'}-a-${reportEnd||dayKey(new Date())}.xls`;
  downloadWorkbook(filename,sheets);
  return { filename, sheetCount:sheets.length, rowCount:rows.length };
}
