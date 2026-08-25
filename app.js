(() => {
  // V8: tema visual de foco médio-escuro, com gráficos legíveis e cores reduzidas.
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#D8E4E6';
    Chart.defaults.borderColor = 'rgba(216,228,230,.12)';
    Chart.defaults.font.family = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif';
  }
  'use strict';

  const APP_VERSION = '14.8.0';
  const DB_NAME = 'controle_entregas_nx';
  const DB_VERSION = 1;
  const STORE_NAME = 'app_state';
  const STATE_KEY = 'main';
  const PRE_UPDATE_BACKUP_KEY = 'pre_update_backup';
  const SYNC_QUEUE_KEY = 'delivery_sync_queue_v1';
  const SYNC_SNAPSHOT_KEY = 'delivery_sync_snapshot_v1';
  const SYNC_WORKSPACE_CODE = 'nilo-entregas';
  const SUPABASE_URL = 'https://vwwkzenvcxedxiuopsgv.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Vh9zdSxCUH0fMJOjf_G6Sw_UMU0t0to';
  const SUPABASE_LOGIN_DOMAIN = 'centraltemp.invalid';
  const SYNC_COLLECTIONS = ['vehicles','neighborhoods','employees','costCategories','reasons','deliveries','cycles','routeTracks','odometerLogs','costs','audit','dayClosures','trash'];
  const YEAR_PAST_RANGE = 10;
  const YEAR_FUTURE_RANGE = 20;

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const statusOptions = ['Na loja','Em rota','Finalizada','Programada','Reagendada','Devolvida','Retirada na loja','Cancelada'];

  let state = null;
  let dbHandle = null;
  let currentView = 'today';
  let configTab = 'vehicles';
  let deferredInstallPrompt = null;
  let lastFocusedElement = null;
  let preUpdateBackup = null;
  let deliverySearch = { identifier: '', cashier: '', date: '', customerName: '' };
  let cloudClient = null;
  let cloudSession = null;
  let cloudWorkspace = null;
  let realtimeChannel = null;
  let syncQueue = [];
  let syncSnapshot = {};
  let syncReady = false;
  let syncApplyingRemote = false;
  let syncFlushing = false;
  let syncFlushTimer = null;
  let syncRealtimeStatus = 'DISCONNECTED';
  let hadLocalStateBeforeSync = false;
  let activeRouteWatchId = null;
  let activeRouteCycleId = '';
  let routeTrackPersistTimer = null;
  let routeTrackPersisting = false;
  let routeWakeLock = null;
  let routeHistoryDriverId = '';
  let routeHistorySelectedTrackId = '';
  const syncClientId = (() => {
    try {
      const existing = localStorage.getItem('delivery_sync_client_id');
      if (existing) return existing;
      const value = `client_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`}`;
      localStorage.setItem('delivery_sync_client_id',value);
      return value;
    } catch {
      return `client_${Date.now()}_${Math.random()}`;
    }
  })();

  const pageMeta = {
    dashboard: ['Dashboard', 'Visão geral da operação, custos, faturamento e produtividade.'],
    today: ['Central de Operação', 'O que está acontecendo agora, o que precisa de ação e qual é o próximo passo.'],
    deliveries: ['Entregas', 'Cadastro completo e histórico anual de todas as entregas.'],
    scheduled: ['Programadas e Reagendadas', 'Agenda automática pela data programada, sem perder o histórico da origem.'],
    pending: ['Central de Pendências', 'Tudo que exige ação antes de encerrar a operação.'],
    cycles: ['Ciclos e roteiros', 'Monte cada saída, priorize entregas e abra a sequência dos bairros no Google Maps.'],
    'route-history': ['Histórico de rotas', 'Veja o trajeto real do entregador por dia, semana, mês ou período específico.'],
    odometer: ['Quilometragem da frota', 'KM inicial e final do dia por veículo, com médias por dia, semana, mês, entrega e ciclo.'],
    costs: ['Custos da frota', 'Combustível, manutenção e outros gastos registrados individualmente.'],
    neighborhoods: ['Análise por bairro', 'Entregas, faturamento, endereço errado, reagendamentos, devoluções e problemas por bairro.'],
    trace: ['Pesquisar entregas', 'Localize por nº da compra, cupom, data, DOC, caixa ou cliente.'],
    reports: ['Relatórios e Exportação', 'Baixe dados por dia, semana, mês, ano ou período personalizado.'],
    settings: ['Cadastros e Configurações', 'Adicione, edite, desative e reative veículos, bairros e colaboradores.'],
    trash: ['Lixeira', 'Restaure registros apagados por engano ou exclua definitivamente.']
  };

  function uid(prefix = 'id') {
    if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  }

  function nowISO() { return new Date().toISOString(); }
  function todayISO() {
    const d = new Date();
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }
  function localDateISO(date) {
    const d = new Date(date);
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  }
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  }
  function attr(value) { return esc(value); }
  function uppercaseName(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleUpperCase('pt-BR');
  }
  function phoneDigits(value) { return String(value ?? '').replace(/\D/g, '').slice(0, 11); }
  function formatPhoneBR(value) {
    const digits = phoneDigits(value);
    if (!digits) return '';
    if (digits.length <= 2) return `( ${digits}`;
    const area = digits.slice(0, 2);
    const local = digits.slice(2);
    if (local.length <= 1) return `( ${area} ) ${local}`;
    if (digits.length === 11) {
      const first = local.slice(0, 1);
      const middle = local.slice(1, 5);
      const end = local.slice(5, 9);
      return `( ${area} ) ${first}${middle ? ` ${middle}` : ''}${end ? `-${end}` : ''}`;
    }
    const first = local.slice(0, 4);
    const end = local.slice(4, 8);
    return `( ${area} ) ${first}${end ? `-${end}` : ''}`;
  }
  function bindInputNormalizers(root = document) {
    $$('[data-uppercase-name]', root).forEach(input => {
      if (input.dataset.normalizerBound) return;
      input.dataset.normalizerBound = 'true';
      input.addEventListener('input', () => {
        const cursor = input.selectionStart;
        input.value = input.value.toLocaleUpperCase('pt-BR');
        if (cursor !== null) input.setSelectionRange(cursor, cursor);
      });
      input.value = input.value.toLocaleUpperCase('pt-BR');
    });
    $$('[data-phone-mask]', root).forEach(input => {
      if (input.dataset.normalizerBound) return;
      input.dataset.normalizerBound = 'true';
      input.addEventListener('input', () => { input.value = formatPhoneBR(input.value); });
      input.value = formatPhoneBR(input.value);
    });
  }
  function money(value) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  }
  function parseMoneyInput(value) {
    const raw = String(value ?? '').trim().replace(/\s/g, '').replace(/R\$/gi, '');
    if (!raw) return null;
    let normalized = raw;
    if (normalized.includes(',') && normalized.includes('.')) normalized = normalized.replace(/\./g, '').replace(',', '.');
    else normalized = normalized.replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  function number(value, digits = 0) {
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value || 0));
  }
  function percent(value, digits = 1) {
    return `${number(value,digits)}%`;
  }
  function dateBR(value) {
    if (!value) return '—';
    const v = String(value).slice(0, 10);
    const [y,m,d] = v.split('-');
    return y && m && d ? `${d}/${m}/${y}` : value;
  }
  function dateTimeBR(value) {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(new Date(value)); }
    catch { return value; }
  }
  function sum(values) { return values.reduce((acc, v) => acc + Number(v || 0), 0); }
  function avg(values) {
    const valid = values.filter(v => v !== null && v !== undefined && Number.isFinite(Number(v)));
    return valid.length ? sum(valid) / valid.length : 0;
  }
  function unique(values) { return [...new Set(values)]; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function currentMode() { return state?.settings?.appMode === 'training' ? 'training' : 'production'; }
  function modeLabel() { return currentMode() === 'training' ? 'Treinamento' : 'Operação real'; }
  function recordInCurrentMode(item) { return (item?.mode || 'production') === currentMode(); }
  function scoped(list) { return (list || []).filter(recordInCurrentMode); }
  function cloneData(value) { return JSON.parse(JSON.stringify(value)); }

  function defaultState() {
    const now = nowISO();
    return {
      meta: { version: APP_VERSION, createdAt: now, updatedAt: now },
      settings: {
        workStart: '09:00', lunchStart: '13:00', lunchEnd: '14:00', workEnd: '20:00', delayMinutes: 120, completionLimitMinutes: 210,
        companyName: 'Controle de Entregas', locationName: 'Nova Xavantina • MT', appMode: 'production', autoCycles: true,
        routeOrigin: 'Nilo Supermercado, Nova Xavantina - MT', routeCity: 'Nova Xavantina - MT'
      },
      vehicles: [
        { id: uid('veh'), name: 'Veículo 1', plate: '', type: 'Utilitário', active: true, createdAt: now },
        { id: uid('veh'), name: 'Veículo 2', plate: '', type: 'Moto', active: true, createdAt: now },
        { id: uid('veh'), name: 'Veículo 3', plate: '', type: 'Moto', active: true, createdAt: now }
      ],
      neighborhoods: [
        { id: uid('nei'), name: 'Centro', region: '', routeOrder: 1, mapQuery: '', active: true, createdAt: now },
        { id: uid('nei'), name: 'Henry I', region: '', routeOrder: 2, mapQuery: '', active: true, createdAt: now },
        { id: uid('nei'), name: 'Henry II', region: '', routeOrder: 3, mapQuery: '', active: true, createdAt: now },
        { id: uid('nei'), name: 'Tonetto', region: '', routeOrder: 4, mapQuery: '', active: true, createdAt: now }
      ],
      employees: [
        { id: uid('emp'), name: 'Entregador 1', role: 'Entregador', active: true, createdAt: now }
      ],
      costCategories: [
        { id: uid('cat'), name: 'Combustível', active: true },
        { id: uid('cat'), name: 'Manutenção preventiva', active: true },
        { id: uid('cat'), name: 'Manutenção corretiva', active: true },
        { id: uid('cat'), name: 'Pneus', active: true },
        { id: uid('cat'), name: 'Óleo e lubrificantes', active: true },
        { id: uid('cat'), name: 'Lavagem', active: true },
        { id: uid('cat'), name: 'Documentação', active: true },
        { id: uid('cat'), name: 'Outros', active: true }
      ],
      reasons: [
        { id: 'CLIENTE_AUSENTE', name: 'Cliente ausente', active: true },
        { id: 'ENDERECO_ERRADO', name: 'Endereço errado', active: true },
        { id: 'CLIENTE_RECUSOU', name: 'Cliente recusou', active: true },
        { id: 'CLIENTE_OUTRO_DIA', name: 'Cliente solicitou outro dia', active: true },
        { id: 'PRODUTO_INCORRETO', name: 'Produto incorreto', active: true },
        { id: 'PRODUTO_AVARIADO', name: 'Produto avariado', active: true },
        { id: 'SEM_TEMPO', name: 'Não foi possível concluir a rota', active: true },
        { id: 'VEICULO_PROBLEMA', name: 'Veículo apresentou problema', active: true },
        { id: 'OUTRO', name: 'Outros', active: true }
      ],
      deliveries: [],
      cycles: [],
      routeTracks: [],
      odometerLogs: [],
      costs: [],
      audit: [],
      dayClosures: [],
      trash: []
    };
  }

  function migrateState(data) {
    const base = defaultState();
    const merged = Object.assign(base, data || {});
    merged.meta = Object.assign(base.meta, data?.meta || {});
    merged.meta.version = APP_VERSION;
    merged.settings = Object.assign(base.settings, data?.settings || {});
    for (const key of ['vehicles','neighborhoods','employees','costCategories','reasons','deliveries','cycles','routeTracks','odometerLogs','costs','audit','dayClosures','trash']) {
      if (!Array.isArray(merged[key])) merged[key] = base[key];
    }
    merged.settings.appMode = merged.settings.appMode === 'training' ? 'training' : 'production';
    merged.settings.autoCycles = merged.settings.autoCycles !== false;
    for (const key of ['deliveries','cycles','odometerLogs','costs','dayClosures']) {
      merged[key].forEach(item => {
        if (!item.mode) item.mode = 'production';
        if (key === 'cycles' && item.autoGenerated === undefined) item.autoGenerated = false;
        if (key === 'deliveries') {
          for (const field of ['docNo','cashierNo','customerName','customerPhone','address','addressNumber','addressComplement','addressReference','scheduledTime','scheduleNotes','returnReasonId','returnReasonText']) {
            if (item[field] === undefined || item[field] === null) item[field] = '';
          }
          item.customerName = uppercaseName(item.customerName);
          item.customerPhone = formatPhoneBR(item.customerPhone);
          item.priority = item.priority === true;
          if (item.returnedUndelivered === undefined) item.returnedUndelivered = item.status === 'Devolvida';
        }
      });
    }
    merged.neighborhoods.forEach((item,index) => {
      item.name = uppercaseName(item.name);
      item.routeOrder = Number(item.routeOrder || index + 1);
      item.mapQuery = String(item.mapQuery || '').trim();
    });
    merged.cycles.forEach(item => {
      if (!Array.isArray(item.routeDeliveryIds)) item.routeDeliveryIds = [];
      if (!item.routeGeneratedAt) item.routeGeneratedAt = '';
    });
    merged.routeTracks.forEach(item => {
      if (!Array.isArray(item.points)) item.points = [];
      item.points = item.points.filter(point => point?.lat !== null && point?.lat !== undefined && point?.lat !== '' && point?.lng !== null && point?.lng !== undefined && point?.lng !== '' && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng))).map(point => ({
        lat:Number(point.lat), lng:Number(point.lng), accuracy:Number(point.accuracy || 0), speed:Number.isFinite(Number(point.speed)) ? Number(point.speed) : null,
        heading:Number.isFinite(Number(point.heading)) ? Number(point.heading) : null, at:point.at || nowISO()
      }));
      item.distanceKm = Number(item.distanceKm || 0);
      item.status = item.status || (item.endedAt ? 'completed' : 'ready');
      item.mode = item.mode || 'production';
    });
    merged.cycles.forEach(c => {
      if (merged.routeTracks.some(track=>track.cycleId===c.id)) return;
      merged.routeTracks.push({
        id:`route_${c.id}`,cycleId:c.id,date:c.date,driverId:c.driverId||'',vehicleId:c.vehicleId||'',mode:c.mode||'production',
        status:c.returnTime?'completed':'ready',startedAt:'',endedAt:c.returnTime&&c.date?`${c.date}T${c.returnTime}:00`:'',lastPointAt:'',
        distanceKm:0,points:[],createdAt:c.createdAt||nowISO(),updatedAt:c.updatedAt||nowISO()
      });
    });
    // Migração automática da V2: se existirem ciclos antigos com KM inicial/final,
    // cria um fechamento diário por veículo usando o menor KM inicial e o maior KM final do dia.
    const existingDailyKm = new Set(merged.odometerLogs.map(o => `${o.date}|${o.vehicleId}`));
    const legacyGroups = new Map();
    merged.cycles.forEach(c => {
      const start = Number(c.kmStart || 0), end = Number(c.kmEnd || 0);
      if (!c.date || !c.vehicleId || start <= 0 || end < start) return;
      const key = `${c.date}|${c.vehicleId}`;
      const prev = legacyGroups.get(key) || { date:c.date, vehicleId:c.vehicleId, starts:[], ends:[] };
      prev.starts.push(start); prev.ends.push(end); legacyGroups.set(key, prev);
    });
    legacyGroups.forEach((g,key) => {
      if (existingDailyKm.has(key)) return;
      merged.odometerLogs.push({
        id:uid('odo'), date:g.date, vehicleId:g.vehicleId,
        kmStart:Math.min(...g.starts), kmEnd:Math.max(...g.ends),
        notes:'Migrado automaticamente dos ciclos da versão anterior.',
        createdAt:nowISO(), updatedAt:nowISO(), migratedFromLegacyCycles:true
      });
    });
    return merged;
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => { dbHandle = request.result; resolve(dbHandle); };
      request.onerror = () => reject(request.error);
    });
  }

  function idbGet(key) {
    return new Promise((resolve, reject) => {
      const tx = dbHandle.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbSet(key, value) {
    return new Promise((resolve, reject) => {
      const tx = dbHandle.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function syncEntityKey(entityType, entityId) { return `${entityType}:${entityId}`; }
  function syncEntityMap(source = state) {
    const map = new Map();
    if (!source) return map;
    map.set(syncEntityKey('meta','main'), {entityType:'meta',entityId:'main',data:{version:APP_VERSION,createdAt:source.meta?.createdAt||nowISO()}});
    const cloudSettings={...(source.settings||{})};
    delete cloudSettings.appMode;
    map.set(syncEntityKey('settings','main'), {entityType:'settings',entityId:'main',data:cloudSettings});
    SYNC_COLLECTIONS.forEach(collection => {
      (source[collection]||[]).forEach(item => {
        if (!item?.id) return;
        map.set(syncEntityKey(collection,item.id), {entityType:collection,entityId:item.id,data:cloneData(item)});
      });
    });
    return map;
  }
  function serializedSyncData(value) { return JSON.stringify(value ?? null); }
  function syncOperationTime(value) {
    const parsed=Date.parse(value||'');
    return Number.isFinite(parsed)?parsed:0;
  }
  async function persistSyncControl() {
    if (!dbHandle) return;
    await Promise.all([idbSet(SYNC_QUEUE_KEY,syncQueue),idbSet(SYNC_SNAPSHOT_KEY,syncSnapshot)]);
  }
  function replaceQueuedOperation(operation) {
    const key=syncEntityKey(operation.entityType,operation.entityId);
    const index=syncQueue.findIndex(item=>syncEntityKey(item.entityType,item.entityId)===key);
    const entry={...operation,key,opId:uid('syncop')};
    if(index>=0)syncQueue[index]=entry;else syncQueue.push(entry);
  }
  async function queueStateChanges({forceAll=false,deferFlush=false}={}) {
    if (!syncReady || syncApplyingRemote || !state) return;
    const current=syncEntityMap(state);
    const changedAt=nowISO();
    current.forEach((entity,key)=>{
      const serialized=serializedSyncData(entity.data);
      if(forceAll || syncSnapshot[key]!==serialized){
        replaceQueuedOperation({...entity,deleted:false,changedAt});
        syncSnapshot[key]=serialized;
      }
    });
    if(!forceAll){
      Object.keys(syncSnapshot).forEach(key=>{
        if(current.has(key))return;
        const separator=key.indexOf(':');
        replaceQueuedOperation({entityType:key.slice(0,separator),entityId:key.slice(separator+1),data:null,deleted:true,changedAt});
        delete syncSnapshot[key];
      });
    }
    await persistSyncControl();
    if(!deferFlush)scheduleSyncFlush();
    updateConnectionStatus();
  }
  function scheduleSyncFlush(delay=180) {
    clearTimeout(syncFlushTimer);
    syncFlushTimer=setTimeout(()=>flushSyncQueue().catch(err=>console.warn('Sincronização pendente',err)),delay);
  }
  async function flushSyncQueue() {
    if(syncFlushing || !syncQueue.length || !navigator.onLine || !cloudClient || !cloudSession || !cloudWorkspace)return;
    syncFlushing=true;updateConnectionStatus();
    try{
      while(syncQueue.length && navigator.onLine){
        const batch=syncQueue.slice(0,100);
        const rows=batch.map(operation=>({
          workspace_id:cloudWorkspace.id,
          entity_type:operation.entityType,
          entity_id:operation.entityId,
          data:operation.deleted?null:operation.data,
          deleted_at:operation.deleted?operation.changedAt:null,
          client_updated_at:operation.changedAt,
          source_client_id:syncClientId
        }));
        const {data:confirmedRows,error}=await cloudClient.from('delivery_sync_entities').upsert(rows,{onConflict:'workspace_id,entity_type,entity_id'}).select('*');
        if(error)throw error;
        const completed=new Map(batch.map(operation=>[operation.key,operation.opId]));
        syncQueue=syncQueue.filter(operation=>completed.get(operation.key)!==operation.opId);
        syncApplyingRemote=true;
        (confirmedRows||[]).forEach(row=>{
          const key=syncEntityKey(row.entity_type,row.entity_id);
          const newerPending=syncQueue.find(operation=>operation.key===key&&syncOperationTime(operation.changedAt)>=syncOperationTime(row.client_updated_at));
          if(newerPending)return;
          applyEntityToState(row,state);
          if(row.deleted_at||row.data===null)delete syncSnapshot[key];else syncSnapshot[key]=serializedSyncData(row.data);
        });
        state=migrateState(state);
        await Promise.all([idbSet(STATE_KEY,state),persistSyncControl()]);
        syncApplyingRemote=false;
      }
      syncRealtimeStatus='SUBSCRIBED';
    }catch(err){
      syncRealtimeStatus='ERROR';
      console.warn('Não foi possível concluir a sincronização.',err);
    }finally{
      syncApplyingRemote=false;syncFlushing=false;updateConnectionStatus();
    }
  }
  function applyEntityToState(row,target=state) {
    const type=row.entity_type,id=row.entity_id,deleted=Boolean(row.deleted_at),data=row.data;
    if(type==='settings'){
      if(!deleted&&data){const localMode=target.settings?.appMode||'production';target.settings={...target.settings,...cloneData(data),appMode:localMode};}
      return;
    }
    if(type==='meta'){
      if(!deleted&&data)target.meta={...target.meta,...cloneData(data),version:APP_VERSION};
      return;
    }
    if(!SYNC_COLLECTIONS.includes(type))return;
    target[type]||=[];
    const index=target[type].findIndex(item=>item.id===id);
    if(deleted){if(index>=0)target[type].splice(index,1);return;}
    if(!data)return;
    if(index>=0)target[type][index]=cloneData(data);else target[type].push(cloneData(data));
  }
  async function restoreStateFromRemote(rows) {
    const localMode=currentMode();
    const restored=defaultState();
    restored.settings.appMode=localMode;
    SYNC_COLLECTIONS.forEach(collection=>{restored[collection]=[];});
    const nextSnapshot={};
    rows.forEach(row=>{
      applyEntityToState(row,restored);
      if(!row.deleted_at&&row.data!==null)nextSnapshot[syncEntityKey(row.entity_type,row.entity_id)]=serializedSyncData(row.data);
    });
    syncApplyingRemote=true;
    state=migrateState(restored);
    syncSnapshot=nextSnapshot;
    syncQueue=[];
    await Promise.all([idbSet(STATE_KEY,state),persistSyncControl()]);
    syncApplyingRemote=false;
    refreshYearOptions();refreshWeekOptions();render();updateBadges();
  }
  function snapshotFromRemoteRows(rows) {
    const snapshot={};
    rows.forEach(row=>{if(!row.deleted_at&&row.data!==null)snapshot[syncEntityKey(row.entity_type,row.entity_id)]=serializedSyncData(row.data);});
    return snapshot;
  }
  function operationalRecordCount(source=state) {
    return ['deliveries','cycles','odometerLogs','costs','dayClosures'].reduce((total,collection)=>total+(source?.[collection]?.length||0),0);
  }
  function entityDataTime(data) {
    if(!data||typeof data!=='object')return 0;
    return Math.max(...['updatedAt','createdAt','at','deletedAt'].map(field=>syncOperationTime(data[field])),0);
  }
  async function keepLocalStateOverRemote(rows) {
    syncSnapshot=snapshotFromRemoteRows(rows);
    await persistSyncControl();
    await queueStateChanges({deferFlush:true});
  }
  async function mergeInitialLocalAndRemote(rows) {
    const localEntities=syncEntityMap(state);
    syncSnapshot=snapshotFromRemoteRows(rows);
    syncApplyingRemote=true;
    rows.forEach(row=>{
      const key=syncEntityKey(row.entity_type,row.entity_id);
      const local=localEntities.get(key);
      if(!local){applyEntityToState(row,state);return;}
      const localTime=entityDataTime(local.data),remoteTime=syncOperationTime(row.client_updated_at);
      if(remoteTime>=localTime)applyEntityToState(row,state);
    });
    state=migrateState(state);
    await Promise.all([idbSet(STATE_KEY,state),persistSyncControl()]);
    syncApplyingRemote=false;
    await queueStateChanges({deferFlush:true});
    refreshYearOptions();refreshWeekOptions();render();updateBadges();
  }
  async function applyRemoteEntity(row,{renderAfter=true}={}) {
    if(!row?.entity_type||!row?.entity_id)return;
    const key=syncEntityKey(row.entity_type,row.entity_id);
    const pending=syncQueue.find(operation=>operation.key===key);
    if(pending&&syncOperationTime(pending.changedAt)>=syncOperationTime(row.client_updated_at))return;
    if(!pending&&row.source_client_id===syncClientId)return;
    if(pending)syncQueue=syncQueue.filter(operation=>operation.key!==key);
    syncApplyingRemote=true;
    applyEntityToState(row,state);
    state=migrateState(state);
    if(activeRouteCycleId && cycle(activeRouteCycleId)?.returnTime){
      const closedCycle=cycle(activeRouteCycleId),track=routeTrackForCycle(activeRouteCycleId);
      clearLocalRouteWatcher();
      if(track){track.status='completed';track.endedAt ||= `${closedCycle.date}T${closedCycle.returnTime}:00`;track.updatedAt=nowISO();}
    }
    if(row.deleted_at||row.data===null)delete syncSnapshot[key];else syncSnapshot[key]=serializedSyncData(row.data);
    await Promise.all([idbSet(STATE_KEY,state),persistSyncControl()]);
    syncApplyingRemote=false;
    if(renderAfter){refreshYearOptions();refreshWeekOptions();render();updateBadges();toast('Dados atualizados por outro aparelho.','success');}
  }
  async function fetchAllRemoteEntities() {
    const rows=[];let from=0;const pageSize=500;
    while(true){
      const {data,error}=await cloudClient.from('delivery_sync_entities').select('*').eq('workspace_id',cloudWorkspace.id).order('entity_type').order('entity_id').range(from,from+pageSize-1);
      if(error)throw error;
      rows.push(...(data||[]));
      if(!data||data.length<pageSize)break;
      from+=pageSize;
    }
    return rows;
  }
  async function subscribeToRemoteChanges() {
    if(realtimeChannel)await cloudClient.removeChannel(realtimeChannel).catch(()=>{});
    realtimeChannel=cloudClient.channel(`delivery-sync-${cloudWorkspace.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'delivery_sync_entities',filter:`workspace_id=eq.${cloudWorkspace.id}`},payload=>{
        const row=payload.new||payload.old;
        applyRemoteEntity(row).catch(err=>console.warn('Atualização remota pendente',err));
      })
      .subscribe(status=>{syncRealtimeStatus=status;updateConnectionStatus();});
  }
  async function connectCloudSession() {
    if(!cloudClient||!cloudSession||!navigator.onLine)return;
    const {data:workspace,error:workspaceError}=await cloudClient.from('delivery_workspaces').select('id,code,name').eq('code',SYNC_WORKSPACE_CODE).single();
    if(workspaceError)throw workspaceError;
    cloudWorkspace=workspace;
    try{localStorage.setItem('delivery_sync_workspace',JSON.stringify(workspace));}catch{}
    syncReady=true;
    if(Object.keys(syncSnapshot).length||syncQueue.length)await queueStateChanges({deferFlush:true});
    const rows=await fetchAllRemoteEntities();
    const hasLocalSync=Object.keys(syncSnapshot).length>0||syncQueue.length>0;
    if(!rows.length){
      syncSnapshot={};await persistSyncControl();await queueStateChanges({forceAll:true,deferFlush:true});
    }else if(!hasLocalSync){
      const localOperational=operationalRecordCount(state);
      const remoteOperational=rows.filter(row=>!row.deleted_at&&['deliveries','cycles','odometerLogs','costs','dayClosures'].includes(row.entity_type)).length;
      if((hadLocalStateBeforeSync||localOperational>0)&&remoteOperational===0)await keepLocalStateOverRemote(rows);
      else if(localOperational>0&&remoteOperational>0)await mergeInitialLocalAndRemote(rows);
      else await restoreStateFromRemote(rows);
    }else{
      for(const row of rows)await applyRemoteEntity(row,{renderAfter:false});
      refreshYearOptions();refreshWeekOptions();render();updateBadges();
    }
    await subscribeToRemoteChanges();
    await flushSyncQueue();
    hideCloudAuth();updateCloudAccountButton();updateConnectionStatus();
  }
  function lastCloudUsername() { try{return localStorage.getItem('delivery_last_username')||'';}catch{return '';} }
  function cloudUsername() { return cloudSession?.user?.email?.split('@')[0]||lastCloudUsername(); }
  function showCloudAuth(message='') {
    const screen=$('#cloudAuthScreen');if(!screen)return;
    screen.classList.remove('hidden');screen.setAttribute('aria-hidden','false');
    $('#cloudAuthMessage').textContent=message;
    const username=$('#cloudAuthForm [name="username"]');if(username&&!username.value)username.value=lastCloudUsername();
    $('#continueOfflineBtn').classList.toggle('hidden',!lastCloudUsername());
    $('#appShell').setAttribute('aria-hidden','true');
  }
  function hideCloudAuth() {
    const screen=$('#cloudAuthScreen');if(!screen)return;
    screen.classList.add('hidden');screen.setAttribute('aria-hidden','true');$('#appShell').removeAttribute('aria-hidden');
  }
  function updateCloudAccountButton() {
    const button=$('#syncAccountBtn');if(!button)return;
    button.hidden=!cloudSession;
    if(cloudSession)button.textContent=`☁ ${cloudUsername()||'Conta'} • Sair`;
  }
  async function cloudLogin(event) {
    event.preventDefault();
    const button=$('#cloudLoginBtn'),form=event.currentTarget;
    const values=Object.fromEntries(new FormData(form).entries());
    const username=String(values.username||'').trim().toLowerCase();
    if(!/^[a-z0-9._-]{3,40}$/.test(username)){showCloudAuth('Informe um usuário válido.');return;}
    if(!navigator.onLine){showCloudAuth('Sem internet. Conecte-se para entrar pela primeira vez.');return;}
    if(!cloudClient){showCloudAuth('O serviço de sincronização não carregou. Atualize a página com internet.');return;}
    button.disabled=true;button.textContent='Entrando...';$('#cloudAuthMessage').textContent='';
    try{
      const {data,error}=await cloudClient.auth.signInWithPassword({email:`${username}@${SUPABASE_LOGIN_DOMAIN}`,password:String(values.password||'')});
      if(error)throw error;
      cloudSession=data.session;
      try{localStorage.setItem('delivery_last_username',username);}catch{}
      await connectCloudSession();
      toast('Conta conectada. Sincronização em tempo real ativada.','success');
    }catch(err){
      showCloudAuth(/invalid login|credentials/i.test(err.message||'')?'Usuário ou senha incorretos.':`Não foi possível entrar: ${err.message||err}`);
    }finally{button.disabled=false;button.textContent='Entrar e sincronizar';}
  }
  async function cloudLogout() {
    if(!cloudClient||!cloudSession)return;
    if(!confirm('Sair da conta neste aparelho? Os dados locais continuarão guardados, mas a sincronização ficará pausada.'))return;
    if(realtimeChannel)await cloudClient.removeChannel(realtimeChannel).catch(()=>{});
    await cloudClient.auth.signOut();
    cloudSession=null;cloudWorkspace=null;syncReady=false;syncRealtimeStatus='DISCONNECTED';updateCloudAccountButton();updateConnectionStatus();showCloudAuth('Conta desconectada deste aparelho.');
  }
  function bindCloudEvents() {
    const form=$('#cloudAuthForm');
    if(form&&!form.dataset.bound){form.dataset.bound='true';form.addEventListener('submit',cloudLogin);}
    const offline=$('#continueOfflineBtn');
    if(offline&&!offline.dataset.bound){offline.dataset.bound='true';offline.addEventListener('click',()=>{hideCloudAuth();toast('Modo offline ativo. As alterações serão sincronizadas quando você entrar novamente.','warning');});}
    const account=$('#syncAccountBtn');
    if(account&&!account.dataset.bound){account.dataset.bound='true';account.addEventListener('click',cloudLogout);}
  }
  async function initializeCloudSync() {
    bindCloudEvents();
    if(!window.supabase?.createClient){
      showCloudAuth(lastCloudUsername()?'Biblioteca online indisponível. Você pode continuar com os dados deste aparelho.':'Conecte-se à internet para ativar o acesso em tempo real.');
      return;
    }
    cloudClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{storageKey:'nilo-delivery-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    cloudClient.auth.onAuthStateChange((event,session)=>{
      cloudSession=session;
      updateCloudAccountButton();updateConnectionStatus();
      if(event==='SIGNED_OUT'){syncReady=false;showCloudAuth('Sua sessão foi encerrada.');}
    });
    const {data}=await cloudClient.auth.getSession();
    cloudSession=data.session;
    if(!cloudSession){showCloudAuth();updateCloudAccountButton();return;}
    try{localStorage.setItem('delivery_last_username',cloudUsername());}catch{}
    if(!navigator.onLine){
      try{cloudWorkspace=JSON.parse(localStorage.getItem('delivery_sync_workspace')||'null');}catch{cloudWorkspace=null;}
      syncReady=Boolean(cloudWorkspace);hideCloudAuth();updateCloudAccountButton();updateConnectionStatus();return;
    }
    try{await connectCloudSession();}
    catch(err){console.warn(err);showCloudAuth(`Não foi possível conectar ao banco: ${err.message||err}`);}
  }
  async function resumeCloudSync() {
    if(!cloudClient)return initializeCloudSync();
    if(!cloudSession){const {data}=await cloudClient.auth.getSession();cloudSession=data.session;}
    if(cloudSession)await connectCloudSession().catch(err=>{syncRealtimeStatus='ERROR';console.warn(err);updateConnectionStatus();});
  }

  async function saveState(action = '') {
    state.meta.updatedAt = nowISO();
    if (action) state.audit.unshift({ id: uid('aud'), at: nowISO(), action });
    if (state.audit.length > 2000) state.audit = state.audit.slice(0, 2000);
    await idbSet(STATE_KEY, state);
    await queueStateChanges();
    updateBadges();
  }

  async function initialize() {
    try {
      await openDB();
      const stored = await idbGet(STATE_KEY);
      hadLocalStateBeforeSync = Boolean(stored);
      preUpdateBackup = await idbGet(PRE_UPDATE_BACKUP_KEY);
      syncQueue = await idbGet(SYNC_QUEUE_KEY) || [];
      syncSnapshot = await idbGet(SYNC_SNAPSHOT_KEY) || {};
      if (stored && stored?.meta?.version !== APP_VERSION) {
        const safetyCopy = { savedAt:nowISO(), fromVersion:stored?.meta?.version || 'anterior', state:cloneData(stored) };
        try {
          await idbSet(PRE_UPDATE_BACKUP_KEY,safetyCopy);
          preUpdateBackup = safetyCopy;
        } catch (backupError) {
          console.warn('Não foi possível manter a cópia local anterior à atualização.',backupError);
        }
      }
      state = migrateState(stored || defaultState());
      const autoCycleInit = autoIdentifyCyclesSync();
      if (!stored) await saveState('Sistema inicializado');
      else if (stored?.meta?.version !== APP_VERSION || autoCycleInit.changed) {
        const cycleMessage = autoCycleInit.changed
          ? ` • ${autoCycleInit.cyclesCreated} ciclo(s) automático(s) identificado(s) e ${autoCycleInit.deliveriesLinked} entrega(s) vinculada(s)`
          : '';
        await saveState(`Sistema atualizado para V${APP_VERSION}${cycleMessage}`);
      }
      bindStaticEvents();
      initPWA();
      updateConnectionStatus();
      window.addEventListener('online', () => { updateConnectionStatus(); resumeCloudSync().catch(console.warn); });
      window.addEventListener('offline', updateConnectionStatus);
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&activeRouteCycleId)requestRouteWakeLock();});
      window.addEventListener('pagehide',()=>{if(activeRouteCycleId)scheduleRouteTrackPersist(true);});
      refreshYearOptions();
      refreshWeekOptions();
      render();
      updateBadges();
      await sleep(250);
      $('#bootScreen').style.opacity = '0';
      setTimeout(() => $('#bootScreen').remove(), 260);
      $('#appShell').removeAttribute('aria-hidden');
      initializeCloudSync().catch(err=>{console.warn(err);showCloudAuth('Não foi possível iniciar a sincronização. Os dados locais foram mantidos.');});
    } catch (err) {
      console.error(err);
      $('#bootScreen').innerHTML = `<div class="boot-card"><div class="brand-mark large">!</div><h1>Não foi possível iniciar</h1><p>${esc(err.message || err)}</p></div>`;
    }
  }

  function initPWA() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js?v=14.8.0').catch(console.warn);
    }
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      $('#installBtn').hidden = false;
    });
    $('#installBtn').addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      $('#installBtn').hidden = true;
    });
  }

  function updateConnectionStatus() {
    const online = navigator.onLine;
    $('#connectionDot').className = `connection-dot ${online ? 'online' : 'offline'}`;
    if(!online){
      $('#connectionTitle').textContent=syncQueue.length?`Sem internet • ${syncQueue.length} alteração(ões) pendente(s)`:`Sem internet • ${modeLabel()}`;
      $('#connectionSubtitle').textContent=cloudSession?'Salvo neste aparelho • sincroniza automaticamente ao reconectar':'Modo offline local • entre na conta quando a internet voltar';
      return;
    }
    if(!cloudSession){
      $('#connectionTitle').textContent=`Online • login necessário`;
      $('#connectionSubtitle').textContent='Entre na conta para compartilhar os dados com o celular';
      return;
    }
    if(syncFlushing||syncQueue.length){
      $('#connectionTitle').textContent=`Sincronizando • ${syncQueue.length} alteração(ões)`;
      $('#connectionSubtitle').textContent='Enviando os lançamentos salvos neste aparelho';
      return;
    }
    if(syncRealtimeStatus==='SUBSCRIBED'){
      $('#connectionTitle').textContent=`Sincronizado em tempo real • ${cloudUsername()||modeLabel()}`;
      $('#connectionSubtitle').textContent='Celular e computador compartilham os mesmos dados';
      return;
    }
    $('#connectionTitle').textContent='Conectando ao banco online...';
    $('#connectionSubtitle').textContent='Os dados locais permanecem disponíveis durante a conexão';
  }

  async function switchMode(mode) {
    if (!['production','training'].includes(mode)) return;
    state.settings.appMode = mode;
    const autoCycleResult=autoIdentifyCyclesSync();
    await saveState(`Ambiente alterado para ${mode === 'training' ? 'treinamento' : 'operação real'}${autoCycleResult.cyclesCreated?` • ${autoCycleResult.cyclesCreated} ciclo(s) automático(s) identificado(s)`:''}`);
    updateConnectionStatus(); updateModeUI(); render();
    toast(mode === 'training' ? 'Modo treinamento ativado. Nada daqui afeta a operação real.' : 'Operação real ativada.', mode === 'training' ? 'warning' : 'success');
  }

  function updateModeUI() {
    const mode = currentMode();
    document.body.classList.toggle('training-mode', mode === 'training');
    $$('.mode-choice').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
    const top = $('#topModeBadge');
    if (top) { top.className = `top-mode-badge ${mode}`; top.textContent = mode === 'training' ? '🧪 Treinamento' : '● Operação real'; }
    const desktop = $('#desktopModeChip'); if (desktop) desktop.textContent = mode === 'training' ? '🧪 Ambiente de treinamento' : '● Ambiente real';
    const hint = $('#modeHint'); if (hint) hint.textContent = mode === 'training' ? 'Dados isolados para testes e capacitação.' : 'Dados oficiais da operação.';
  }

  function injectModeBanner() {
    if (currentMode() !== 'training') return;
    const view = $('#view'); if (!view || view.querySelector('.training-banner')) return;
    view.insertAdjacentHTML('afterbegin', `<section class="training-banner"><div class="training-banner-icon">🧪</div><div><strong>Modo treinamento ativo</strong><p>Teste entregas, ciclos, KM, custos, programações e exclusões sem afetar os dados reais.</p></div><div class="training-banner-actions"><button class="btn training-light small" data-training-action="seed">Criar dados de exemplo</button><button class="btn training-danger small" data-training-action="clear">Limpar treinamento</button></div></section>`);
    view.querySelector('[data-training-action="seed"]')?.addEventListener('click', seedTrainingData);
    view.querySelector('[data-training-action="clear"]')?.addEventListener('click', clearTrainingData);
  }

  function bindStaticEvents() {
    $('#mainNav').addEventListener('click', e => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      navigate(btn.dataset.view);
    });
    $('#menuBtn').addEventListener('click', () => toggleSidebar(true));
    $('#sidebarOverlay').addEventListener('click', () => toggleSidebar(false));
    $('#quickNewDeliveryBtn').addEventListener('click', () => openDeliveryModal());
    $('#mobileNewDeliveryBtn')?.addEventListener('click', () => openDeliveryModal());
    $('#mobileMenuBtn')?.addEventListener('click', () => toggleSidebar(true));
    $$('[data-mobile-view]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.mobileView)));
    $('#modalClose').addEventListener('click', closeModal);
    $('#modalWrap').addEventListener('click', e => { if (e.target === $('#modalWrap')) closeModal(); });
    document.addEventListener('keydown', handleModalKeydown);
    $('#applyFiltersBtn').addEventListener('click', render);
    $('#clearFiltersBtn').addEventListener('click', () => {
      $('#filterMonth').value = '';
      $('#filterWeek').value = '';
      $('#filterStart').value = '';
      $('#filterEnd').value = '';
      deliverySearch = { identifier: '', cashier: '', date: '', customerName: '' };
      render();
    });
    $('#filterYear').addEventListener('change', refreshWeekOptions);
    $('#filterMonth').addEventListener('change', refreshWeekOptions);
    $('#backupBtn').addEventListener('click', downloadBackup);
    $('#restoreInput').addEventListener('change', e => { if (e.target.files?.[0]) restoreBackup(e.target.files[0]); e.target.value = ''; });
    $$('.mode-choice').forEach(btn => btn.addEventListener('click', () => switchMode(btn.dataset.mode)));
  }

  function toggleSidebar(open) {
    $('#sidebar').classList.toggle('open', open);
    $('#sidebarOverlay').classList.toggle('open', open);
    document.body.classList.toggle('sidebar-open', open);
  }

  function navigate(view) {
    currentView = view;
    $$('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    $$('[data-mobile-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.mobileView === view));
    const [title, subtitle] = pageMeta[view];
    $('#pageTitle').textContent = title;
    $('#pageSubtitle').textContent = subtitle;
    toggleSidebar(false);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function refreshYearOptions() {
    const currentYear = new Date().getFullYear();
    const years = new Set(Array.from({length:YEAR_PAST_RANGE+YEAR_FUTURE_RANGE+1},(_,index)=>currentYear-YEAR_PAST_RANGE+index));
    [...scoped(state.deliveries), ...scoped(state.cycles), ...scoped(state.routeTracks), ...scoped(state.odometerLogs), ...scoped(state.costs)].forEach(item => {
      const year=Number(item.date?.slice(0,4)); if(Number.isInteger(year))years.add(year);
    });
    const select = $('#filterYear');
    const previous = select.value || String(currentYear);
    select.innerHTML = [...years].sort((a,b) => b-a).map(y => `<option value="${y}">${y}</option>`).join('');
    select.value = [...years].includes(Number(previous)) ? previous : String(currentYear);
  }

  function refreshWeekOptions() {
    const year = Number($('#filterYear').value || new Date().getFullYear());
    const month = $('#filterMonth').value;
    const select = $('#filterWeek');
    const prev = select.value;
    const weeks = [];
    const start = month ? new Date(year, Number(month)-1, 1) : new Date(year,0,1);
    const end = month ? new Date(year, Number(month), 0) : new Date(year,11,31);
    let cursor = new Date(start);
    while (cursor <= end) {
      const iso = localDateISO(cursor);
      const monday = startOfWeek(iso);
      if (!weeks.includes(monday)) weeks.push(monday);
      cursor.setDate(cursor.getDate() + 1);
    }
    select.innerHTML = `<option value="">Todas</option>` + weeks.map((monday, i) => `<option value="${monday}">Semana ${i+1} • ${dateBR(monday)}</option>`).join('');
    if (weeks.includes(prev)) select.value = prev;
  }

  function selectedRange() {
    const year = $('#filterYear').value;
    const month = $('#filterMonth').value;
    const week = $('#filterWeek').value;
    const customStart = $('#filterStart').value;
    const customEnd = $('#filterEnd').value;
    if (customStart || customEnd) return { start: customStart || '0000-01-01', end: customEnd || '9999-12-31', label: `${dateBR(customStart)} a ${dateBR(customEnd)}` };
    if (week) return { start: week, end: endOfWeek(week), label: `Semana de ${dateBR(week)}` };
    if (month) {
      const last = new Date(Number(year), Number(month), 0).getDate();
      return { start: `${year}-${month}-01`, end: `${year}-${month}-${String(last).padStart(2,'0')}`, label: `${monthNames[Number(month)-1]} de ${year}` };
    }
    return { start: `${year}-01-01`, end: `${year}-12-31`, label: `Ano ${year}` };
  }

  function inRange(date, range = selectedRange()) {
    return Boolean(date) && date >= range.start && date <= range.end;
  }
  function filteredDeliveries() { const r = selectedRange(); return scoped(state.deliveries).filter(d => inRange(d.date, r)); }
  function filteredCycles() { const r = selectedRange(); return scoped(state.cycles).filter(d => inRange(d.date, r)); }
  function filteredRouteTracks() {
    const range = selectedRange();
    return scoped(state.routeTracks).filter(track => inRange(track.date,range) && (!routeHistoryDriverId || track.driverId === routeHistoryDriverId));
  }
  function filteredOdometers() { const r = selectedRange(); return scoped(state.odometerLogs).filter(d => inRange(d.date, r)); }
  function filteredCosts() { const r = selectedRange(); return scoped(state.costs).filter(d => inRange(d.date, r)); }

  function normalizeDeliverySearch(value) {
    return String(value ?? '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  function deliveryMatchesSearch(delivery, search = deliverySearch) {
    const identifier = normalizeDeliverySearch(search.identifier);
    const cashier = normalizeDeliverySearch(search.cashier);
    const date = String(search.date || '').trim();
    const customerName = normalizeDeliverySearch(search.customerName);
    const identifiers = [delivery.orderNo, delivery.coupon, delivery.docNo].map(normalizeDeliverySearch);
    return (!identifier || identifiers.includes(identifier))
      && (!cashier || normalizeDeliverySearch(delivery.cashierNo) === cashier)
      && (!date || delivery.date === date)
      && (!customerName || normalizeDeliverySearch(delivery.customerName).includes(customerName));
  }

  function searchedDeliveries() {
    const active = Object.values(deliverySearch).some(value => String(value || '').trim());
    const source = active ? scoped(state.deliveries) : filteredDeliveries();
    return source.filter(delivery => deliveryMatchesSearch(delivery));
  }

  function startOfWeek(dateStr) {
    const date = new Date(`${dateStr}T12:00:00`);
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    return localDateISO(date);
  }
  function endOfWeek(dateStr) {
    const date = new Date(`${startOfWeek(dateStr)}T12:00:00`);
    date.setDate(date.getDate() + 6);
    return localDateISO(date);
  }

  function timeToMinutes(time) {
    if (!time) return null;
    const [h,m] = String(time).split(':').map(Number);
    return h*60 + m;
  }
  function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = minutes % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  function toDateTime(date, time) {
    if (!date || !time) return null;
    return new Date(`${date}T${time}:00`);
  }
  function durationMinutes(startDate, startTime, endDate, endTime) {
    const a = toDateTime(startDate,startTime), b = toDateTime(endDate,endTime);
    if (!a || !b || b < a) return null;
    return Math.round((b-a)/60000);
  }
  function workingMinutesBetween(startDate,startTime,endDate,endTime) {
    const start = toDateTime(startDate,startTime), end = toDateTime(endDate,endTime);
    if (!start || !end || end < start) return null;
    const s = state.settings;
    const windows = [[s.workStart,s.lunchStart],[s.lunchEnd,s.workEnd]];
    let total = 0;
    const cursor = new Date(start.getFullYear(),start.getMonth(),start.getDate());
    const last = new Date(end.getFullYear(),end.getMonth(),end.getDate());
    while (cursor <= last) {
      const day = localDateISO(cursor);
      for (const [a,b] of windows) {
        const ws = toDateTime(day,a), we = toDateTime(day,b);
        const actualStart = new Date(Math.max(start, ws));
        const actualEnd = new Date(Math.min(end, we));
        if (actualEnd > actualStart) total += (actualEnd-actualStart)/60000;
      }
      cursor.setDate(cursor.getDate()+1);
    }
    return Math.round(total);
  }
  function fmtMinutes(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    const mins = Math.max(0, Math.round(Number(value)));
    const h = Math.floor(mins/60), m = mins%60;
    return h ? `${h}h ${String(m).padStart(2,'0')}min` : `${m}min`;
  }

  function vehicle(id) { return state.vehicles.find(v => v.id === id); }
  function neighborhood(id) { return state.neighborhoods.find(v => v.id === id); }
  function employee(id) { return state.employees.find(v => v.id === id); }
  function category(id) { return state.costCategories.find(v => v.id === id); }
  function reason(id) { return state.reasons.find(v => v.id === id); }
  function cycle(id) { return state.cycles.find(v => v.id === id); }

  function routeCityLabel() {
    return String(state?.settings?.routeCity || state?.settings?.locationName || 'Nova Xavantina - MT')
      .replace(/\s*[•|]\s*/g, ', ')
      .trim();
  }
  function routeOriginLabel() {
    return String(state?.settings?.routeOrigin || `Nilo Supermercado, ${routeCityLabel()}`).trim();
  }
  function deliveryAddressLine(d, includeReference = false) {
    const street = String(d?.address || '').trim();
    const numberText = String(d?.addressNumber || '').trim();
    const complement = String(d?.addressComplement || '').trim();
    const reference = String(d?.addressReference || '').trim();
    const primary = [street, numberText ? `nº ${numberText}` : ''].filter(Boolean).join(', ');
    const parts = [primary, complement].filter(Boolean);
    if (includeReference && reference) parts.push(`Ref.: ${reference}`);
    return parts.join(' • ');
  }
  function deliveryHasPreciseAddress(d) {
    return Boolean(String(d?.address || '').trim() && String(d?.addressNumber || '').trim());
  }
  function deliveryMapQuery(d) {
    const nb = neighborhood(d?.neighborhoodId);
    const city = routeCityLabel();
    if (deliveryHasPreciseAddress(d)) {
      return [String(d.address).trim(), String(d.addressNumber).trim(), nb?.name || '', city, 'Brasil'].filter(Boolean).join(', ');
    }
    const neighborhoodQuery = String(nb?.mapQuery || '').trim() || nb?.name || '';
    if (!neighborhoodQuery) return '';
    return [neighborhoodQuery, city, 'Brasil'].filter(Boolean).join(', ');
  }
  function routeSortDeliveries(deliveries) {
    return (deliveries || []).slice().sort((a,b) => {
      const priority = Number(Boolean(b.priority)) - Number(Boolean(a.priority));
      if (priority) return priority;
      const neighborhoodA = neighborhood(a.neighborhoodId);
      const neighborhoodB = neighborhood(b.neighborhoodId);
      const orderA = Number(neighborhoodA?.routeOrder || 9999);
      const orderB = Number(neighborhoodB?.routeOrder || 9999);
      if (orderA !== orderB) return orderA - orderB;
      const neighborhoodName = String(neighborhoodA?.name || '').localeCompare(String(neighborhoodB?.name || ''), 'pt-BR');
      if (neighborhoodName) return neighborhoodName;
      const address = `${a.address || ''}|${a.addressNumber || ''}`.localeCompare(`${b.address || ''}|${b.addressNumber || ''}`, 'pt-BR', {numeric:true});
      if (address) return address;
      return `${a.purchaseTime || ''}|${a.createdAt || ''}`.localeCompare(`${b.purchaseTime || ''}|${b.createdAt || ''}`);
    });
  }
  function cycleRouteDeliveries(c) {
    return routeSortDeliveries(scoped(state.deliveries).filter(d => d.cycleId === c?.id));
  }
  function routeStopsForDeliveries(deliveries) {
    const stops = [];
    const byQuery = new Map();
    routeSortDeliveries(deliveries).forEach(d => {
      const query = deliveryMapQuery(d);
      if (!query) return;
      const key = query.toLocaleUpperCase('pt-BR');
      let stop = byQuery.get(key);
      if (!stop) {
        stop = { query, precise:deliveryHasPreciseAddress(d), deliveries:[], priority:false };
        byQuery.set(key, stop);
        stops.push(stop);
      }
      stop.deliveries.push(d);
      stop.priority ||= Boolean(d.priority);
    });
    return stops;
  }
  function googleMapsDirectionsUrl(origin, destination, waypoints = []) {
    const params = new URLSearchParams({ api:'1', origin, destination, travelmode:'driving', dir_action:'navigate' });
    if (waypoints.length) params.set('waypoints', waypoints.join('|'));
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }
  function googleMapsFullRouteUrl(stops) {
    if (!stops.length || stops.length > 9) return '';
    const origin = routeOriginLabel();
    const url = googleMapsDirectionsUrl(origin, origin, stops.map(stop=>stop.query));
    return url.length <= 1950 ? url : '';
  }
  function googleMapsRouteSegments(stops) {
    if (!stops.length) return [];
    const store = routeOriginLabel();
    const segments = [];
    let currentOrigin = store;
    for (let index = 0; index < stops.length; index += 3) {
      const chunk = stops.slice(index,index+3);
      const finalChunk = index + 3 >= stops.length;
      const destination = finalChunk ? store : chunk.at(-1).query;
      const waypoints = (finalChunk ? chunk : chunk.slice(0,-1)).map(stop=>stop.query);
      segments.push({
        label:`Trecho ${segments.length + 1}`,
        start:index + 1,
        end:index + chunk.length,
        returnsToStore:finalChunk,
        url:googleMapsDirectionsUrl(currentOrigin,destination,waypoints)
      });
      currentOrigin = chunk.at(-1).query;
    }
    return segments;
  }
  function openExternalRoute(url) {
    if (!url) { toast('Não foi possível montar o endereço do Google Maps.','warning'); return; }
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function routeTrackForCycle(cycleId) {
    return state.routeTracks.find(track => track.cycleId === cycleId);
  }
  function ensureRouteTrack(c) {
    let track = routeTrackForCycle(c.id);
    if (track) return track;
    const now = nowISO();
    track = {
      id:`route_${c.id}`, cycleId:c.id, date:c.date, driverId:c.driverId || '', vehicleId:c.vehicleId || '', mode:c.mode || currentMode(),
      status:c.returnTime ? 'completed' : 'ready', startedAt:'', endedAt:c.returnTime ? `${c.date}T${c.returnTime}:00` : '', lastPointAt:'',
      distanceKm:0, points:[], createdAt:now, updatedAt:now
    };
    state.routeTracks.push(track);
    return track;
  }
  function haversineKm(a,b) {
    const radius = 6371;
    const lat1 = Number(a.lat) * Math.PI / 180, lat2 = Number(b.lat) * Math.PI / 180;
    const deltaLat = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
    const deltaLng = (Number(b.lng) - Number(a.lng)) * Math.PI / 180;
    const value = Math.sin(deltaLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng/2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(value),Math.sqrt(1-value));
  }
  function routeTrackDurationMinutes(track) {
    if (!track?.startedAt) return null;
    const end = track.endedAt || nowISO();
    const minutes = Math.round((new Date(end) - new Date(track.startedAt)) / 60000);
    return Number.isFinite(minutes) && minutes >= 0 ? minutes : null;
  }
  function routeTrackStatusLabel(track) {
    if (track.status === 'recording') return 'GPS ativo';
    if (track.status === 'completed') return track.points.length ? 'Trajeto concluído' : 'Ciclo sem pontos GPS';
    if (track.status === 'permission-denied') return 'Permissão de localização negada';
    if (track.status === 'unavailable') return 'GPS indisponível';
    if (track.status === 'paused') return 'GPS pausado';
    return 'Aguardando ativação do GPS';
  }
  async function requestRouteWakeLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try { routeWakeLock = await navigator.wakeLock.request('screen'); }
    catch { routeWakeLock = null; }
  }
  async function releaseRouteWakeLock() {
    try { await routeWakeLock?.release(); } catch {}
    routeWakeLock = null;
  }
  function clearLocalRouteWatcher() {
    if (activeRouteWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(activeRouteWatchId);
    activeRouteWatchId = null;
    activeRouteCycleId = '';
    clearTimeout(routeTrackPersistTimer);
    routeTrackPersistTimer = null;
    releaseRouteWakeLock();
  }
  async function persistRouteTrack() {
    if (routeTrackPersisting) return;
    routeTrackPersisting = true;
    try { await saveState(); }
    finally { routeTrackPersisting = false; }
  }
  function scheduleRouteTrackPersist(immediate = false) {
    clearTimeout(routeTrackPersistTimer);
    if (immediate) { persistRouteTrack().catch(console.warn); return; }
    routeTrackPersistTimer = setTimeout(() => persistRouteTrack().catch(console.warn),20000);
  }
  function appendRoutePosition(cycleId,position) {
    const c = cycle(cycleId); if (!c || c.returnTime) return;
    const track = ensureRouteTrack(c);
    const coords = position.coords || {};
    const point = {
      lat:Number(coords.latitude), lng:Number(coords.longitude), accuracy:Number(coords.accuracy || 0),
      speed:Number.isFinite(Number(coords.speed)) ? Number(coords.speed) : null,
      heading:Number.isFinite(Number(coords.heading)) ? Number(coords.heading) : null,
      at:new Date(position.timestamp || Date.now()).toISOString()
    };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || point.accuracy > 250) return;
    const previous = track.points.at(-1);
    if (previous) {
      const distance = haversineKm(previous,point);
      const elapsedSeconds = Math.max(1,(new Date(point.at) - new Date(previous.at)) / 1000);
      if (distance < 0.012 && elapsedSeconds < 60) return;
      if (distance > 3 && elapsedSeconds < 45) return;
      track.distanceKm = Number(track.distanceKm || 0) + distance;
    }
    track.points.push(point);
    if (track.points.length > 12000) track.points = track.points.filter((_,index) => index % 2 === 0 || index === track.points.length - 1);
    track.startedAt ||= point.at;
    track.lastPointAt = point.at;
    track.status = 'recording';
    track.updatedAt = nowISO();
    scheduleRouteTrackPersist(track.points.length === 1 || track.points.length % 8 === 0);
    if (currentView === 'route-history' && track.points.length % 5 === 0) render();
  }
  async function startRouteTracking(cycleId,{automatic=false}={}) {
    const c = scoped(state.cycles).find(item => item.id === cycleId);
    if (!c || c.returnTime) { if (!automatic) toast('Este ciclo já está encerrado.','warning'); return; }
    if (!navigator.geolocation) {
      const track = ensureRouteTrack(c); track.status = 'unavailable'; track.updatedAt = nowISO(); await saveState();
      toast('Este aparelho não disponibilizou o GPS para o navegador.','error'); render(); return;
    }
    if (activeRouteCycleId === cycleId && activeRouteWatchId !== null) { if (!automatic) toast('O GPS já está registrando este ciclo.','success'); return; }
    if (activeRouteWatchId !== null) await stopRouteTracking(activeRouteCycleId,{completed:false,silent:true});
    const track = ensureRouteTrack(c);
    track.status = 'recording'; track.startedAt ||= nowISO(); track.endedAt = ''; track.updatedAt = nowISO();
    activeRouteCycleId = cycleId;
    await saveState(automatic ? '' : `GPS ativado no ciclo ${c.code}`);
    await requestRouteWakeLock();
    activeRouteWatchId = navigator.geolocation.watchPosition(
      position => appendRoutePosition(cycleId,position),
      async error => {
        const current = routeTrackForCycle(cycleId); if (!current) return;
        current.status = error.code === 1 ? 'permission-denied' : 'unavailable'; current.updatedAt = nowISO();
        clearLocalRouteWatcher(); await saveState(); render();
        if (!automatic || error.code === 1) toast(error.code === 1 ? 'Permita o acesso à localização para registrar o trajeto.' : 'O GPS não conseguiu obter a localização. Tente novamente.','error');
      },
      {enableHighAccuracy:true,maximumAge:10000,timeout:25000}
    );
    if (!automatic) toast('GPS ativado. Mantenha o aplicativo aberto durante a rota.','success');
    render();
  }
  async function stopRouteTracking(cycleId,{completed=false,silent=false}={}) {
    const c = cycle(cycleId); const track = routeTrackForCycle(cycleId);
    if (activeRouteCycleId === cycleId) clearLocalRouteWatcher();
    if (track) {
      track.status = completed ? 'completed' : 'paused';
      if (completed) track.endedAt = nowISO();
      track.updatedAt = nowISO();
      await saveState(completed ? '' : `GPS pausado no ciclo ${c?.code || cycleId}`);
    }
    if (!silent) toast(completed ? 'Trajeto GPS encerrado e salvo.' : 'GPS pausado. Você pode retomá-lo no ciclo.','success');
    render();
  }
  function shouldAutoStartRouteTracking() {
    return matchMedia('(max-width: 820px)').matches || Number(navigator.maxTouchPoints || 0) > 0;
  }
  function sampleRoutePoints(points,maxPoints=10) {
    if (points.length <= maxPoints) return points;
    return Array.from({length:maxPoints},(_,index)=>points[Math.round(index * (points.length - 1) / (maxPoints - 1))]);
  }
  function recordedTrackGoogleMapsUrl(track) {
    const points = sampleRoutePoints(track?.points || [],10);
    if (points.length < 2) return '';
    const coordinates = points.map(point=>`${Number(point.lat).toFixed(6)},${Number(point.lng).toFixed(6)}`);
    return googleMapsDirectionsUrl(coordinates[0],coordinates.at(-1),coordinates.slice(1,-1));
  }
  function openRecordedTrackInMaps(trackId) {
    const track = state.routeTracks.find(item=>item.id===trackId);
    const url = recordedTrackGoogleMapsUrl(track);
    if (!url) { toast('Este trajeto ainda não possui pontos GPS suficientes.','warning'); return; }
    openExternalRoute(url);
  }
  function cycleTrackActionHTML(c) {
    const track = routeTrackForCycle(c.id);
    if (!c.returnTime) {
      const active = activeRouteCycleId === c.id && activeRouteWatchId !== null;
      return `<button class="btn ${active?'gps-live-btn':'secondary'} small" data-action="${active?'pause-route-gps':'start-route-gps'}" data-id="${c.id}">${active?'● GPS ativo':'⌖ Ativar GPS'}</button>`;
    }
    if (track?.points?.length) return `<button class="btn secondary small" data-action="view-route-track" data-id="${track.id}">⌁ Ver trajeto</button>`;
    return '';
  }
  function routeDeliveryMarkers(track) {
    if (!track?.points?.length) return [];
    return scoped(state.deliveries).filter(d=>d.cycleId===track.cycleId && d.finalizationTime).map(d=>{
      const at = new Date(`${d.date}T${d.finalizationTime}:00`).getTime();
      const point = track.points.reduce((best,current)=>Math.abs(new Date(current.at).getTime()-at)<Math.abs(new Date(best.at).getTime()-at)?current:best,track.points[0]);
      return {point,label:d.orderNo || d.docNo || d.coupon || '•',delivery:d};
    });
  }
  function routeTracksMapHTML(tracks,selectedId='') {
    const visible = tracks.filter(track=>track.points?.length);
    if (!visible.length) return `<div class="route-map-empty"><span>⌁</span><strong>Nenhum ponto GPS neste período</strong><p>Ative o GPS em um ciclo aberto pelo celular. Os pontos ficam guardados offline e aparecem aqui após a sincronização.</p></div>`;
    const allPoints = visible.flatMap(track=>track.points);
    let minLat=Infinity,maxLat=-Infinity,minLng=Infinity,maxLng=-Infinity;
    allPoints.forEach(point=>{minLat=Math.min(minLat,point.lat);maxLat=Math.max(maxLat,point.lat);minLng=Math.min(minLng,point.lng);maxLng=Math.max(maxLng,point.lng);});
    if (maxLat-minLat < .0008) { minLat-=.0004; maxLat+=.0004; }
    if (maxLng-minLng < .0008) { minLng-=.0004; maxLng+=.0004; }
    const width=900,height=430,padding=34;
    const project=point=>({x:padding+(point.lng-minLng)/(maxLng-minLng)*(width-padding*2),y:padding+(maxLat-point.lat)/(maxLat-minLat)*(height-padding*2)});
    const colors=['#45D5A3','#F2B523','#62A8FF','#D87CEB','#FF7A73','#64D3EE'];
    const paths=visible.map((track,index)=>{
      const color=colors[index%colors.length],selected=track.id===selectedId;
      const points=track.points.map(point=>{const p=project(point);return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;}).join(' ');
      const first=project(track.points[0]),last=project(track.points.at(-1));
      const markers=routeDeliveryMarkers(track).map(marker=>{const p=project(marker.point);return `<g class="route-delivery-marker"><circle cx="${p.x}" cy="${p.y}" r="11" fill="#F2B523" stroke="#172F42" stroke-width="2"/><text x="${p.x}" y="${p.y+3}" text-anchor="middle">${esc(String(marker.label).slice(-3))}</text></g>`;}).join('');
      return `<g class="route-map-line ${selected?'selected':''}"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="${selected?7:4}" stroke-linecap="round" stroke-linejoin="round" opacity="${selected?1:.72}"/><circle cx="${first.x}" cy="${first.y}" r="7" fill="#45D5A3" stroke="#fff" stroke-width="2"/><circle cx="${last.x}" cy="${last.y}" r="7" fill="#FF7A73" stroke="#fff" stroke-width="2"/>${markers}</g>`;
    }).join('');
    return `<div class="route-map-canvas"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mapa dos trajetos GPS do período"><defs><pattern id="routeGrid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" rx="18" fill="#193444"/><rect width="100%" height="100%" rx="18" fill="url(#routeGrid)"/>${paths}</svg><div class="route-map-legend"><span><i class="start"></i>Início</span><span><i class="end"></i>Fim</span><span><i class="delivery"></i>Entrega</span></div></div>`;
  }


  function currentTimeHM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function isRootPurchase(d) { return !d.parentId; }
  function rootDelivery(d) {
    const rootId = d?.rootId || d?.id;
    return scoped(state.deliveries).find(x => x.id === rootId) || d;
  }
  function financialsForRange(range) {
    const purchases = scoped(state.deliveries).filter(d => isRootPurchase(d) && inRange(d.date, range));
    const refunds = scoped(state.deliveries).filter(d => isRootPurchase(d) && Number(d.refundAmount || 0) > 0 && d.refundDate && inRange(d.refundDate, range));
    const gross = sum(purchases.map(d => d.fee));
    const refundTotal = sum(refunds.map(d => d.refundAmount));
    return { purchases, refunds, gross, refundTotal, net: gross - refundTotal };
  }
  function netRevenueOfRoot(d) {
    const root = rootDelivery(d);
    return Math.max(0, Number(root?.fee || 0) - Number(root?.refundAmount || 0));
  }
  function revenueAttributedTo(records) {
    const roots = unique(records.map(d => d.rootId || d.id));
    const rootsById = new Map(scoped(state.deliveries).filter(isRootPurchase).map(root=>[root.id,root]));
    return sum(roots.map(id => {
      const root = rootsById.get(id);
      return root ? Math.max(0,Number(root.fee||0)-Number(root.refundAmount||0)) : 0;
    }));
  }
  function currentWaitMinutes(d) {
    if (scheduledSlaExempt(d)) return null;
    if (!d.purchaseTime || isFinal(d)) return null;
    if (d.departureTime) return deliveryCalc(d).wait;
    if (!['Na loja','Em rota'].includes(d.status)) return null;
    const endDate = todayISO();
    const endTime = currentTimeHM();
    if (d.date > endDate) return null;
    return durationMinutes(d.date, d.purchaseTime, endDate, endTime);
  }

  function currentPurchaseToClientMinutes(d) {
    if (scheduledSlaExempt(d)) return null;
    if (!d.purchaseTime || d.date > todayISO()) return null;
    if (d.finalizationTime) return deliveryCalc(d).purchaseToClient;
    if (isFinal(d)) return null;
    if (!['Na loja','Em rota'].includes(d.status)) return null;
    return durationMinutes(d.date, d.purchaseTime, todayISO(), currentTimeHM());
  }

  function completionProgress(d) {
    const elapsed = currentPurchaseToClientMinutes(d);
    const limit = Number(state.settings.completionLimitMinutes || 210);
    return {
      elapsed,
      balance: elapsed === null ? null : limit - elapsed,
      outside: elapsed !== null && elapsed > limit
    };
  }

  function deliveryCalc(d) {
    const slaExempt = scheduledSlaExempt(d);
    const wait = !slaExempt && d.purchaseTime && d.departureTime ? durationMinutes(d.date,d.purchaseTime,d.date,d.departureTime) : null;
    const toClient = d.departureTime && d.finalizationTime ? durationMinutes(d.date,d.departureTime,d.date,d.finalizationTime) : null;
    const purchaseToClient = !slaExempt && d.purchaseTime && d.finalizationTime ? durationMinutes(d.date,d.purchaseTime,d.date,d.finalizationTime) : null;
    const route = d.departureTime && d.returnTime ? durationMinutes(d.date,d.departureTime,d.date,d.returnTime) : null;
    const departureLimit = Number(state.settings.delayMinutes || 120);
    const completionLimit = Number(state.settings.completionLimitMinutes || 210);
    return {
      wait, toClient, purchaseToClient, route, slaExempt,
      delayed: wait !== null && wait > departureLimit,
      completionDelayed: purchaseToClient !== null && purchaseToClient > completionLimit
    };
  }
  function deliveryStandardBadges(d, calc = deliveryCalc(d)) {
    if (calc.slaExempt) return '<span class="standard-badges"><span class="badge purple">Agendada • fora do indicador de atraso</span></span>';
    const liveWait = calc.wait === null ? currentWaitMinutes(d) : calc.wait;
    const progress = completionProgress(d);
    const departure = liveWait === null
      ? '<span class="badge gray">Saída não calculada</span>'
      : liveWait > Number(state.settings.delayMinutes || 120)
        ? '<span class="badge red">Saída &gt; 2h</span>'
        : d.departureTime
          ? '<span class="badge green">Saída OK</span>'
          : '<span class="badge yellow">Saída em andamento</span>';
    const completion = progress.elapsed === null
      ? '<span class="badge gray">Entrega não calculada</span>'
      : progress.outside
        ? '<span class="badge red">Entrega &gt; 3h30</span>'
        : d.finalizationTime
          ? '<span class="badge green">Entrega OK</span>'
          : '<span class="badge yellow">Entrega em andamento</span>';
    return `<span class="standard-badges">${departure}${completion}</span>`;
  }
  function cycleCalc(c) {
    // CICLO = uma saída da loja até o retorno ao mercado.
    // Todas as entregas levadas naquela mesma saída compartilham o mesmo cycleId.
    const carriedDeliveries = scoped(state.deliveries).filter(d => d.cycleId === c.id);
    const delivered = carriedDeliveries.filter(deliveredToCustomer);
    const returned = carriedDeliveries.filter(d => d.returnedUndelivered || d.status === 'Devolvida');
    const minutes = c.departureTime && c.returnTime ? durationMinutes(c.date,c.departureTime,c.date,c.returnTime) : null;
    const revenue = revenueAttributedTo(carriedDeliveries);
    const sameDayVehicleCycles = scoped(state.cycles).filter(x => x.date === c.date && x.vehicleId === c.vehicleId);
    const dayKm = dailyKmForVehicle(c.date, c.vehicleId);
    const avgKm = sameDayVehicleCycles.length ? dayKm / sameDayVehicleCycles.length : 0;
    return {
      deliveries: carriedDeliveries.length,
      delivered: delivered.length,
      returned: returned.length,
      km: avgKm,
      minutes,
      revenue,
      open: !c.returnTime
    };
  }
  function odometerCalc(log) {
    const start = Number(log?.kmStart || 0);
    const end = Number(log?.kmEnd || 0);
    const complete = start > 0 && end > 0 && end >= start;
    return { km: complete ? end - start : 0, complete, invalid: end > 0 && start > 0 && end < start };
  }
  function dailyKmForVehicle(date, vehicleId) {
    return sum(scoped(state.odometerLogs).filter(x => x.date === date && x.vehicleId === vehicleId).map(x => odometerCalc(x).km));
  }
  function totalKmFromOdometers(logs = filteredOdometers()) { return sum(logs.map(x => odometerCalc(x).km)); }
  function vehicleDayStats(date, vehicleId) {
    const log = scoped(state.odometerLogs).find(x => x.date === date && x.vehicleId === vehicleId);
    const km = odometerCalc(log).km;
    const cycles = scoped(state.cycles).filter(x => x.date === date && x.vehicleId === vehicleId);
    const carried = scoped(state.deliveries).filter(x => x.date === date && x.vehicleId === vehicleId && x.cycleId);
    const completed = carried.filter(deliveredToCustomer);
    return {
      log, km, cycles: cycles.length, deliveries: carried.length, completed: completed.length,
      deliveriesPerCycle: cycles.length ? carried.length / cycles.length : 0,
      kmPerCycle: cycles.length ? km / cycles.length : 0,
      kmPerDelivery: carried.length ? km / carried.length : 0
    };
  }
  function isFinal(d) { return d.status === 'Finalizada' || d.status === 'Retirada na loja' || d.status === 'Cancelada'; }
  function deliveredToCustomer(d) { return Boolean(d?.finalizationTime) || d?.status === 'Finalizada'; }
  function childDeliveries(id) { return scoped(state.deliveries).filter(d => d.parentId === id); }
  function sortedDeliveryChain(d, records = scoped(state.deliveries)) {
    return chainForRoot(d,records).slice().sort((a,b)=>Number(a.attemptNo||1)-Number(b.attemptNo||1) || `${a.date||''}${a.purchaseTime||''}${a.createdAt||''}`.localeCompare(`${b.date||''}${b.purchaseTime||''}${b.createdAt||''}`));
  }
  function scheduledSlaExempt(d, records = state ? scoped(state.deliveries) : [d]) {
    if (!d) return false;
    const rootId = d.rootId || d.id;
    return records.some(record => {
      if ((record.rootId || record.id) !== rootId) return false;
      if (record.scheduledDate) return true;
      return (record.history || []).some(event => ['scheduled','schedule_change','continued_from','continued_to'].includes(event.type));
    });
  }
  function scheduledDateTimeLabel(d) {
    if (!d?.scheduledDate) return 'Sem data programada';
    return `${dateBR(d.scheduledDate)}${d.scheduledTime ? ` às ${d.scheduledTime}` : ''}`;
  }
  function scheduledMomentPassed(d, date = todayISO(), time = currentTimeHM()) {
    if (!d?.scheduledDate) return false;
    if (d.scheduledDate < date) return true;
    if (d.scheduledDate > date || !d.scheduledTime) return false;
    return d.scheduledTime < time;
  }
  function openScheduled(d, records = scoped(state.deliveries)) {
    if (!d.scheduledDate || isFinal(d)) return false;
    const chain = chainForRoot(d,records);
    if (chain.some(deliveredToCustomer)) return false;
    return !records.some(record=>record.parentId===d.id);
  }
  function purchaseOutcome(root, records = scoped(state.deliveries)) {
    const chain = sortedDeliveryChain(root,records);
    const delivered = chain.filter(deliveredToCustomer).at(-1);
    if (delivered) return {key:'Entregue',label:'Entregue',tone:'green',record:delivered,delivered:true,open:false};
    const pickup = chain.filter(d=>d.status==='Retirada na loja').at(-1);
    if (pickup) return {key:'Retirada na loja',label:'Retirada na loja',tone:'blue',record:pickup,delivered:false,open:false};
    const cancelled = chain.filter(d=>d.status==='Cancelada').at(-1);
    if (cancelled) return {key:'Cancelada',label:'Cancelada',tone:'gray',record:cancelled,delivered:false,open:false};
    const openSchedule = chain.filter(d=>openScheduled(d,records)).at(-1);
    if (openSchedule) {
      const kind = openSchedule.scheduleKind === 'Reagendada' ? 'Reagendada' : 'Programada';
      return {key:`${kind} aberta`,label:`${kind} aberta`,tone:'purple',record:openSchedule,delivered:false,open:true};
    }
    const inRoute = chain.filter(d=>d.status==='Em rota' || (d.departureTime&&!d.finalizationTime)).at(-1);
    if (inRoute) return {key:'Em rota',label:'Em rota',tone:'yellow',record:inRoute,delivered:false,open:true};
    const active = chain.filter(d=>!isFinal(d) && !['Devolvida','Programada','Reagendada'].includes(d.status)).at(-1);
    if (active) return {key:'Na loja',label:'Na loja',tone:'blue',record:active,delivered:false,open:true};
    const devolved = chain.filter(d=>d.status==='Devolvida').at(-1);
    if (devolved) return {key:'Devolvida',label:'Devolvida',tone:'red',record:devolved,delivered:false,open:false};
    const latest = chain.at(-1) || root;
    return {key:latest?.status || 'Sem situação',label:latest?.status || 'Sem situação',tone:'gray',record:latest,delivered:false,open:false};
  }
  function scheduleSummary(root, records = scoped(state.deliveries)) {
    const chain = sortedDeliveryChain(root,records);
    const events = chain.filter(d=>d.scheduledDate);
    if (!events.length) return null;
    const outcome = purchaseOutcome(root,records);
    const latestEvent = events.at(-1);
    const kind = events.some(d=>d.scheduleKind==='Reagendada') ? 'Reagendada' : 'Programada';
    const started = chain.some(d=>d.parentId===latestEvent.id);
    let situation = outcome.label;
    if (outcome.delivered) situation = `Entregue após ${kind.toLocaleLowerCase('pt-BR')}`;
    else if (outcome.open && outcome.record?.scheduledDate) situation = outcome.label;
    else if (started && outcome.open) situation = 'Atendimento iniciado';
    return {root,chain,events,latestEvent,kind,outcome,situation,delivered:outcome.delivered,open:Boolean(outcome.record?.scheduledDate&&outcome.open),started:started&&!outcome.delivered};
  }
  function allScheduleSummaries(records = scoped(state.deliveries)) {
    const roots = records.filter(isRootPurchase);
    return roots.map(root=>scheduleSummary(root,records)).filter(Boolean);
  }
  function pendingReasons(d) {
    const list = [];
    const calc = deliveryCalc(d);
    if (openScheduled(d)) list.push(`${d.scheduleKind || 'Programada'} para ${scheduledDateTimeLabel(d)}`);
    if (d.status === 'Em rota' && !d.returnTime) list.push('Em rota sem retorno');
    if (d.parentId && !isFinal(d) && !d.scheduledDate && d.status !== 'Em rota') list.push('Atendimento programado iniciado e não concluído');
    if (d.status === 'Devolvida' && !d.scheduledDate && !d.nextAction) list.push('Devolvida sem próxima ação');
    if (calc.delayed && !isFinal(d)) list.push('Saída fora do padrão de 2h');
    const livePurchaseToClient = currentPurchaseToClientMinutes(d);
    if (!d.finalizationTime && !isFinal(d) && livePurchaseToClient !== null && livePurchaseToClient > Number(state.settings.completionLimitMinutes || 210)) list.push('Compra há mais de 3h30 sem finalização no cliente');
    if (d.departureTime && !d.vehicleId) list.push('Saiu sem veículo');
    if (d.departureTime && !d.driverId) list.push('Saiu sem entregador');
    if (openScheduled(d) && scheduledMomentPassed(d)) list.push('Agenda programada ainda pendente');
    return unique(list);
  }
  function allPending() { return scoped(state.deliveries).filter(d => pendingReasons(d).length); }
  function scheduledOpen() {
    const records = scoped(state.deliveries);
    return allScheduleSummaries(records).filter(summary=>summary.open).map(summary=>summary.outcome.record);
  }
  function scheduledForDate(date) { return scheduledOpen().filter(d => d.scheduledDate === date); }


  function elapsedMinutesToNow(date, time) {
    if (!date || !time) return 0;
    const start = toDateTime(date, time);
    if (!start || Number.isNaN(start.getTime())) return 0;
    return Math.max(0, Math.round((Date.now() - start.getTime()) / 60000));
  }

  function issueSeverityForReason(text = '') {
    if (/Em rota sem retorno|Saiu sem veículo|Saiu sem entregador/i.test(text)) return 'critical';
    if (/Atrasada|fora do padrão|mais de 3h30|Devolvida|iniciado e não concluído/i.test(text)) return 'warning';
    return 'info';
  }

  function systemIssues({ date = '', includeInfo = true } = {}) {
    const issues = [];
    const push = issue => {
      if (!includeInfo && issue.severity === 'info') return;
      if (date && issue.date !== date && issue.relatedDate !== date) return;
      issues.push(issue);
    };

    const deliveries = scoped(state.deliveries);
    deliveries.forEach(d => {
      pendingReasons(d).forEach(reasonText => {
        // Em ciclos, o retorno é tratado uma vez no nível do ciclo para evitar dezenas de alertas iguais.
        if (reasonText === 'Em rota sem retorno' && d.cycleId) return;
        push({
          id:`delivery_${d.id}_${reasonText}`,
          severity:issueSeverityForReason(reasonText),
          type:'delivery',
          title:`Compra Nº ${d.orderNo || '—'} • Nº do cupom ${d.coupon || '—'}`,
          detail:reasonText,
          date:d.date,
          relatedDate:d.scheduledDate || '',
          action:'edit-delivery',
          recordId:d.id,
          meta:neighborhood(d.neighborhoodId)?.name || 'Sem bairro'
        });
      });
    });

    const cycles = scoped(state.cycles);
    cycles.forEach(c => {
      if (c.returnTime) return;
      const linked = deliveries.filter(d => d.cycleId === c.id);
      const resolvedStatuses = ['Finalizada','Devolvida','Retirada na loja','Cancelada','Reagendada','Programada'];
      const allResolved = linked.length > 0 && linked.every(d => d.finalizationTime || resolvedStatuses.includes(d.status));
      if (!linked.length) push({id:`cycle_empty_${c.id}`,severity:'critical',type:'cycle',title:`${c.code} sem entregas`,detail:'O ciclo está aberto, mas não possui nenhuma entrega vinculada.',date:c.date,action:'edit-cycle',recordId:c.id,meta:vehicle(c.vehicleId)?.name || 'Sem veículo'});
      if (c.date < todayISO()) push({id:`cycle_old_${c.id}`,severity:'critical',type:'cycle',title:`${c.code} ainda aberto`,detail:`Ciclo de ${dateBR(c.date)} permaneceu sem retorno.`,date:c.date,action:'close-cycle',recordId:c.id,meta:vehicle(c.vehicleId)?.name || 'Sem veículo'});
      else if (allResolved) push({id:`cycle_resolved_${c.id}`,severity:'critical',type:'cycle',title:`${c.code} pronto para fechar`,detail:`Todas as ${linked.length} entregas já têm resultado, mas o retorno à loja não foi registrado.`,date:c.date,action:'close-cycle',recordId:c.id,meta:vehicle(c.vehicleId)?.name || 'Sem veículo'});
      else if (elapsedMinutesToNow(c.date, c.departureTime) > 180) push({id:`cycle_long_${c.id}`,severity:'warning',type:'cycle',title:`${c.code} em rota há muito tempo`,detail:`Saída às ${c.departureTime || '—'} e ainda sem retorno registrado.`,date:c.date,action:'close-cycle',recordId:c.id,meta:`${linked.length} entrega(s)`});
    });

    scoped(state.odometerLogs).forEach(o => {
      const calc = odometerCalc(o);
      if (calc.invalid) push({id:`odo_invalid_${o.id}`,severity:'critical',type:'odometer',title:`KM inválido • ${vehicle(o.vehicleId)?.name || 'Veículo'}`,detail:'O KM final está menor que o KM inicial.',date:o.date,action:'edit-odometer',recordId:o.id,meta:`${o.kmStart || '—'} → ${o.kmEnd || '—'}`});
      else if (Number(o.kmStart || 0) > 0 && !Number(o.kmEnd || 0)) push({id:`odo_open_${o.id}`,severity:o.date < todayISO() ? 'warning' : 'info',type:'odometer',title:`KM final pendente • ${vehicle(o.vehicleId)?.name || 'Veículo'}`,detail:'O expediente do veículo foi aberto, mas ainda não foi fechado.',date:o.date,action:'edit-odometer',recordId:o.id,meta:`KM inicial ${number(o.kmStart,1)}`});
    });

    // Duplicidades: compra e cupom no mesmo dia.
    const roots = deliveries.filter(isRootPurchase);
    const duplicateGroups = (field) => {
      const map = new Map();
      roots.forEach(d => {
        const value = String(d[field] || '').trim();
        if (!value) return;
        const key = `${d.date}|${value.toLowerCase()}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(d);
      });
      return [...map.values()].filter(group => group.length > 1);
    };
    duplicateGroups('orderNo').forEach(group => push({id:`dup_order_${group[0].date}_${group[0].orderNo}`,severity:'warning',type:'delivery',title:`Compra Nº ${group[0].orderNo} repetida`,detail:`Existem ${group.length} registros com o mesmo número nesta data.`,date:group[0].date,action:'edit-delivery',recordId:group[0].id,meta:group.map(d=>d.coupon || '—').join(', ')}));
    duplicateGroups('coupon').forEach(group => push({id:`dup_coupon_${group[0].date}_${group[0].coupon}`,severity:'critical',type:'delivery',title:`Nº do cupom ${group[0].coupon} repetido`,detail:`Existem ${group.length} compras com o mesmo número de cupom nesta data. Confirme se é duplicidade real.`,date:group[0].date,action:'edit-delivery',recordId:group[0].id,meta:group.map(d=>`Nº ${d.orderNo || '—'}`).join(', ')}));

    // Conflitos de veículo ou entregador em mais de um ciclo aberto.
    const openCycles = cycles.filter(c => !c.returnTime);
    const conflictBy = (field, label, resolver) => {
      const map = new Map();
      openCycles.forEach(c => {
        const value = c[field]; if (!value) return;
        if (!map.has(value)) map.set(value, []);
        map.get(value).push(c);
      });
      [...map.entries()].filter(([,group]) => group.length > 1).forEach(([id,group]) => push({id:`conflict_${field}_${id}`,severity:'critical',type:'cycle',title:`${label} em dois ciclos abertos`,detail:`${resolver(id)} aparece simultaneamente em ${group.map(c=>c.code).join(' e ')}.`,date:group[0].date,action:'edit-cycle',recordId:group[0].id,meta:'Conflito operacional'}));
    };
    conflictBy('vehicleId','Veículo',id=>vehicle(id)?.name || 'Veículo');
    conflictBy('driverId','Entregador',id=>employee(id)?.name || 'Entregador');

    const seen = new Set();
    return issues.filter(issue => {
      if (seen.has(issue.id)) return false;
      seen.add(issue.id); return true;
    }).sort((a,b) => {
      const weight = {critical:0,warning:1,info:2};
      return weight[a.severity]-weight[b.severity] || String(a.date||'').localeCompare(String(b.date||''));
    });
  }

  function dayClosure(date = todayISO()) {
    return scoped(state.dayClosures || []).find(x => x.date === date) || null;
  }

  function dayClosingChecks(date = todayISO()) {
    const blockers = [], warnings = [];
    const deliveries = scoped(state.deliveries).filter(d => d.date === date || d.scheduledDate === date);
    const cycles = scoped(state.cycles).filter(c => c.date === date);
    const odometers = scoped(state.odometerLogs).filter(o => o.date === date);
    const openCycles = cycles.filter(c => !c.returnTime);
    const inRoute = deliveries.filter(d => d.status === 'Em rota');
    const usedVehicleIds = unique(cycles.map(c=>c.vehicleId).filter(Boolean));

    if (openCycles.length) blockers.push({icon:'↻',text:`${openCycles.length} ciclo(s) ainda aberto(s): ${openCycles.map(c=>c.code).join(', ')}.`});
    if (inRoute.length) blockers.push({icon:'🚚',text:`${inRoute.length} entrega(s) ainda aparecem em rota.`});

    usedVehicleIds.forEach(vehicleId => {
      const log = odometers.find(o => o.vehicleId === vehicleId);
      if (!log || !Number(log.kmStart || 0)) blockers.push({icon:'KM',text:`${vehicle(vehicleId)?.name || 'Veículo'} trabalhou hoje sem KM inicial registrado.`});
      else if (odometerCalc(log).invalid) blockers.push({icon:'KM',text:`${vehicle(vehicleId)?.name || 'Veículo'} possui KM final menor que o inicial.`});
      else if (!Number(log.kmEnd || 0)) blockers.push({icon:'KM',text:`Falta registrar o KM final de ${vehicle(vehicleId)?.name || 'veículo'}.`});
    });

    const agendaPending = scheduledOpen().filter(d => d.scheduledDate && d.scheduledDate <= date);
    if (agendaPending.length) warnings.push({icon:'◷',text:`${agendaPending.length} entrega(s) da agenda continuam pendentes. Elas não entram no indicador de atraso comum.`});
    const missingNeighborhood = deliveries.filter(d => !d.neighborhoodId);
    if (missingNeighborhood.length) warnings.push({icon:'◎',text:`${missingNeighborhood.length} entrega(s) estão sem bairro informado.`});
    const devolvedWithoutAction = deliveries.filter(d => d.status === 'Devolvida' && !d.scheduledDate && !d.nextAction);
    if (devolvedWithoutAction.length) warnings.push({icon:'↩',text:`${devolvedWithoutAction.length} devolução(ões) ainda não têm próxima ação definida.`});

    const importantIssues = systemIssues({date,includeInfo:false});
    const duplicateIssues = importantIssues.filter(i => i.id.startsWith('dup_'));
    if (duplicateIssues.length) warnings.push({icon:'⧉',text:`${duplicateIssues.length} possível(is) duplicidade(s) precisa(m) de conferência.`});

    return { blockers, warnings, importantIssues };
  }

  function operationRecommendation(date, deliveries, cycles, issues, odometers) {
    const critical = issues.filter(i => i.severity === 'critical');
    if (critical.length) return {tone:'danger',icon:'!',title:`Resolva ${critical.length} situação(ões) crítica(s)`,text:critical[0].detail,action:'go-pending',button:'Abrir Central de Erros'};

    const openCycles = cycles.filter(c => !c.returnTime);
    const readyToClose = openCycles.find(c => {
      const linked = scoped(state.deliveries).filter(d => d.cycleId === c.id);
      const resolved = ['Finalizada','Devolvida','Retirada na loja','Cancelada','Reagendada','Programada'];
      return linked.length && linked.every(d => d.finalizationTime || resolved.includes(d.status));
    });
    if (readyToClose) return {tone:'warning',icon:'↻',title:`${readyToClose.code} está pronto para retorno`,text:'Todas as entregas desse ciclo já possuem resultado. Falta registrar o retorno à loja.',action:'close-cycle',recordId:readyToClose.id,button:'Registrar retorno'};

    const unresolvedInRoute = deliveries.filter(d => d.status === 'Em rota' && !d.finalizationTime);
    if (unresolvedInRoute.length) return {tone:'info',icon:'🚚',title:`Finalize ${unresolvedInRoute.length} entrega(s) em rota`,text:'Cada entrega precisa do seu próprio horário de conclusão na casa do cliente.',action:'scroll-deliveries',button:'Ver entregas em rota'};

    const waiting = deliveries.filter(d => !isFinal(d) && !d.departureTime && !(d.scheduledDate && openScheduled(d)));
    if (waiting.length) return {tone:'focus',icon:'＋',title:`${waiting.length} entrega(s) aguardando saída`,text:'Monte uma saída selecionando uma ou várias entregas. O sistema criará um único ciclo.',action:'start-cycle',button:'Montar nova saída'};

    const usedVehicleIds = unique(cycles.map(c=>c.vehicleId).filter(Boolean));
    const missingKm = usedVehicleIds.find(id => {
      const o = odometers.find(x=>x.vehicleId===id);
      return !o || !Number(o.kmStart||0) || !Number(o.kmEnd||0);
    });
    if (missingKm) return {tone:'warning',icon:'KM',title:`Complete a quilometragem de ${vehicle(missingKm)?.name || 'veículo'}`,text:'O KM diário é essencial para calcular KM por ciclo e KM por entrega.',action:'scroll-odometer',button:'Ver quilometragem'};

    return {tone:'success',icon:'✓',title:'Operação sob controle',text:'Neste momento não há ação crítica. Continue registrando as compras e acompanhe os próximos movimentos.',action:'new-delivery',button:'Registrar nova compra'};
  }

  function updateBadges() {
    if (!state) return;
    const issues = systemIssues({includeInfo:false});
    const sched = scheduledOpen();
    const todayIssues = issues.filter(i => i.date === todayISO() || i.relatedDate === todayISO());
    $('#pendingBadge').textContent = issues.length;
    $('#scheduledBadge').textContent = sched.length;
    $('#todayPendingBadge').textContent = todayIssues.length;
    const trashBadge = $('#trashBadge');
    if (trashBadge) trashBadge.textContent = state.trash.filter(x => (x.mode || 'production') === currentMode()).length;
  }

  function render() {
    document.body.dataset.currentView = currentView;
    refreshYearOptions();
    updateBadges();
    const filterPanel = $('#globalFilterPanel');
    if (filterPanel) filterPanel.classList.toggle('hidden', ['today','pending','scheduled','settings','trash','trace'].includes(currentView));
    const view = $('#view');
    view.innerHTML = '';
    if (currentView === 'dashboard') renderDashboard();
    else if (currentView === 'today') renderToday();
    else if (currentView === 'deliveries') renderDeliveries();
    else if (currentView === 'scheduled') renderScheduled();
    else if (currentView === 'pending') renderPending();
    else if (currentView === 'cycles') renderCycles();
    else if (currentView === 'route-history') renderRouteHistory();
    else if (currentView === 'odometer') renderOdometer();
    else if (currentView === 'costs') renderCosts();
    else if (currentView === 'neighborhoods') renderNeighborhoods();
    else if (currentView === 'trace') renderTrace();
    else if (currentView === 'reports') renderReports();
    else if (currentView === 'settings') renderSettings();
    else if (currentView === 'trash') renderTrash();
    injectModeBanner();
    updateModeUI();
  }

  function cardMetric(label, value, sub = '', icon = '•', tone = 'blue') {
    return `<article class="card metric-card"><div class="metric-top"><span class="metric-label">${esc(label)}</span><span class="metric-icon ${tone}">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-sub">${esc(sub)}</div></article>`;
  }
  function sectionHeader(icon,title,subtitle,actions='') {
    return `<div class="section-head"><div class="section-title"><span class="section-badge">${icon}</span><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div></div>${actions ? `<div class="section-actions">${actions}</div>` : ''}</div>`;
  }
  function statusBadge(status) {
    const tone = ['Finalizada','Entregue'].includes(status) ? 'green' : status === 'Em rota' ? 'yellow' : ['Devolvida','Voltou à loja'].includes(status) ? 'red' : ['Programada','Reagendada'].includes(status) ? 'purple' : status === 'Cancelada' ? 'gray' : 'blue';
    return `<span class="badge ${tone}">${esc(status || 'Na loja')}</span>`;
  }
  function emptyState(icon,title,text) { return `<div class="empty-state"><div class="empty-icon">${icon}</div><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`; }

  function renderDashboard() {
    const range = selectedRange();
    const deliveries = filteredDeliveries();
    const roots = deliveries.filter(isRootPurchase);
    const allRecords = scoped(state.deliveries);
    const deliveredPurchases = roots.map(root=>purchaseOutcome(root,allRecords)).filter(outcome=>outcome.delivered).map(outcome=>outcome.record);
    const costs = filteredCosts();
    const cycles = filteredCycles();
    const odometers = filteredOdometers();
    const activeDays = unique([...deliveries.map(d=>d.date),...costs.map(c=>c.date),...cycles.map(c=>c.date),...odometers.map(o=>o.date)]).length;
    const activeDaysDivisor = activeDays || 1;
    const fin = financialsForRange(range);
    const totalCosts = sum(costs.map(c => c.value));
    const totalKm = totalKmFromOdometers(odometers);
    const carriedInCycles = sum(cycles.map(c => cycleCalc(c).deliveries));
    const deliveriesPerCycle = cycles.length ? carriedInCycles / cycles.length : 0;
    const costPerDelivery = deliveredPurchases.length ? totalCosts / deliveredPurchases.length : 0;
    const fuel = sum(costs.filter(c => category(c.categoryId)?.name === 'Combustível').map(c => c.value));
    const avgWait = avg(deliveries.map(d => deliveryCalc(d).wait));
    const avgPurchaseToClient = avg(deliveries.map(d => deliveryCalc(d).purchaseToClient));
    const avgRoute = avg(deliveries.map(d => deliveryCalc(d).route));
    const delayed = deliveries.filter(d => deliveryCalc(d).delayed).length;
    const completionDelayed = deliveries.filter(d => deliveryCalc(d).completionDelayed).length;
    const departureCalculated = deliveries.filter(d => deliveryCalc(d).wait !== null);
    const completionCalculated = deliveries.filter(d => deliveryCalc(d).purchaseToClient !== null);
    const departureWithin = departureCalculated.length - delayed;
    const completionWithin = completionCalculated.length - completionDelayed;
    const departureCompliance = percentage(departureWithin,departureCalculated.length);
    const completionCompliance = percentage(completionWithin,completionCalculated.length);
    const finalizedPurchases = deliveredPurchases.length;
    const completionRate = percentage(finalizedPurchases,roots.length);
    const openSched = roots.filter(root=>purchaseOutcome(root,allRecords).record?.scheduledDate&&purchaseOutcome(root,allRecords).open).length;
    const scheduleSummaries = roots.map(root=>scheduleSummary(root,allRecords)).filter(Boolean);
    const deliveredAfterSchedule = scheduleSummaries.filter(summary=>summary.delivered).length;
    const movementForecast = buildMovementForecast(allRecords);
    const weeklyRows = buildWeeklyRows(deliveries,costs,cycles,odometers);
    const nbRows = buildNeighborhoodRows(deliveries);
    const topDelivery = nbRows[0];
    const topWrong = [...nbRows].sort((a,b) => b.wrongAddress-a.wrongAddress)[0];
    const topReschedule = [...nbRows].sort((a,b) => b.rescheduled-a.rescheduled)[0];
    const issuesInRange = systemIssues({includeInfo:false}).filter(i => inRange(i.date, range) || inRange(i.relatedDate, range));
    const criticalCount = issuesInRange.filter(i=>i.severity==='critical').length;
    const outcomeGroups = groupItems(roots,root=>purchaseOutcome(root,allRecords).key);
    const statusRows = [...outcomeGroups.entries()].map(([label,rows])=>({label,value:rows.length})).sort((a,b)=>b.value-a.value);
    const departedPurchases = roots.filter(root=>chainForRoot(root,allRecords).some(d=>d.departureTime)).length;
    const waitingDeparture = roots.filter(root=>purchaseOutcome(root,allRecords).key==='Na loja').length;

    $('#view').innerHTML = `
      <section class="hero-strip v11-dashboard-hero">
        <div><span class="hero-mode-label">${currentMode()==='training'?'🧪 TREINAMENTO':'OPERAÇÃO REAL'}</span><h2>Dashboard gerencial • ${esc(range.label)}</h2><p>Visão completa da operação, dos prazos, do resultado financeiro e da produtividade.</p></div>
        <div class="hero-meta"><span class="hero-chip">${fin.purchases.length} compras</span><span class="hero-chip">${cycles.length} ciclos</span><span class="hero-chip">${number(totalKm,1)} km</span></div>
      </section>

      <section class="executive-primary-grid">
        ${executiveMetric('Faturamento líquido',money(fin.net),'Bruto menos reembolsos','R$','focus')}
        ${executiveMetric('Compras entregues',finalizedPurchases,`${deliveries.length} registros e tentativas no período`,'▣','info')}
        ${executiveMetric('Conclusão das compras',percent(completionRate),`${finalizedPurchases} de ${roots.length} compras`,'✓',completionRate>=90?'success':'warning')}
        ${executiveMetric('Pendências críticas',criticalCount,criticalCount?'Exigem ação':'Sem críticas abertas','! ',criticalCount?'danger':'success')}
        ${executiveMetric('KM rodado',`${number(totalKm,1)} km`,`${activeDays} ${activeDays === 1 ? 'dia' : 'dias'} com movimento`,'KM','info')}
        ${executiveMetric('Custo por entrega',money(costPerDelivery),`${money(totalCosts)} em custos`,'CE','warning')}
      </section>

      <section class="management-panel-grid">
        ${managementPanel('R$','Financeiro','O que entrou e o que saiu',[
          ['Faturamento bruto',money(fin.gross),`${fin.purchases.length} compras`],
          ['Reembolsos',money(fin.refundTotal),`${fin.refunds.length} ocorrências`],
          ['Custos totais',money(totalCosts),`Combustível ${money(fuel)}`],
          ['Saldo operacional',money(fin.net-totalCosts),'Líquido menos custos']
        ])}
        ${managementPanel('▣','Operação','Volume, tempos e qualidade',[
          ['Tempo médio de espera',fmtMinutes(avgWait),'Compra → saída'],
          ['Compra até o cliente',fmtMinutes(avgPurchaseToClient),'Compra → entrega finalizada'],
          ['Saídas fora do padrão',String(delayed),`Acima de ${state.settings.delayMinutes} min corridos`],
          ['Entregas fora do padrão',String(completionDelayed),`Acima de ${fmtMinutes(Number(state.settings.completionLimitMinutes || 210))}`],
          ['Programadas abertas',String(openSched),'Ainda não concluídas'],
          ['Programadas já entregues',String(deliveredAfterSchedule),'Situação consolidada da compra'],
          ['Tempo médio de rota',fmtMinutes(avgRoute),'Saída → retorno']
        ])}
        ${managementPanel('↻','Frota e eficiência','Produtividade dos ciclos',[
          ['Entregas por ciclo',number(deliveriesPerCycle,2),`${cycles.length} ciclos`],
          ['KM médio por dia',`${number(totalKm/activeDaysDivisor,1)} km`,`${activeDays} ${activeDays === 1 ? 'dia' : 'dias'}`],
          ['KM por entrega',`${number(finalizedPurchases?totalKm/finalizedPurchases:0,2)} km`,'Média das compras entregues'],
          ['KM médio por ciclo',`${number(cycles.length?totalKm/cycles.length:0,2)} km`,'A partir do KM diário']
        ])}
      </section>

      <section class="dashboard-grid equal dashboard-priority-grid">
        <article class="card section-card">${sectionHeader('⌁','Previsão de movimento • próximas 5 semanas',`Estimativa baseada em até 1 ano de entregas e nas programações abertas • confiança ${movementForecast.confidence}.`)}<div class="stat-list">
          ${statRow('Dia previsto de maior movimento',movementForecast.peakDay?`${dateBR(movementForecast.peakDay.date)} • ${movementForecast.peakDay.dayName}`:'Sem previsão',movementForecast.peakDay?`Cerca de ${number(movementForecast.peakDay.estimate,1)} entregas`: 'Aguardando histórico')}
          ${statRow('Semana prevista de maior movimento',movementForecast.peakWeek?`${dateBR(movementForecast.peakWeek.start)} a ${dateBR(movementForecast.peakWeek.end)}`:'Sem previsão',movementForecast.peakWeek?`Cerca de ${number(movementForecast.peakWeek.estimate,1)} entregas na semana`:'Aguardando histórico')}
          ${statRow('Dia da semana mais forte',movementForecast.peakWeekday?.label||'Sem previsão',movementForecast.peakWeekday?`Média prevista de ${number(movementForecast.peakWeekday.average,1)} por dia`:'Aguardando histórico')}
          ${statRow('Programações já conhecidas',String(movementForecast.scheduledTotal),`${dateBR(movementForecast.forecastStart)} a ${dateBR(movementForecast.forecastEnd)}`)}
        </div></article>
        <article class="card section-card">${sectionHeader('▥','Movimento previsto por semana','Use a semana de maior volume para antecipar equipe, veículo e organização das saídas.')}<div class="chart-box small">${movementForecast.history.deliveredCount||movementForecast.scheduledTotal?horizontalBarChartHTML(movementForecast.weeks.map(week=>({label:`${dateBR(week.start).slice(0,5)}–${dateBR(week.end).slice(0,5)}`,value:week.estimate})),'#E9AA1B'):emptyState('⌁','Previsão ainda sem base','A estimativa aparecerá conforme as entregas forem finalizadas ou programadas.')}</div></article>
      </section>

      <section class="dashboard-grid equal dashboard-priority-grid">
        <article class="card section-card">${sectionHeader('◷','Cumprimento dos prazos','Percentual calculado somente sobre registros que possuem os horários necessários.')}<div class="chart-box small">${slaPerformanceChartHTML([
          {label:'Compra → saída',within:departureWithin,outside:delayed,total:departureCalculated.length,rate:departureCompliance,limit:`até ${fmtMinutes(Number(state.settings.delayMinutes || 120))}`},
          {label:'Compra → cliente',within:completionWithin,outside:completionDelayed,total:completionCalculated.length,rate:completionCompliance,limit:`até ${fmtMinutes(Number(state.settings.completionLimitMinutes || 210))}`}
        ])}</div></article>
        <article class="card section-card">${sectionHeader('⇢','Fluxo das entregas','Da compra registrada até a conclusão na casa do cliente.')}<div class="chart-box small">${operationalFlowChartHTML([
          {label:'Compras registradas',value:roots.length},
          {label:'Compras que já saíram',value:departedPurchases},
          {label:'Compras finalizadas',value:finalizedPurchases}
        ],waitingDeparture)}</div></article>
      </section>

      <section class="dashboard-grid equal">
        <article class="card section-card">${sectionHeader('▥','Entregas por dia','Uma compra entregue é contada somente uma vez, mesmo após reagendamento.')}<div class="chart-box">${lineChartHTML(groupCountByDate(deliveredPurchases), '#F2B523')}</div></article>
        <article class="card section-card">${sectionHeader('★','Destaques dos bairros','Volume e principais ocorrências.')}<div class="stat-list">${statRow('Mais entregas',topDelivery?.name || '—',topDelivery?`${topDelivery.deliveries} entregas`:'Sem dados')}${statRow('Mais endereço errado',topWrong?.name || '—',topWrong?`${topWrong.wrongAddress} ocorrências`:'Sem dados')}${statRow('Mais reagendamentos',topReschedule?.name || '—',topReschedule?`${topReschedule.rescheduled} reagendamentos`:'Sem dados')}</div></article>
      </section>

      <section class="dashboard-grid equal">
        <article class="card section-card">${sectionHeader('R$','Faturamento líquido x custos por semana','Compare resultado e gasto por semana.')}<div class="chart-box small">${groupedBarChartHTML(weeklyRows.map(r => ({label:r.label,a:r.netRevenue,b:r.costs})), 'Faturamento líquido','Custos')}</div></article>
        <article class="card section-card">${sectionHeader('◉','Situação final das compras','A programação histórica não substitui o resultado final da compra.')}<div class="chart-box small">${statusDistributionChartHTML(statusRows)}</div></article>
      </section>

      <section class="dashboard-grid equal">
        <article class="card section-card">${sectionHeader('◎','Top bairros por entregas','Quantidade de entregas finalizadas por bairro.')}<div class="chart-box small">${horizontalBarChartHTML(nbRows.slice(0,8).map(r=>({label:r.name,value:r.deliveries})),'#F2B523')}</div></article>
        <article class="card section-card">${sectionHeader('R$','Distribuição dos custos','Participação de cada categoria no custo do período.')}<div class="chart-box small">${dashboardCostChartHTML(buildCostCategoryRows(costs))}</div></article>
      </section>

      <section class="card section-card" style="margin-top:12px">${sectionHeader('▤','Resultados semanais','Entregas, faturamento, custos, KM e eficiência por ciclo.')}${weeklyTable(weeklyRows)}</section>
    `;
  }

  function executiveMetric(label,value,sub,icon='•',tone='info') {
    return `<article class="executive-metric ${tone}"><div class="executive-metric-icon">${icon}</div><div><span>${esc(label)}</span><strong>${value}</strong><small>${esc(sub)}</small></div></article>`;
  }

  function managementPanel(icon,title,subtitle,rows) {
    return `<article class="card management-panel"><div class="management-panel-head"><span>${icon}</span><div><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></div></div><div class="management-panel-rows">${rows.map(([label,value,sub])=>`<div class="management-row"><div><span>${esc(label)}</span><small>${esc(sub)}</small></div><strong>${value}</strong></div>`).join('')}</div></article>`;
  }

  function statRow(label,value,sub) { return `<div class="stat-row"><div><strong>${esc(label)}</strong><small>${esc(sub)}</small></div><div class="stat-number">${esc(value)}</div></div>`; }

  function groupCountByDate(items) {
    const map = {};
    items.forEach(item => map[item.date] = (map[item.date] || 0) + 1);
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([date,value]) => ({ label: dateBR(date).slice(0,5), value }));
  }

  function buildWeeklyRows(deliveries = filteredDeliveries(), costs = filteredCosts(), cycles = filteredCycles(), odometers = filteredOdometers()) {
    const selected = selectedRange();
    const allRecords = scoped(state.deliveries);
    const refundDates = scoped(state.deliveries).filter(d=>d.refundDate && inRange(d.refundDate, selected)).map(d=>startOfWeek(d.refundDate));
    const weeks = unique([...deliveries.map(d=>startOfWeek(d.date)),...costs.map(c=>startOfWeek(c.date)),...cycles.map(c=>startOfWeek(c.date)),...odometers.map(o=>startOfWeek(o.date)),...refundDates]).sort();
    return weeks.map((week, index) => {
      const weekRange = {start:week,end:endOfWeek(week)};
      const d = deliveries.filter(x => inRange(x.date, weekRange));
      const deliveredPurchases = d.filter(isRootPurchase).filter(root=>rootWasFinalized(root,allRecords));
      const c = costs.filter(x => inRange(x.date, weekRange));
      const cy = cycles.filter(x => inRange(x.date, weekRange));
      const odo = odometers.filter(x => inRange(x.date, weekRange));
      const km = totalKmFromOdometers(odo);
      const fin = financialsForRange(weekRange);
      return {
        week, label:`Sem. ${index+1}`,
        deliveries:deliveredPurchases.length,
        grossRevenue:fin.gross,
        refunds:fin.refundTotal,
        netRevenue:fin.net,
        costs:sum(c.map(x=>x.value)),
        km,
        cycles:cy.length,
        deliveriesPerCycle:cy.length ? sum(cy.map(c=>cycleCalc(c).deliveries))/cy.length : 0,
        kmPerCycle:cy.length ? km/cy.length : 0
      };
    });
  }

  function weeklyTable(rows) {
    if (!rows.length) return emptyState('▤','Sem dados semanais','Registre entregas, custos ou ciclos para gerar esta análise.');
    return `<div class="table-wrap"><table><thead><tr><th>Semana</th><th>Entregas</th><th>Bruto</th><th>Reembolsos</th><th>Líquido</th><th>Custos</th><th>Saldo</th><th>KM</th><th>Ciclos</th><th>Ent./ciclo</th><th>KM/ciclo</th></tr></thead><tbody>${rows.map(r => `<tr><td><div class="cell-title">${esc(r.label)}</div><div class="cell-sub">${dateBR(r.week)} a ${dateBR(endOfWeek(r.week))}</div></td><td>${r.deliveries}</td><td>${money(r.grossRevenue)}</td><td>${money(r.refunds)}</td><td>${money(r.netRevenue)}</td><td>${money(r.costs)}</td><td>${money(r.netRevenue-r.costs)}</td><td>${number(r.km,1)} km</td><td>${r.cycles}</td><td>${number(r.deliveriesPerCycle,2)}</td><td>${number(r.kmPerCycle,2)} km</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderToday() {
    const date = todayISO();
    const deliveries = scoped(state.deliveries).filter(d => d.date === date);
    const purchases = deliveries.filter(isRootPurchase);
    const scheduled = scheduledForDate(date);
    const costs = scoped(state.costs).filter(c => c.date === date);
    const cycles = scoped(state.cycles).filter(c => c.date === date);
    const odometers = scoped(state.odometerLogs).filter(o => o.date === date);
    const issues = systemIssues({date,includeInfo:false});
    const critical = issues.filter(i=>i.severity==='critical');
    const warning = issues.filter(i=>i.severity==='warning');
    const openCycles = cycles.filter(c => !c.returnTime);
    const waiting = deliveries.filter(d => !isFinal(d) && !d.departureTime && !(d.scheduledDate && openScheduled(d)));
    const inRoute = deliveries.filter(d => d.status === 'Em rota');
    const totalDayKm = totalKmFromOdometers(odometers);
    const recommendation = operationRecommendation(date, deliveries, cycles, issues, odometers);
    const closure = dayClosure(date);
    const closeChecks = dayClosingChecks(date);

    $('#view').innerHTML = `
      <section class="v11-operation-hero ${closure?'closed-day':''}">
        <div class="v11-operation-hero-copy"><span class="eyebrow">CENTRAL DE OPERAÇÃO</span><h2>${closure?'Dia encerrado':'O que está acontecendo agora'}</h2><p>${closure?`Encerrado em ${dateTimeBR(closure.closedAt)}. Correções continuam permitidas e ficam no histórico.`:'Abra esta tela e veja imediatamente o que aguarda saída, o que está em rota e o que precisa de ação.'}</p></div>
        <div class="v11-operation-hero-actions"><div class="today-date-chip">${dateBR(date)}</div><button class="btn ${closure?'secondary':'primary'}" data-action="${closure?'reopen-day':'close-day'}">${closure?'↺ Reabrir dia':'✓ Encerrar operação do dia'}</button></div>
      </section>

      <section class="operation-pulse-grid">
        ${operationPulseCard('Aguardando saída',waiting.length,waiting.length?'Compras prontas para montar saída':'Nenhuma compra parada','▣',waiting.length?'focus':'success','scroll-deliveries')}
        ${operationPulseCard('Em rota',inRoute.length,`${openCycles.length} ciclo(s) aberto(s)`,'🚚',inRoute.length?'info':'success','scroll-cycles')}
        ${operationPulseCard('Precisa de atenção',critical.length+warning.length,`${critical.length} crítica(s) • ${warning.length} atenção`,'!',critical.length?'danger':warning.length?'warning':'success','go-pending')}
        ${operationPulseCard('Programadas para hoje',scheduled.length,scheduled.length?'Aguardando atendimento':'Nenhuma programação hoje','◷',scheduled.length?'warning':'info','scroll-scheduled')}
        ${operationPulseCard('KM rodado hoje',`${number(totalDayKm,1)} km`,`${odometers.filter(o=>odometerCalc(o).complete).length} veículo(s) fechado(s)`,'KM','info','scroll-odometer')}
      </section>

      <section class="next-best-action ${recommendation.tone}">
        <div class="next-best-icon">${recommendation.icon}</div>
        <div class="next-best-copy"><span>PRÓXIMA AÇÃO RECOMENDADA</span><h3>${esc(recommendation.title)}</h3><p>${esc(recommendation.text)}</p></div>
        <button class="btn primary" data-action="${recommendation.action}" ${recommendation.recordId?`data-id="${recommendation.recordId}"`:''}>${esc(recommendation.button)}</button>
      </section>

      <section class="v11-separated-section" id="todayDeliveriesSection">
        <div class="v11-section-number">1</div>
        <article class="card section-card v11-section-card">
          ${sectionHeader('▣','Entregas e próximas ações','Cada compra mostra uma linha do tempo clara. O botão principal muda automaticamente para a próxima ação correta.', `<button class="btn primary small" data-action="new-delivery">＋ Registrar compra</button>`)}
          ${operationCards(deliveries)}
        </article>
      </section>

      <section class="v11-separated-section" id="todayCyclesSection">
        <div class="v11-section-number">2</div>
        <article class="card section-card v11-section-card">
          ${sectionHeader('↻','Saídas, ciclos e roteiros','As entregas prioritárias ficam primeiro; as demais seguem a sequência dos bairros e podem ser abertas no Google Maps.', `<button class="btn primary small" data-action="start-cycle">🚚 Montar nova saída</button>`)}
          ${activeCycleCards(cycles)}
        </article>
      </section>

      <section class="v11-separated-section" id="todayOdometerSection">
        <div class="v11-section-number">3</div>
        <article class="card section-card v11-section-card">
          ${sectionHeader('KM','Quilometragem diária','KM inicial uma vez antes do veículo trabalhar; KM final uma vez no encerramento do expediente.', `<button class="btn primary small" data-action="new-odometer">＋ Registrar KM</button>`)}
          ${odometerDayCards(date)}
        </article>
      </section>

      <section class="v11-separated-section" id="todayIssuesSection">
        <div class="v11-section-number">4</div>
        <article class="card section-card v11-section-card">
          ${sectionHeader('!','Erros e pendências por prioridade','Vermelho significa crítica; amarelo significa atenção. O sistema mostra primeiro o que mais pode afetar a operação.', `<button class="btn secondary small" data-action="go-pending">Abrir central completa</button>`)}
          ${issueSummaryList(issues)}
        </article>
      </section>

      <section class="two-column v11-secondary-grid" id="todayScheduledSection">
        <article class="card section-card">${sectionHeader('◷','Programadas para hoje','Puxadas automaticamente pela data programada.')}${scheduledTable(scheduled,true)}</article>
        <article class="card section-card">${sectionHeader('R$','Custos de hoje','Combustível, manutenção e outros gastos.', `<button class="btn secondary small" data-action="new-cost">＋ Registrar custo</button>`)}${costMiniTable(costs)}</article>
      </section>

      <section class="day-close-checkpoint ${closeChecks.blockers.length?'has-blockers':'ready'}">
        <div><span>CHECKPOINT DO ENCERRAMENTO</span><h3>${closeChecks.blockers.length?`${closeChecks.blockers.length} bloqueio(s) antes de encerrar`:'Dia pronto para conferência final'}</h3><p>${closeChecks.blockers.length?'Resolva os pontos críticos para evitar ciclos, KM ou entregas com pontas soltas.':'Quando terminar o expediente, use o botão Encerrar operação do dia.'}</p></div>
        <button class="btn ${closeChecks.blockers.length?'secondary':'primary'}" data-action="close-day">Conferir encerramento</button>
      </section>
    `;
    bindViewActions();
  }

  function operationPulseCard(label,value,sub,icon,tone='info',action='') {
    return `<button class="operation-pulse-card ${tone}" ${action?`data-action="${action}"`:''}><span class="operation-pulse-icon">${icon}</span><span class="operation-pulse-copy"><small>${esc(label)}</small><strong>${value}</strong><em>${esc(sub)}</em></span></button>`;
  }

  function issueSummaryList(issues) {
    if (!issues.length) return emptyState('✓','Nenhuma pendência importante agora','A operação está sem situações críticas ou de atenção para hoje.');
    return `<div class="issue-summary-list">${issues.slice(0,8).map(issue=>systemIssueCard(issue,true)).join('')}</div>`;
  }

  function quickKpi(label,value,sub) { return `<article class="card quick-kpi"><span>${esc(label)}</span><strong>${value}</strong><small>${esc(sub)}</small></article>`; }

  function lastPurchaseSummary(date = todayISO()) {
    const roots = scoped(state.deliveries).filter(d => d.date === date && isRootPurchase(d));
    if (!roots.length) return { previous: null, suggested: '1' };
    const ordered = roots.slice().sort((a,b) => `${b.createdAt||''}`.localeCompare(`${a.createdAt||''}`));
    const previous = ordered[0];
    const numeric = roots.map(d => Number.parseInt(String(d.orderNo||'').replace(/\D/g,''),10)).filter(Number.isFinite);
    const suggested = numeric.length ? String(Math.max(...numeric) + 1) : '';
    return { previous, suggested };
  }

  function deliveryStatusClass(status='') {
    if (status === 'Finalizada') return 'is-finalized';
    if (status === 'Em rota') return 'is-route';
    if (status === 'Programada' || status === 'Reagendada') return 'is-scheduled';
    if (status === 'Devolvida' || status === 'Cancelada') return 'is-problem';
    if (status === 'Retirada na loja') return 'is-pickup';
    return 'is-store';
  }

  function workflowStep(n,title,sub,action) {
    return `<button class="workflow-step" data-action="${action}"><span class="workflow-number">${n}</span><span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span></button>`;
  }

  function activeCycleCards(cycles) {
    if (!cycles.length) return emptyState('↻','Nenhuma saída registrada hoje','Selecione uma ou mais entregas e clique em Montar nova saída.');
    const ordered = cycles.slice().sort((a,b)=>(b.departureTime||'').localeCompare(a.departureTime||''));
    return `<div class="active-cycle-grid">${ordered.map(c=>{
      const x=cycleCalc(c); const linked=scoped(state.deliveries).filter(d=>d.cycleId===c.id);
      const names=linked.slice(0,4).map(d=>d.coupon||'—').join(', ') + (linked.length>4?` +${linked.length-4}`:'');
      return `<article class="cycle-status-card ${c.returnTime?'closed':'open'}">
        <div class="cycle-status-head"><div><span>${c.returnTime?'CICLO FECHADO':'EM ROTA'}</span><strong>${esc(c.code)}</strong>${c.autoGenerated?'<small class="auto-cycle-label">↻ Identificado automaticamente</small>':''}</div>${c.returnTime?'<span class="badge green">Retornou</span>':'<span class="badge yellow">Em andamento</span>'}</div>
        <div class="cycle-status-route"><div><small>Saída</small><strong>${c.departureTime||'—'}</strong></div><span>→</span><div><small>Retorno</small><strong>${c.returnTime||'—'}</strong></div></div>
        <div class="cycle-status-meta"><span><b>${x.deliveries}</b> levadas</span><span><b>${x.delivered}</b> entregues</span><span><b>${x.returned}</b> voltaram</span><span><b>${esc(vehicle(c.vehicleId)?.name||'—')}</b></span><span><b>${esc(employee(c.driverId)?.name||'—')}</b></span></div>
        <div class="cycle-coupons">Cupons: ${esc(names||'—')}</div>
        <div class="cycle-status-actions">${!c.returnTime?`<button class="btn primary small" data-action="close-cycle" data-id="${c.id}">🏪 Registrar retorno</button>`:''}${cycleTrackActionHTML(c)}<button class="btn maps-route-btn small" data-action="open-cycle-route" data-id="${c.id}">⌖ Rota no Google Maps</button><button class="btn secondary small" data-action="manage-cycle-deliveries" data-id="${c.id}">▣ Gerenciar entregas</button><button class="btn secondary small" data-action="edit-cycle" data-id="${c.id}">Ajustar</button><button class="btn danger small" data-action="delete-record" data-type="cycle" data-id="${c.id}">Apagar</button></div>
      </article>`;
    }).join('')}</div>`;
  }


  function deliveryJourneyTimeline(d, cyc = null) {
    const returnTime = d.returnTime || cyc?.returnTime || '';
    const steps = [
      {label:'Compra',time:d.purchaseTime,done:!!d.purchaseTime,active:!d.departureTime && !isFinal(d)},
      {label:'Saída',time:d.departureTime,done:!!d.departureTime,active:!!d.departureTime && !d.finalizationTime && !['Devolvida','Retirada na loja','Cancelada'].includes(d.status)},
      {label:d.status==='Retirada na loja'?'Retirada':'Entregue ao cliente',time:d.finalizationTime || d.withdrawalTime || '',done:!!(d.finalizationTime || d.withdrawalTime || ['Devolvida','Retirada na loja','Cancelada'].includes(d.status)),active:!!d.departureTime && !d.finalizationTime && !['Devolvida','Retirada na loja','Cancelada'].includes(d.status)},
      {label:'Retorno à loja',time:returnTime,done:!!returnTime,active:!!d.finalizationTime && !returnTime && !!cyc && !cyc.returnTime}
    ];
    return `<div class="journey-timeline">${steps.map((step,index)=>`<div class="journey-step ${step.done?'done':''} ${step.active?'active':''}"><div class="journey-dot">${step.done?'✓':index+1}</div><div class="journey-step-copy"><small>${esc(step.label)}</small><strong>${step.time || (step.active?'Agora':'—')}</strong></div></div>`).join('')}</div>`;
  }

  function operationCards(deliveries) {
    if (!deliveries.length) return emptyState('▣','Nenhuma compra registrada hoje','Clique em Registrar compra para começar.');
    const sorted = deliveries.slice().sort((a,b) => {
      const routePriority = Number(Boolean(b.priority)) - Number(Boolean(a.priority));
      if (routePriority) return routePriority;
      const priority = d => {
        if (d.status==='Em rota' && !d.finalizationTime) return 0;
        if (!isFinal(d) && !d.departureTime) return 1;
        if (d.departureTime && d.finalizationTime && !d.returnTime) return 2;
        return 3;
      };
      const delayedA = currentWaitMinutes(a) > Number(state.settings.delayMinutes||120) ? -1 : 0;
      const delayedB = currentWaitMinutes(b) > Number(state.settings.delayMinutes||120) ? -1 : 0;
      return priority(a)-priority(b) || delayedA-delayedB || `${a.purchaseTime||''}`.localeCompare(`${b.purchaseTime||''}`);
    });

    return `<div class="operation-card-grid v11-operation-cards">${sorted.map(d => {
      const calc = deliveryCalc(d);
      const liveWait = d.departureTime ? calc.wait : currentWaitMinutes(d);
      const liveDelayed = liveWait !== null && liveWait > Number(state.settings.delayMinutes || 120);
      const progress = completionProgress(d);
      const livePurchaseToClient = progress.elapsed;
      const liveCompletionDelayed = progress.outside;
      const completionBalance = progress.balance;
      const root = rootDelivery(d);
      const refund = Number(root?.refundAmount || 0);
      const isFutureScheduled = d.scheduledDate && d.scheduledDate > todayISO() && openScheduled(d);
      const cyc = d.cycleId ? cycle(d.cycleId) : null;
      let mainAction = '';
      if (!isFinal(d) && !isFutureScheduled) {
        if (!d.departureTime) mainAction = `<button class="v11-primary-action" data-action="quick-departure" data-id="${d.id}"><span>🚚</span><div><b>Incluir em uma saída</b><small>Monte um ciclo com uma ou várias entregas</small></div><i>→</i></button>`;
        else if (d.departureTime && !d.finalizationTime && d.status!=='Devolvida') mainAction = `<button class="v11-primary-action success" data-action="quick-delivered" data-id="${d.id}"><span>✓</span><div><b>Marcar como entregue</b><small>Registra a hora individual na casa do cliente</small></div><i>→</i></button>`;
        else if (d.departureTime && !d.returnTime && cyc && !cyc.returnTime) mainAction = `<button class="v11-primary-action" data-action="close-cycle" data-id="${cyc.id}"><span>↻</span><div><b>Registrar retorno do ciclo</b><small>Use quando o entregador voltar ao mercado</small></div><i>→</i></button>`;
      }

      let secondaryActions = '';
      if (!isFinal(d) && !isFutureScheduled) {
        secondaryActions += `<button class="action-btn neutral" data-action="quick-reschedule" data-id="${d.id}">📅 Reagendar</button>`;
        secondaryActions += `<button class="action-btn neutral" data-action="quick-pickup" data-id="${d.id}">📦 Retirada na loja</button>`;
        secondaryActions += `<button class="action-btn neutral danger-text" data-action="quick-devolution" data-id="${d.id}">↩ Devolvida</button>`;
      }
      if (cyc) secondaryActions += `<button class="action-btn neutral maps-action" data-action="open-cycle-route" data-id="${cyc.id}">⌖ Abrir rota</button>`;
      secondaryActions += `<button class="action-btn neutral" data-action="edit-delivery" data-id="${d.id}">✏️ Editar</button>`;
      secondaryActions += `<button class="action-btn neutral danger-text" data-action="delete-record" data-type="delivery" data-id="${d.id}">🗑 Apagar</button>`;

      return `<article class="delivery-action-card clear-card v11-delivery-card ${deliveryStatusClass(d.status)} ${liveDelayed && !d.departureTime ? 'late':''} ${d.priority?'priority-delivery-card':''}">
        <div class="v11-delivery-head">
          <div class="v11-order-number"><span>COMPRA</span><strong>Nº ${esc(d.orderNo || '—')}</strong></div>
          <div class="v11-delivery-identification"><small>Nº DO CUPOM</small><strong>${esc(d.coupon || '—')}</strong><em>DOC ${esc(d.docNo || '—')} • Caixa ${esc(d.cashierNo || '—')} • ${esc(neighborhood(d.neighborhoodId)?.name || 'Sem bairro')}</em>${deliveryAddressLine(d)?`<em>Endereço: ${esc(deliveryAddressLine(d,true))}</em>`:''}${d.customerName || d.customerPhone ? `<em>Cliente: ${esc(d.customerName || 'Não informado')}${d.customerPhone ? ` • ${esc(d.customerPhone)}` : ''}</em>` : ''}</div>
          <div class="v11-delivery-head-status">${d.priority?'<span class="badge red priority-badge">★ PRIORIDADE</span>':''}${statusBadge(d.status)}${liveDelayed && !d.departureTime?'<span class="badge red">Saída fora</span>':''}${liveCompletionDelayed && !d.finalizationTime?'<span class="badge red">Entrega fora</span>':''}</div>
        </div>

        ${deliveryJourneyTimeline(d,cyc)}

        <div class="v11-delivery-insights">
          <div><small>Espera</small><strong class="${liveDelayed?'text-danger':''}">${fmtMinutes(liveWait)}</strong></div>
          <div><small>Loja → cliente</small><strong>${fmtMinutes(calc.toClient)}</strong></div>
          <div><small>Compra → cliente</small><strong class="${liveCompletionDelayed?'text-danger':''}">${fmtMinutes(livePurchaseToClient)}</strong></div>
          <div><small>${d.finalizationTime?'Resultado do prazo':'Prazo restante'}</small><strong class="${completionBalance !== null && completionBalance < 0?'text-danger':''}">${completionBalance === null?'—':completionBalance >= 0?`${fmtMinutes(completionBalance)} restantes`:`${fmtMinutes(Math.abs(completionBalance))} acima`}</strong></div>
          <div><small>Rota total</small><strong>${fmtMinutes(calc.route)}</strong></div>
          <div><small>Taxa</small><strong>${money(root?.fee || d.fee)}</strong></div>
        </div>

        ${cyc ? `<div class="v11-cycle-reference"><span>↻</span><div><strong>${esc(cyc.code)}</strong><small>${cycleCalc(cyc).deliveries} entrega(s) • saída ${cyc.departureTime||'—'} • ${esc(vehicle(cyc.vehicleId)?.name||'Sem veículo')}</small></div></div>`:''}
        ${isFutureScheduled ? `<div class="scheduled-note">📅 Programada para ${scheduledDateTimeLabel(d)}. O faturamento já foi contado na compra original e esta entrega não entra no indicador comum de atraso.${d.scheduleNotes?`<br><strong>Detalhes:</strong> ${esc(d.scheduleNotes)}`:''}</div>`:''}
        ${refund ? `<div class="refund-chip">Reembolso registrado: ${money(refund)}</div>`:''}

        ${mainAction ? `<div class="v11-next-action"><span>PRÓXIMA AÇÃO</span>${mainAction}</div>` : `<div class="v11-complete-state">✓ Nenhuma ação operacional pendente nesta entrega</div>`}
        <details class="v11-more-actions"><summary>Outras ações e correções</summary><div class="secondary-action-grid">${secondaryActions}</div></details>
      </article>`;
    }).join('')}</div>`;
  }

  function renderDeliveries() {
    const deliveries = searchedDeliveries().slice().sort((a,b) => `${b.date}${b.purchaseTime||''}`.localeCompare(`${a.date}${a.purchaseTime||''}`));
    const searchActive = Object.values(deliverySearch).some(value => String(value || '').trim());
    const resultLabel = searchActive ? `${deliveries.length} resultado(s) encontrado(s) em todo o histórico.` : `${deliveries.length} registros no recorte atual.`;
    $('#view').innerHTML = `
      <form id="deliverySearchForm" class="delivery-search-panel" role="search">
        <div class="delivery-search-intro"><strong>Pesquisar entregas</strong><small>Use um campo ou combine vários.</small></div>
        <label>Nº da compra, Nº do cupom ou DOC<input id="deliverySearchIdentifier" inputmode="numeric" value="${attr(deliverySearch.identifier)}" placeholder="Ex.: 17, 45879 ou 102548" /></label>
        <label>Nº do caixa<input id="deliverySearchCashier" inputmode="numeric" value="${attr(deliverySearch.cashier)}" placeholder="Ex.: 3" /></label>
        <label>Dia da compra<input id="deliverySearchDate" type="date" value="${attr(deliverySearch.date)}" /></label>
        <label>Nome do cliente<input id="deliverySearchCustomer" value="${attr(deliverySearch.customerName)}" autocomplete="name" placeholder="Ex.: Maria" /></label>
        <button class="btn primary compact" type="submit">Pesquisar</button>
        <button class="btn secondary compact" type="button" id="clearDeliverySearchBtn">Limpar</button>
      </form>
      <article class="card section-card">${sectionHeader('▣','Histórico de entregas',resultLabel, `<button class="btn primary small" data-action="new-delivery">＋ Nova entrega</button>`)}${deliveryTable(deliveries, searchActive)}</article>`;
    $('#deliverySearchForm')?.addEventListener('submit', event => {
      event.preventDefault();
      deliverySearch = {
        identifier: $('#deliverySearchIdentifier')?.value.trim() || '',
        cashier: $('#deliverySearchCashier')?.value.trim() || '',
        date: $('#deliverySearchDate')?.value || '',
        customerName: $('#deliverySearchCustomer')?.value.trim() || ''
      };
      render();
    });
    $('#clearDeliverySearchBtn')?.addEventListener('click', () => {
      deliverySearch = { identifier: '', cashier: '', date: '', customerName: '' };
      render();
    });
    bindViewActions();
  }

  function deliveryTable(deliveries, searchActive = false) {
    if (!deliveries.length) return emptyState('▣','Nenhuma entrega encontrada',searchActive ? 'Confira os dados pesquisados ou clique em Limpar.' : 'Registre uma nova entrega ou altere o recorte de análise.');
    return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Nº do cupom</th><th>Cliente</th><th>Bairro</th><th>Status</th><th>Taxa registrada</th><th>Reembolso</th><th>Compra → saída</th><th>Loja → cliente</th><th>Compra → cliente</th><th>Rota total</th><th>Padrões</th><th>Ações</th></tr></thead><tbody>${deliveries.map(d => {
      const calc = deliveryCalc(d);
      return `<tr>
        <td><div class="cell-title mono">${dateBR(d.date)}</div><div class="cell-sub">Entrada ${d.purchaseTime || '—'}</div></td>
        <td><div class="history-identification-number">${esc(d.coupon || '—')}</div><div class="history-identification-number">Compra ${esc(d.orderNo || '—')}</div><div class="cell-sub">DOC ${esc(d.docNo || '—')} • Caixa ${esc(d.cashierNo || '—')}</div></td>
        <td><div class="cell-title">${esc(d.customerName || '—')}</div><div class="cell-sub">${esc(d.customerPhone || 'Telefone não informado')}</div></td>
        <td>${esc(neighborhood(d.neighborhoodId)?.name || '—')}</td>
        <td>${statusBadge(d.status)}</td>
        <td>${money(rootDelivery(d)?.fee || d.fee)}</td>
        <td>${money(rootDelivery(d)?.refundAmount || 0)}</td>
        <td>${fmtMinutes(calc.wait)}</td>
        <td>${fmtMinutes(calc.toClient)}</td>
        <td><strong class="${calc.completionDelayed?'text-danger':''}">${fmtMinutes(calc.purchaseToClient)}</strong></td>
        <td>${fmtMinutes(calc.route)}</td>
        <td>${deliveryStandardBadges(d,calc)}</td>
        <td><div class="actions"><button class="btn secondary small" data-action="edit-delivery" data-id="${d.id}">Editar</button><button class="btn secondary small" data-action="trace-delivery" data-coupon="${attr(d.coupon)}">Rastrear</button><button class="btn danger small" data-action="delete-record" data-type="delivery" data-id="${d.id}">Apagar</button></div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderScheduled() {
    const summaries = allScheduleSummaries().sort((a,b)=>`${b.latestEvent.scheduledDate||''}${b.latestEvent.updatedAt||''}`.localeCompare(`${a.latestEvent.scheduledDate||''}${a.latestEvent.updatedAt||''}`));
    const list = scheduledOpen().slice().sort((a,b) => `${a.scheduledDate||''}${a.scheduledTime||'23:59'}`.localeCompare(`${b.scheduledDate||''}${b.scheduledTime||'23:59'}`));
    const agendaPending = list.filter(d => scheduledMomentPassed(d)).length;
    const today = list.filter(d => d.scheduledDate === todayISO()).length;
    const future = list.filter(d => d.scheduledDate > todayISO()).length;
    const delivered = summaries.filter(summary=>summary.delivered).length;
    const inService = summaries.filter(summary=>summary.started && summary.outcome.open).length;
    $('#view').innerHTML = `
      <section class="metrics-grid">
        ${cardMetric('Programadas abertas', list.length, 'Ainda não concluídas', '◷', 'purple')}
        ${cardMetric('Para hoje', today, dateBR(todayISO()), '⌂', 'blue')}
        ${cardMetric('Pendentes de agenda', agendaPending, 'Fora do indicador de atraso comum', '◷', agendaPending ? 'yellow':'green')}
        ${cardMetric('Em atendimento', inService, 'Já iniciadas e ainda não entregues', '→', 'yellow')}
        ${cardMetric('Já entregues', delivered, 'Após programação ou reagendamento', '✓', 'green')}
      </section>
      <article class="card section-card" style="margin-top:12px">${sectionHeader('◷','Programadas e reagendadas em aberto',`${future} futura(s). Somente compras ainda não entregues e cujo atendimento não começou.`)}${scheduledTable(list,true)}</article>
      <article class="card section-card" style="margin-top:12px">${sectionHeader('▤','Conferência das programações','Cada compra é verificada em todo o histórico antes de ser classificada como aberta, em atendimento ou entregue.')}${scheduleSummaryTable(summaries)}</article>
    `;
    bindViewActions();
  }

  function scheduleSummaryTable(summaries) {
    if (!summaries.length) return emptyState('▤','Nenhuma programação registrada','As programações e seus resultados aparecerão aqui.');
    return `<div class="table-wrap"><table><thead><tr><th>Último agendamento</th><th>Tipo</th><th>Compra / cupom</th><th>Cliente</th><th>Situação consolidada</th><th>Entrega no cliente</th><th>Histórico</th></tr></thead><tbody>${summaries.map(summary=>{
      const deliveredRecord=summary.outcome.delivered?summary.outcome.record:null;
      const situationTone=summary.delivered?'green':summary.open?'purple':summary.outcome.open?'yellow':summary.outcome.tone;
      return `<tr>
        <td><div class="cell-title mono">${scheduledDateTimeLabel(summary.latestEvent)}</div><div class="cell-sub">Origem ${dateBR(summary.root.date)}${summary.latestEvent.scheduleNotes?` • ${esc(summary.latestEvent.scheduleNotes)}`:''}</div></td>
        <td>${statusBadge(summary.kind)}</td>
        <td><div class="cell-title">Compra ${esc(summary.root.orderNo||'—')}</div><div class="cell-sub">Nº do cupom ${esc(summary.root.coupon||'—')}</div></td>
        <td><div class="cell-title">${esc(summary.root.customerName||'—')}</div><div class="cell-sub">${esc(summary.root.customerPhone||'Telefone não informado')}</div></td>
        <td><span class="badge ${situationTone}">${esc(summary.situation)}</span></td>
        <td>${deliveredRecord?`<div class="cell-title mono">${dateBR(deliveredRecord.date)} • ${deliveredRecord.finalizationTime||'horário não informado'}</div><div class="cell-sub">Tentativa ${deliveredRecord.attemptNo||1}</div>`:'—'}</td>
        <td><div class="cell-title">${summary.events.length} programação(ões)</div><div class="cell-sub">${summary.chain.length} tentativa(s) ligada(s)</div></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function scheduledTable(list, actions = false) {
    if (!list.length) return emptyState('◷','Nenhuma entrega programada aberta','Quando uma Data Programada for informada, a entrega aparecerá automaticamente aqui e no dia correto.');
    return `<div class="table-wrap"><table><thead><tr><th>Dia e horário</th><th>Tipo</th><th>Identificação</th><th>Cliente</th><th>Origem</th><th>Bairro</th><th>Motivo e detalhes</th><th>Próxima ação</th>${actions?'<th>Ações</th>':''}</tr></thead><tbody>${list.map(d => `<tr>
      <td><div class="cell-title mono">${scheduledDateTimeLabel(d)}</div>${scheduledMomentPassed(d) ? '<div class="cell-sub agenda-pending-label">Agenda pendente • sem atraso operacional</div>':'<div class="cell-sub">Dentro da agenda</div>'}</td>
      <td>${statusBadge(d.scheduleKind || 'Programada')}</td>
      <td><div class="cell-title">Nº do cupom ${esc(d.coupon || '—')}</div><div class="cell-sub">DOC ${esc(d.docNo || '—')} • Caixa ${esc(d.cashierNo || '—')}</div></td>
      <td><div class="cell-title">${esc(d.customerName || '—')}</div><div class="cell-sub">${esc(d.customerPhone || 'Telefone não informado')}</div></td>
      <td>${dateBR(d.date)}</td>
      <td><div class="cell-title">${d.priority?'★ PRIORIDADE • ':''}${esc(neighborhood(d.neighborhoodId)?.name || '—')}</div><div class="cell-sub">${esc(deliveryAddressLine(d) || 'Endereço exato não informado')}</div></td>
      <td><div class="cell-title">${esc(reason(d.reasonId)?.name || d.reasonText || '—')}</div><div class="cell-sub">${esc(d.scheduleNotes || 'Sem detalhes adicionais')}</div></td>
      <td>${esc(d.nextAction || '—')}</td>
      ${actions ? `<td><div class="actions"><button class="btn primary small" data-action="start-scheduled" data-id="${d.id}">Iniciar atendimento</button><button class="btn secondary small" data-action="edit-delivery" data-id="${d.id}">Editar</button></div></td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
  }

  function renderPending() {
    const list = systemIssues({includeInfo:true});
    const critical = list.filter(i=>i.severity==='critical');
    const warning = list.filter(i=>i.severity==='warning');
    const info = list.filter(i=>i.severity==='info');
    $('#view').innerHTML = `
      <section class="pending-severity-overview">
        ${severitySummary('Críticas',critical.length,'Precisam de ação imediata','critical')}
        ${severitySummary('Atenção',warning.length,'Devem ser conferidas','warning')}
        ${severitySummary('Informativas',info.length,'Acompanhamento e lembretes','info')}
      </section>
      <section class="pending-severity-groups">
        ${issueGroup('critical','Críticas','Erros e situações que podem comprometer a operação ou os indicadores.',critical)}
        ${issueGroup('warning','Atenção','Itens que precisam de conferência para evitar pendências futuras.',warning)}
        ${issueGroup('info','Informativas','Lembretes operacionais e situações em acompanhamento.',info)}
      </section>
    `;
    bindViewActions();
  }

  function severitySummary(label,count,sub,tone) {
    return `<article class="severity-summary ${tone}"><span>${tone==='critical'?'!':tone==='warning'?'△':'i'}</span><div><small>${esc(label)}</small><strong>${count}</strong><em>${esc(sub)}</em></div></article>`;
  }

  function issueGroup(tone,title,subtitle,issues) {
    const emptyTitle = {
      'Críticas': 'Nenhuma pendência crítica',
      'Atenção': 'Nenhuma pendência de atenção',
      'Informativas': 'Nenhuma pendência informativa'
    }[title] || 'Nenhuma pendência nesta prioridade';
    return `<article class="card issue-group ${tone}"><div class="issue-group-head"><div><span>${esc(title.toUpperCase())}</span><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div><strong>${issues.length}</strong></div>${issues.length?`<div class="system-issue-grid">${issues.map(issue=>systemIssueCard(issue,false)).join('')}</div>`:emptyState('✓',emptyTitle,'Não há itens nesta prioridade.')}</article>`;
  }

  function systemIssueCard(issue,compact=false) {
    let actionHtml = '';
    if (issue.action === 'edit-delivery') actionHtml = `<button class="btn secondary small" data-action="edit-delivery" data-id="${issue.recordId}">Resolver</button>`;
    else if (issue.action === 'close-cycle') actionHtml = `<button class="btn primary small" data-action="close-cycle" data-id="${issue.recordId}">Registrar retorno</button>`;
    else if (issue.action === 'edit-cycle') actionHtml = `<button class="btn secondary small" data-action="edit-cycle" data-id="${issue.recordId}">Abrir ciclo</button>`;
    else if (issue.action === 'edit-odometer') actionHtml = `<button class="btn secondary small" data-action="edit-odometer" data-id="${issue.recordId}">Corrigir KM</button>`;
    return `<div class="system-issue-card ${issue.severity} ${compact?'compact':''}"><div class="system-issue-indicator">${issue.severity==='critical'?'!':issue.severity==='warning'?'△':'i'}</div><div class="system-issue-copy"><strong>${esc(issue.title)}</strong><p>${esc(issue.detail)}</p><small>${dateBR(issue.relatedDate || issue.date)}${issue.meta?` • ${esc(issue.meta)}`:''}</small></div>${actionHtml}</div>`;
  }

  function pendingAlertList(list) {
    if (!list.length) return emptyState('✓','Nenhuma atenção aberta','A operação de hoje não tem pendências registradas.');
    return `<div class="alert-list">${list.slice(0,12).map(d => `<div class="alert-item ${pendingReasons(d).some(x=>/fora do padrão|mais de 3h30/i.test(x))?'red':'blue'}"><strong>Nº do cupom ${esc(d.coupon || '—')}</strong><p>${esc(pendingReasons(d).join(' • '))}</p></div>`).join('')}</div>`;
  }

  function renderCycles() {
    const list = filteredCycles().slice().sort((a,b) => `${b.date}${b.departureTime||''}`.localeCompare(`${a.date}${a.departureTime||''}`));
    const odometers = filteredOdometers();
    const totalKm = totalKmFromOdometers(odometers);
    const carried = sum(list.map(c=>cycleCalc(c).deliveries));
    $('#view').innerHTML = `
      <section class="hero-strip cycle-hero">
        <div><span class="eyebrow">PRODUTIVIDADE DAS SAÍDAS</span><h2>Ciclos de entrega</h2><p>Regra oficial do sistema: 1 ciclo começa quando o entregador sai da loja e termina quando ele retorna ao mercado. Uma saída pode levar uma ou várias entregas.</p></div>
        <div class="hero-meta"><span class="hero-chip">${list.length} ciclos</span><span class="hero-chip">${carried} entregas levadas</span></div>
      </section>
      <section class="metrics-grid">
        ${cardMetric('Ciclos',list.length,'Saídas no recorte','↻','purple')}
        ${cardMetric('Entregas levadas / ciclo',number(list.length?carried/list.length:0,2),'Média de volumes por saída','▣','blue')}
        ${cardMetric('KM médio / ciclo',`${number(list.length?totalKm/list.length:0,2)} km`,'KM diário total ÷ ciclos','KM','green')}
        ${cardMetric('Tempo médio do ciclo',fmtMinutes(avg(list.map(c=>cycleCalc(c).minutes))),'Saída → retorno','◷','yellow')}
        ${cardMetric('KM total',`${number(totalKm,1)} km`,'A partir dos odômetros diários','↗','blue')}
      </section>
      <article class="card section-card" style="margin-top:12px">${sectionHeader('↻','Histórico de ciclos e roteiros','Cada saída pode abrir sua ordem de entregas por prioridade e bairro no Google Maps. O odômetro continua diário e separado.', `<div class="actions"><button class="btn secondary small" data-action="auto-detect-cycles">↻ Detectar saídas já registradas</button><button class="btn primary small" data-action="start-cycle">🚚 Montar nova saída</button></div>`)}${cycleTable(list)}</article>
    `;
    bindViewActions();
  }
  function setRouteHistoryRange(type) {
    const today=todayISO(),year=today.slice(0,4),month=today.slice(5,7);
    $('#filterYear').value=year;
    $('#filterMonth').value=''; $('#filterWeek').value=''; $('#filterStart').value=''; $('#filterEnd').value='';
    if(type==='today'){ $('#filterStart').value=today; $('#filterEnd').value=today; }
    else if(type==='week'){ $('#filterStart').value=startOfWeek(today); $('#filterEnd').value=endOfWeek(today); }
    else if(type==='month'){ $('#filterMonth').value=month; refreshWeekOptions(); }
    else { $('#filterStart').focus(); return; }
    render();
  }
  function routeHistoryTrackCard(track) {
    const c=cycle(track.cycleId),linked=scoped(state.deliveries).filter(d=>d.cycleId===track.cycleId);
    const completed=linked.filter(deliveredToCustomer).length,returned=linked.filter(d=>d.returnedUndelivered||d.status==='Devolvida').length;
    const isSelected=track.id===routeHistorySelectedTrackId;
    const localLive=activeRouteCycleId===track.cycleId&&activeRouteWatchId!==null;
    return `<article class="route-history-card ${isSelected?'selected':''}" data-action="select-route-track" data-id="${track.id}" tabindex="0">
      <div class="route-history-card-head"><div><span>${dateBR(track.date)} • ${esc(c?.code||'Ciclo removido')}</span><strong>${esc(employee(track.driverId)?.name||'Entregador não informado')}</strong><small>${esc(vehicle(track.vehicleId)?.name||'Veículo não informado')} • ${track.points.length} ponto(s) GPS</small></div><span class="route-track-status ${localLive?'live':track.status}">${localLive?'● GPS ativo':esc(routeTrackStatusLabel(track))}</span></div>
      <div class="route-history-card-kpis"><span><b>${number(track.distanceKm,2)} km</b>GPS</span><span><b>${fmtMinutes(routeTrackDurationMinutes(track))}</b>duração</span><span><b>${linked.length}</b>levadas</span><span><b>${completed}</b>entregues</span><span><b>${returned}</b>voltaram</span></div>
      <div class="route-history-card-time"><span>Início <b>${track.startedAt?dateTimeBR(track.startedAt):`${dateBR(track.date)} • ${c?.departureTime||'—'}`}</b></span><span>Fim <b>${track.endedAt?dateTimeBR(track.endedAt):c?.returnTime||'Em andamento'}</b></span></div>
      <div class="route-history-card-actions">${track.points.length>1?`<button class="btn maps-route-btn small" data-action="open-recorded-route" data-id="${track.id}">Google Maps</button>`:''}${c?`<button class="btn secondary small" data-action="open-cycle-route" data-id="${c.id}">Roteiro planejado</button>`:''}${!c?.returnTime?cycleTrackActionHTML(c):''}</div>
    </article>`;
  }
  function renderRouteHistory() {
    const range=selectedRange();
    const tracks=filteredRouteTracks().slice().sort((a,b)=>`${b.date}${b.startedAt||''}`.localeCompare(`${a.date}${a.startedAt||''}`));
    if(!tracks.some(track=>track.id===routeHistorySelectedTrackId)) routeHistorySelectedTrackId=tracks.find(track=>track.points.length)?.id||tracks[0]?.id||'';
    const withGps=tracks.filter(track=>track.points.length),distance=sum(withGps.map(track=>track.distanceKm));
    const cycleIds=new Set(tracks.map(track=>track.cycleId));
    const deliveries=scoped(state.deliveries).filter(d=>cycleIds.has(d.cycleId));
    const delivered=deliveries.filter(deliveredToCustomer).length;
    const active=tracks.filter(track=>track.status==='recording'&&!track.endedAt).length;
    const driverIds=unique([...state.employees.filter(e=>e.active).map(e=>e.id),...scoped(state.routeTracks).map(track=>track.driverId).filter(Boolean)]);
    $('#view').innerHTML=`
      <section class="route-history-hero">
        <div><span>HISTÓRICO DE ROTAS • GPS</span><h2>Trajeto real do entregador</h2><p>Consulte por dia, semana, mês ou período específico. Os pontos são salvos no celular mesmo sem internet e sincronizados quando a conexão volta.</p></div>
        <div class="route-history-live"><i class="${active?'active':''}"></i><strong>${active?`${active} rota(s) em gravação`:'Nenhuma rota gravando agora'}</strong><small>${active?'Atualização conforme o GPS do celular':'Ative o GPS em um ciclo aberto'}</small></div>
      </section>
      <section class="route-history-toolbar card">
        <div class="route-range-buttons"><button class="btn secondary small" data-route-range="today">Hoje</button><button class="btn secondary small" data-route-range="week">Esta semana</button><button class="btn secondary small" data-route-range="month">Este mês</button><button class="btn secondary small" data-route-range="custom">Período específico</button></div>
        <label>Entregador<select id="routeHistoryDriver"><option value="">Todos os entregadores</option>${driverIds.map(id=>`<option value="${attr(id)}" ${id===routeHistoryDriverId?'selected':''}>${esc(employee(id)?.name||'Colaborador removido')}</option>`).join('')}</select></label>
        <div class="route-history-range-label"><small>PERÍODO PESQUISADO</small><strong>${esc(range.label)}</strong></div>
      </section>
      <section class="route-history-metrics">
        ${cardMetric('Rotas no período',tracks.length,`${withGps.length} com pontos GPS`,'⌁','blue')}
        ${cardMetric('Distância GPS',`${number(distance,2)} km`,'Soma dos trajetos registrados','KM','green')}
        ${cardMetric('Entregas levadas',deliveries.length,`${delivered} finalizadas no cliente`,'▣','yellow')}
        ${cardMetric('Entregadores',unique(tracks.map(track=>track.driverId).filter(Boolean)).length,'Com ciclo no período','●','purple')}
      </section>
      <section class="route-history-layout">
        <article class="card route-map-panel">
          ${sectionHeader('⌁','Mapa de todas as rotas',`${withGps.length} trajeto(s) real(is) no período. Os marcadores amarelos representam entregas finalizadas próximas ao ponto GPS.`)}
          ${routeTracksMapHTML(withGps,routeHistorySelectedTrackId)}
          <div class="route-map-note"><strong>Como funciona:</strong> o desenho usa as coordenadas reais guardadas pelo celular. O botão Google Maps abre uma aproximação pelas ruas e precisa de internet.</div>
        </article>
        <aside class="route-history-list-panel">
          <div class="route-history-list-head"><div><strong>Rotas encontradas</strong><small>Toque em uma rota para destacá-la no mapa.</small></div><span>${tracks.length}</span></div>
          <div class="route-history-list">${tracks.length?tracks.map(routeHistoryTrackCard).join(''):emptyState('⌁','Nenhuma rota neste período','Altere os filtros ou inicie um ciclo com o GPS ativado.')}</div>
        </aside>
      </section>`;
    bindViewActions();
    $('#routeHistoryDriver')?.addEventListener('change',event=>{routeHistoryDriverId=event.target.value;routeHistorySelectedTrackId='';render();});
    $$('[data-route-range]').forEach(button=>button.addEventListener('click',()=>setRouteHistoryRange(button.dataset.routeRange)));
  }
  function cycleTable(list) {
    if (!list.length) return emptyState('↻','Nenhum ciclo registrado','Monte uma saída selecionando uma ou mais entregas.');
    return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Ciclo</th><th>Veículo</th><th>Entregador</th><th>Saída</th><th>Retorno</th><th>Levadas</th><th>Entregues</th><th>Voltaram</th><th>Média KM/ciclo do dia</th><th>Tempo</th><th>Ações</th></tr></thead><tbody>${list.map(c => { const x=cycleCalc(c); return `<tr>
      <td>${dateBR(c.date)}</td><td><div class="cell-title">${esc(c.code)}</div><div class="cell-sub">${c.autoGenerated?'<span class="badge blue">Automático</span> ':''}${c.returnTime?'Fechado':'Em rota'}</div></td><td>${esc(vehicle(c.vehicleId)?.name || '—')}</td><td>${esc(employee(c.driverId)?.name || '—')}</td><td>${c.departureTime || '—'}</td><td>${c.returnTime || '—'}</td><td><strong>${x.deliveries}</strong></td><td><strong>${x.delivered}</strong></td><td><strong>${x.returned}</strong></td><td>${number(x.km,2)} km</td><td>${fmtMinutes(x.minutes)}</td><td><div class="actions">${!c.returnTime?`<button class="btn primary small" data-action="close-cycle" data-id="${c.id}">Registrar retorno</button>`:''}${cycleTrackActionHTML(c)}<button class="btn maps-route-btn small" data-action="open-cycle-route" data-id="${c.id}">Rota</button><button class="btn secondary small" data-action="manage-cycle-deliveries" data-id="${c.id}">Gerenciar entregas</button><button class="btn secondary small" data-action="edit-cycle" data-id="${c.id}">Ajustar</button><button class="btn danger small" data-action="delete-record" data-type="cycle" data-id="${c.id}">Apagar</button></div></td>
    </tr>`; }).join('')}</tbody></table></div>`;
  }
  function cycleMiniTable(list) {
    if (!list.length) return emptyState('↻','Nenhum ciclo hoje','Monte a primeira saída selecionando as entregas que irão juntas.');
    return `<div class="stat-list">${list.slice(0,6).map(c => { const x=cycleCalc(c); return statRow(c.code, `${x.deliveries} entrega(s) levada(s)`, `${c.autoGenerated?'Automático • ':''}${c.returnTime?'Fechado':'Em rota'} • ${number(x.km,2)} km médios/ciclo • ${fmtMinutes(x.minutes)}`); }).join('')}</div>`;
  }
  function renderOdometer() {
    const logs = filteredOdometers().slice().sort((a,b) => `${b.date}${vehicle(b.vehicleId)?.name||''}`.localeCompare(`${a.date}${vehicle(a.vehicleId)?.name||''}`));
    const cycles = filteredCycles();
    const deliveries = filteredDeliveries().filter(deliveredToCustomer);
    const totalKm = totalKmFromOdometers(logs);
    const closedDays = unique(logs.filter(o=>odometerCalc(o).complete).map(o=>o.date)).length;
    const dayDivisor = closedDays || 1;
    $('#view').innerHTML = `
      <section class="hero-strip mileage-hero">
        <div><h2>Quilometragem real da frota</h2><p>Informe somente KM inicial e final de cada veículo por dia. O sistema calcula dia, semana, mês, ano e médias automaticamente.</p></div>
        <div class="hero-meta"><span class="hero-chip">${number(totalKm,1)} km no período</span><span class="hero-chip">${logs.filter(o=>odometerCalc(o).complete).length} fechamentos</span></div>
      </section>
      <section class="metrics-grid">
        ${cardMetric('KM total',`${number(totalKm,1)} km`,'Soma dos fechamentos diários','KM','blue')}
        ${cardMetric('KM médio por dia',`${number(totalKm/dayDivisor,1)} km`,`${closedDays} ${closedDays === 1 ? 'dia fechado' : 'dias fechados'}`,'↗','green')}
        ${cardMetric('KM médio por ciclo',`${number(cycles.length?totalKm/cycles.length:0,2)} km`,`${cycles.length} ciclos`,'↻','purple')}
        ${cardMetric('KM por entrega',`${number(deliveries.length?totalKm/deliveries.length:0,2)} km`,`${deliveries.length} finalizadas`,'▣','yellow')}
        ${cardMetric('Fechamentos pendentes',logs.filter(o=>!odometerCalc(o).complete).length,'KM final ainda não informado','!','red')}
      </section>
      <section class="dashboard-grid equal">
        <article class="card section-card">${sectionHeader('▥','KM por dia','Evolução da quilometragem no período.')}<div class="chart-box small">${lineChartHTML(groupOdometerKmByDate(logs),'#2E73B9')}</div></article>
        <article class="card section-card">${sectionHeader('KM','KM por veículo','Comparação da quilometragem total por veículo.')}<div class="chart-box small">${horizontalBarChartHTML(groupOdometerKmByVehicle(logs),'#2EA8A1')}</div></article>
      </section>
      <article class="card section-card" style="margin-top:12px">${sectionHeader('KM','Histórico de KM diário','Um registro por veículo e por dia. Nunca é necessário informar KM em cada ciclo.', `<button class="btn primary small" data-action="new-odometer">＋ Registrar KM do dia</button>`)}${odometerTable(logs)}</article>
    `;
    bindViewActions();
  }

  function groupOdometerKmByDate(logs) {
    const map = {};
    logs.forEach(o => map[o.date] = (map[o.date] || 0) + odometerCalc(o).km);
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({label:dateBR(date).slice(0,5),value}));
  }
  function groupOdometerKmByVehicle(logs) {
    const map = {};
    logs.forEach(o => { const name=vehicle(o.vehicleId)?.name||'Sem veículo'; map[name]=(map[name]||0)+odometerCalc(o).km; });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([label,value])=>({label,value}));
  }
  function odometerTable(logs) {
    if (!logs.length) return emptyState('KM','Nenhum KM diário registrado','Comece informando o KM inicial de um veículo no início do dia.');
    return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Veículo</th><th>KM inicial</th><th>KM final</th><th>KM rodado</th><th>Ciclos</th><th>Entregas</th><th>Ent./ciclo</th><th>KM/ciclo</th><th>Status</th><th>Ação</th></tr></thead><tbody>${logs.map(o=>{const s=vehicleDayStats(o.date,o.vehicleId);const calc=odometerCalc(o);return `<tr>
      <td>${dateBR(o.date)}</td><td><div class="cell-title">${esc(vehicle(o.vehicleId)?.name||'—')}</div></td><td>${number(o.kmStart,1)}</td><td>${o.kmEnd?number(o.kmEnd,1):'—'}</td><td><strong>${number(calc.km,1)} km</strong></td><td>${s.cycles}</td><td>${s.deliveries}</td><td>${number(s.deliveriesPerCycle,2)}</td><td>${number(s.kmPerCycle,2)} km</td><td>${calc.invalid?'<span class="badge red">KM inválido</span>':calc.complete?'<span class="badge green">Fechado</span>':'<span class="badge yellow">Aberto</span>'}</td><td><button class="btn secondary small" data-action="edit-odometer" data-id="${o.id}">Editar</button><button class="btn danger small" data-action="delete-record" data-type="odometer" data-id="${o.id}">Apagar</button></td>
    </tr>`}).join('')}</tbody></table></div>`;
  }

  function odometerDayCards(date) {
    const activeVehicles=state.vehicles.filter(v=>v.active);
    if(!activeVehicles.length) return emptyState('KM','Nenhum veículo ativo','Cadastre um veículo em Cadastros.');
    return `<div class="odometer-card-grid">${activeVehicles.map(v=>{const s=vehicleDayStats(date,v.id),o=s.log,calc=odometerCalc(o),hasMovement=s.cycles>0||s.deliveries>0;let actionLabel='Abrir expediente • KM inicial';if(o&&!calc.complete)actionLabel='Fechar expediente • KM final';if(calc.complete)actionLabel='Editar fechamento';return `<article class="odometer-vehicle-card ${calc.complete?'closed':hasMovement?'needs-close':''}">
      <div class="odometer-card-head"><div><span>VEÍCULO</span><strong>${esc(v.name)}</strong><small>${esc([v.plate,v.type].filter(Boolean).join(' • ')||'Quilometragem diária')}</small></div>${calc.complete?'<span class="badge green">Expediente fechado</span>':o?'<span class="badge yellow">KM final pendente</span>':hasMovement?'<span class="badge red">KM inicial ausente</span>':'<span class="badge blue">Aguardando início</span>'}</div>
      <div class="odometer-main"><div><small>KM inicial do expediente</small><strong>${o?.kmStart?number(o.kmStart,1):'—'}</strong></div><div class="odometer-arrow">→</div><div><small>KM final do expediente</small><strong>${o?.kmEnd?number(o.kmEnd,1):'—'}</strong></div><div class="odometer-total"><small>TOTAL RODADO NO DIA</small><strong>${number(s.km,1)} km</strong></div></div>
      <div class="odometer-stats"><div><span>Ciclos</span><strong>${s.cycles}</strong></div><div><span>Entregas levadas</span><strong>${s.deliveries}</strong></div><div><span>Ent./ciclo</span><strong>${number(s.deliveriesPerCycle,2)}</strong></div><div><span>KM/ciclo</span><strong>${number(s.kmPerCycle,2)}</strong></div><div><span>KM/entrega</span><strong>${number(s.kmPerDelivery,2)}</strong></div></div>
      <button class="btn ${o?'secondary':'primary'} small odometer-card-action" data-action="${o?'edit-odometer':'new-odometer'}" ${o?`data-id="${o.id}"`:`data-vehicle-id="${v.id}"`}>${actionLabel}</button>
    </article>`}).join('')}</div>`;
  }
  function renderCosts() {
    const list = filteredCosts().slice().sort((a,b) => `${b.date}${b.time||''}`.localeCompare(`${a.date}${a.time||''}`));
    const deliveries = filteredDeliveries().filter(deliveredToCustomer);
    const cycles = filteredCycles();
    const odometers = filteredOdometers();
    const total = sum(list.map(c=>c.value));
    const fuel = sum(list.filter(c=>category(c.categoryId)?.name==='Combustível').map(c=>c.value));
    const maintenance = sum(list.filter(c=>/Manutenção/i.test(category(c.categoryId)?.name||'')).map(c=>c.value));
    const totalKm = totalKmFromOdometers(odometers);
    $('#view').innerHTML = `
      <section class="metrics-grid">
        ${cardMetric('Custos totais',money(total),`${list.length} registros`,'R$','red')}
        ${cardMetric('Combustível',money(fuel),`${money(deliveries.length?fuel/deliveries.length:0)} por entrega`,'⛽','yellow')}
        ${cardMetric('Manutenção',money(maintenance),'Preventiva + corretiva','M','purple')}
        ${cardMetric('Custo por entrega',money(deliveries.length?total/deliveries.length:0),'Média do período','CE','blue')}
        ${cardMetric('Custo por KM',money(totalKm?total/totalKm:0),`${number(totalKm,1)} km registrados`,'KM','green')}
      </section>
      <section class="dashboard-grid equal">
        <article class="card section-card">${sectionHeader('◉','Custos por categoria','Distribuição de todos os gastos registrados.')}<div class="chart-box small">${donutChartHTML(buildCostCategoryRows(list))}</div></article>
        <article class="card section-card">${sectionHeader('▥','Custos por dia','Evolução dos gastos no período.')}<div class="chart-box small">${lineChartHTML(groupSumByDate(list,'value'),'#D95C5C')}</div></article>
      </section>
      <article class="card section-card" style="margin-top:12px">${sectionHeader('R$','Histórico detalhado de custos','Cada gasto fica registrado com data, veículo, categoria, descrição, valor e responsável.', `<button class="btn primary small" data-action="new-cost">＋ Registrar custo</button>`)}${costTable(list)}</article>
    `;
    bindViewActions();
  }

  function costTable(list) {
    if (!list.length) return emptyState('R$','Nenhum custo registrado','Registre combustível, manutenção ou outro gasto da frota.');
    return `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Veículo</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>KM atual</th><th>Fornecedor</th><th>Ação</th></tr></thead><tbody>${list.map(c => `<tr>
      <td><div class="cell-title">${dateBR(c.date)}</div><div class="cell-sub">${c.time || ''}</div></td>
      <td>${esc(vehicle(c.vehicleId)?.name || '—')}</td>
      <td><span class="badge blue">${esc(category(c.categoryId)?.name || '—')}</span></td>
      <td><div class="cell-title">${esc(c.description || '—')}</div><div class="cell-sub">${esc(c.receiptNo ? `Comprovante ${c.receiptNo}`:'')}</div></td>
      <td><div class="cell-title">${money(c.value)}</div></td>
      <td>${c.km ? `${number(c.km,0)} km`:'—'}</td>
      <td>${esc(c.supplier || '—')}</td>
      <td><button class="btn secondary small" data-action="edit-cost" data-id="${c.id}">Editar</button><button class="btn danger small" data-action="delete-record" data-type="cost" data-id="${c.id}">Apagar</button></td>
    </tr>`).join('')}</tbody></table></div>`;
  }

  function costMiniTable(list) {
    if (!list.length) return emptyState('R$','Nenhum custo hoje','Registre combustível, manutenção ou outros gastos.');
    return `<div class="stat-list">${list.slice(0,6).map(c => statRow(category(c.categoryId)?.name || 'Custo', money(c.value), `${vehicle(c.vehicleId)?.name || 'Sem veículo'} • ${c.description || ''}`)).join('')}</div>`;
  }

  function renderNeighborhoods() {
    const deliveries = filteredDeliveries();
    const rows = buildNeighborhoodRows(deliveries);
    const topDelivery = rows[0];
    const topRevenue = [...rows].sort((a,b)=>b.revenue-a.revenue)[0];
    const topWrong = [...rows].sort((a,b)=>b.wrongAddress-a.wrongAddress)[0];
    const topScheduled = [...rows].sort((a,b)=>b.scheduled-a.scheduled)[0];
    const topRescheduled = [...rows].sort((a,b)=>b.rescheduled-a.rescheduled)[0];
    $('#view').innerHTML = `
      <section class="metrics-grid">
        ${cardMetric('Mais entregas',topDelivery?.name || '—',topDelivery ? `${topDelivery.deliveries} entregas`:'Sem dados','1º','blue')}
        ${cardMetric('Maior faturamento',topRevenue?.name || '—',topRevenue ? money(topRevenue.revenue):'Sem dados','R$','green')}
        ${cardMetric('Mais endereço errado',topWrong?.name || '—',topWrong ? `${topWrong.wrongAddress} ocorrências`:'Sem dados','!','red')}
        ${cardMetric('Mais programações registradas',topScheduled?.name || '—',topScheduled ? `${topScheduled.scheduled} no histórico`:'Sem dados','◷','purple')}
        ${cardMetric('Mais reagendamentos registrados',topRescheduled?.name || '—',topRescheduled ? `${topRescheduled.rescheduled} no histórico`:'Sem dados','↻','yellow')}
      </section>
      <section class="dashboard-grid equal">
        <article class="card section-card">${sectionHeader('◎','Top bairros por entregas','Quantidade de entregas finalizadas.')}<div class="chart-box">${horizontalBarChartHTML(rows.slice(0,10).map(r=>({label:r.name,value:r.deliveries})),'#2E73B9')}</div></article>
        <article class="card section-card">${sectionHeader('!','Ocorrências históricas por bairro','Endereço errado, devolução, reagendamento e atraso registrados.')}<div class="chart-box">${problemNeighborhoodChartHTML(rows.slice().sort((a,b)=>b.problemCount-a.problemCount).slice(0,8))}</div></article>
      </section>
      <article class="card section-card" style="margin-top:12px">${sectionHeader('▤','Tabela completa por bairro','Compare volume, faturamento, qualidade e taxa de problemas.')}${neighborhoodTable(rows)}</article>
    `;
  }

  function buildNeighborhoodRows(deliveries) {
    const allRecords = scoped(state.deliveries);
    return state.neighborhoods.map(n => {
      const all = deliveries.filter(d => d.neighborhoodId === n.id);
      const purchases = all.filter(isRootPurchase);
      const scheduleSummaries = purchases.map(root=>scheduleSummary(root,allRecords)).filter(Boolean);
      const devolutions = all.filter(d => d.status === 'Devolvida').length;
      const wrongAddress = all.filter(d => d.reasonId === 'ENDERECO_ERRADO').length;
      const scheduled = sum(scheduleSummaries.map(summary=>summary.events.filter(d=>(d.scheduleKind || 'Programada')==='Programada').length));
      const rescheduled = sum(scheduleSummaries.map(summary=>summary.events.filter(d=>d.scheduleKind==='Reagendada').length));
      const scheduledOpen = scheduleSummaries.filter(summary=>summary.open&&summary.kind==='Programada').length;
      const rescheduledOpen = scheduleSummaries.filter(summary=>summary.open&&summary.kind==='Reagendada').length;
      const scheduledDelivered = scheduleSummaries.filter(summary=>summary.delivered).length;
      const delayed = all.filter(d => deliveryCalc(d).delayed).length;
      const problemCount = devolutions + wrongAddress + rescheduled + delayed;
      return {
        id:n.id,name:n.name,
        deliveries:purchases.filter(root=>rootWasFinalized(root,allRecords)).length,
        totalPurchases:purchases.length,
        revenue:sum(purchases.map(d=>Number(d.fee||0)-Number(d.refundAmount||0))),
        devolutions, wrongAddress, scheduled, rescheduled, scheduledOpen, rescheduledOpen, scheduledDelivered, delayed, problemCount,
        totalRecords:all.length,
        returnRate:all.length ? devolutions/all.length*100 : 0,
        problemRate:all.length ? problemCount/all.length*100 : 0,
        avgWait:avg(all.map(d=>deliveryCalc(d).wait)),
        avgRoute:avg(all.map(d=>deliveryCalc(d).route))
      };
    }).filter(r => r.totalRecords > 0).sort((a,b)=>b.deliveries-a.deliveries);
  }

  function neighborhoodTable(rows) {
    if (!rows.length) return emptyState('◎','Sem dados de bairros','As análises serão criadas automaticamente a partir das entregas.');
    return `<div class="table-wrap"><table><thead><tr><th>Bairro</th><th>Compras entregues</th><th>Faturamento</th><th>End. errado</th><th>Programações registradas</th><th>Reagendamentos registrados</th><th>Programadas abertas</th><th>Reagendadas abertas</th><th>Entregues após programação</th><th>Devoluções</th><th>Atrasadas</th><th>Taxa devolução</th><th>Taxa problemas</th></tr></thead><tbody>${rows.map(r=>`<tr>
      <td><div class="cell-title">${esc(r.name)}</div></td><td>${r.deliveries}</td><td>${money(r.revenue)}</td><td>${r.wrongAddress}</td><td>${r.scheduled}</td><td>${r.rescheduled}</td><td>${r.scheduledOpen}</td><td>${r.rescheduledOpen}</td><td>${r.scheduledDelivered}</td><td>${r.devolutions}</td><td>${r.delayed}</td><td>${number(r.returnRate,1)}%</td><td>${number(r.problemRate,1)}%</td>
    </tr>`).join('')}</tbody></table></div>`;
  }

  function normalizeTraceFilter(value) {
    return String(value ?? '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  function deliveryMatchesTraceFilters(delivery, filters = {}) {
    const orderNo = normalizeTraceFilter(filters.orderNo);
    const coupon = normalizeTraceFilter(filters.coupon);
    const date = String(filters.date || '').trim();
    const docNo = normalizeTraceFilter(filters.docNo);
    const cashierNo = normalizeTraceFilter(filters.cashierNo);
    const customerName = normalizeTraceFilter(filters.customerName);
    return (!orderNo || normalizeTraceFilter(delivery.orderNo) === orderNo)
      && (!coupon || normalizeTraceFilter(delivery.coupon) === coupon)
      && (!date || delivery.date === date)
      && (!docNo || normalizeTraceFilter(delivery.docNo) === docNo)
      && (!cashierNo || normalizeTraceFilter(delivery.cashierNo) === cashierNo)
      && (!customerName || normalizeTraceFilter(delivery.customerName).includes(customerName));
  }

  function renderTrace() {
    $('#view').innerHTML = `<article class="card section-card">${sectionHeader('⌕','Pesquisar e rastrear entregas','Localize registros usando um ou mais filtros e abra a linha do tempo completa.')}
      <form id="traceSearchForm" class="trace-search-grid" role="search">
        <label>Nº DA COMPRA/ENTREGA<input name="orderNo" inputmode="numeric" placeholder="Ex.: 5" /></label>
        <label>Nº DO CUPOM<input name="coupon" inputmode="numeric" placeholder="Ex.: 45879" /></label>
        <label>Data da compra<input name="date" type="date" /></label>
        <label>Nº DO DOC<input name="docNo" inputmode="numeric" placeholder="Ex.: 102548" /></label>
        <label>Nº DO CAIXA<input name="cashierNo" inputmode="numeric" placeholder="Ex.: 3" /></label>
        <label>Nome do cliente<input name="customerName" autocomplete="name" placeholder="Ex.: Maria da Silva" /></label>
        <div class="trace-search-actions"><button class="btn primary" type="submit">Pesquisar</button><button class="btn secondary" type="button" id="clearTraceFilters">Limpar</button></div>
      </form>
      <div id="traceResult">${emptyState('⌕','Informe pelo menos um filtro','Pesquise por número da compra, cupom, data, DOC, caixa ou cliente.')}</div>
    </article>`;
    $('#traceSearchForm').addEventListener('submit', event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      showTraceResults(data);
    });
    $('#clearTraceFilters').addEventListener('click', () => {
      $('#traceSearchForm').reset();
      $('#traceResult').innerHTML = emptyState('⌕','Informe pelo menos um filtro','Pesquise por número da compra, cupom, data, DOC, caixa ou cliente.');
    });
    $('#traceResult').addEventListener('click', event => {
      const button = event.target.closest('[data-trace-root]');
      if (button) showTraceByRoot(button.dataset.traceRoot);
    });
  }

  function showTraceResults(filters = {}) {
    const box = $('#traceResult');
    const orderNo = normalizeTraceFilter(filters.orderNo);
    const coupon = normalizeTraceFilter(filters.coupon);
    const date = String(filters.date || '').trim();
    const docNo = normalizeTraceFilter(filters.docNo);
    const cashierNo = normalizeTraceFilter(filters.cashierNo);
    const customerName = normalizeTraceFilter(filters.customerName);
    if (!orderNo && !coupon && !date && !docNo && !cashierNo && !customerName) {
      box.innerHTML = emptyState('⌕','Informe pelo menos um filtro','Pesquise por número da compra, cupom, data, DOC, caixa ou cliente.');
      return;
    }
    const records = scoped(state.deliveries);
    const matches = records.filter(delivery => deliveryMatchesTraceFilters(delivery, { orderNo, coupon, date, docNo, cashierNo, customerName }));
    if (!matches.length) {
      box.innerHTML = emptyState('⌕','Nenhuma entrega encontrada','Confira os filtros informados e tente novamente.');
      return;
    }
    const rootIds = unique(matches.map(delivery => delivery.rootId || delivery.id));
    if (rootIds.length === 1) {
      showTraceByRoot(rootIds[0]);
      return;
    }
    const summaries = rootIds.map(rootId => {
      const chain = records.filter(delivery => (delivery.rootId || delivery.id) === rootId).sort((a,b)=>`${a.date}${a.purchaseTime||''}`.localeCompare(`${b.date}${b.purchaseTime||''}`));
      return { rootId, root: chain.find(delivery => delivery.id === rootId) || chain[0], current: chain.at(-1), records: chain.length };
    }).filter(item => item.root).sort((a,b)=>`${b.root.date}${b.root.purchaseTime||''}`.localeCompare(`${a.root.date}${a.root.purchaseTime||''}`));
    box.innerHTML = `<div class="trace-results-head"><strong>${summaries.length} compras encontradas</strong><small>Selecione uma compra para abrir o histórico completo.</small></div><div class="trace-result-list">${summaries.map(item => `
      <article class="trace-result-row">
        <div class="trace-key-number"><small>COMPRA/ENTREGA</small><strong>Nº ${esc(item.root.orderNo || '—')}</strong><span>${dateBR(item.root.date)} • ${item.root.purchaseTime || '—'}</span></div>
        <div class="trace-key-number"><small>Nº DO CUPOM</small><strong>${esc(item.root.coupon || '—')}</strong><span>DOC ${esc(item.root.docNo || '—')} • Caixa ${esc(item.root.cashierNo || '—')}</span></div>
        <div><small>CLIENTE / BAIRRO</small><strong>${esc(item.root.customerName || 'Não informado')}</strong><span>${esc(neighborhood(item.root.neighborhoodId)?.name || 'Sem bairro')}</span></div>
        <div><small>SITUAÇÃO</small><strong>${esc(item.current?.status || '—')}</strong><span>${item.records} registro(s)</span></div>
        <button class="btn primary small" type="button" data-trace-root="${attr(item.rootId)}">Ver histórico</button>
      </article>`).join('')}</div>`;
  }

  function showTraceByRoot(rootId) {
    const box = $('#traceResult');
    const chain = scoped(state.deliveries).filter(delivery => (delivery.rootId || delivery.id) === rootId).sort((a,b)=>`${a.date}${a.purchaseTime||''}`.localeCompare(`${b.date}${b.purchaseTime||''}`));
    if (!chain.length) { box.innerHTML = emptyState('⌕','Entrega não encontrada','Faça uma nova pesquisa.'); return; }
    const root = chain.find(delivery => delivery.id === rootId) || chain[0];
    const final = chain.filter(deliveredToCustomer);
    const reSchedules = chain.filter(d=>d.scheduleKind==='Reagendada' && d.scheduledDate).length;
    box.innerHTML = `
      <section class="metrics-grid" style="margin-top:16px">
        ${cardMetric('Registros',chain.length,'Histórico completo','▣','blue')}
        ${cardMetric('Reagendamentos',reSchedules,'Mudanças de data','↻','yellow')}
        ${cardMetric('Situação atual',chain.at(-1)?.status || '—','Último registro','•','purple')}
        ${cardMetric('Faturamento líquido',money(netRevenueOfRoot(root)),'Registrado na compra original','R$','green')}
        ${cardMetric('Bairro',neighborhood(root.neighborhoodId)?.name || '—','Origem','◎','blue')}
      </section>
      <div class="form-note trace-identification">
        <strong>Identificação da compra</strong><br>
        Nº DO CUPOM: ${esc(root.coupon || '—')} • Nº DOC: ${esc(root.docNo || '—')} • Nº caixa: ${esc(root.cashierNo || '—')}<br>
        Cliente: ${esc(root.customerName || 'Não informado')} • Telefone: ${esc(root.customerPhone || 'Não informado')}
      </div>
      <div class="trace-timeline">${chain.map(d=>{const c=deliveryCalc(d); return `<div class="trace-event"><strong>${dateBR(d.date)} • ${esc(d.status)}</strong><p>Entrada ${d.purchaseTime||'—'} • Saída ${d.departureTime||'—'} • Finalização ${d.finalizationTime||'—'} • Retorno ${d.returnTime||'—'}<br>Compra → saída ${fmtMinutes(c.wait)} • Loja → cliente ${fmtMinutes(c.toClient)} • Compra → cliente ${fmtMinutes(c.purchaseToClient)} • Rota ${fmtMinutes(c.route)}<br>${deliveryStandardBadges(d,c)}${d.scheduledDate?`<br>${esc(d.scheduleKind||'Programada')} para ${scheduledDateTimeLabel(d)} • ${esc(d.scheduleNotes || reason(d.reasonId)?.name || d.reasonText || '')}`:''}${d.returnedUndelivered?`<br>Voltou sem entrega • ${esc(reason(d.returnReasonId)?.name || d.returnReasonText || 'Motivo não informado')}`:''}</p></div>`}).join('')}</div>`;
  }

  function renderReports() {
    const years = availableYears();
    $('#view').innerHTML = `
      <section class="two-column">
        <article class="card section-card">
          ${sectionHeader('⇩','Gerar relatório analítico em Excel','Escolha o recorte e baixe 31 abas formatadas, incluindo previsão de movimento, comparações, SLA e indicadores calculados.')}
          <div class="form-grid" id="reportForm">
            <label>Tipo de período<select id="reportType"><option value="day">Dia</option><option value="week">Semana</option><option value="month">Mês</option><option value="year">Ano</option><option value="custom">Período personalizado</option></select></label>
            <label>Data de referência<input id="reportRef" type="date" value="${todayISO()}" /></label>
            <label>Ano<select id="reportYear">${years.map(y=>`<option value="${y}">${y}</option>`).join('')}</select></label>
            <label>Mês<select id="reportMonth">${monthNames.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('')}</select></label>
            <label>De<input id="reportStart" type="date" /></label>
            <label>Até<input id="reportEnd" type="date" /></label>
            <div class="full form-note"><strong>Relatório completo:</strong> além de conferir o resultado final de cada programação, o sistema projeta as próximas 5 semanas e indica dia, semana e volume provável de pico. O Excel e o PDF também incluem tempos, SLA, financeiro, KM, clientes, agenda e histórico completo.</div>
            <div class="full form-actions"><button class="btn secondary" id="printReportBtn">Imprimir / PDF</button><button class="btn primary" id="exportExcelBtn">⇩ Baixar Excel</button></div>
          </div>
        </article>
        <article class="card section-card">
          ${sectionHeader('▤','31 abas do relatório','Estrutura completa para operação, previsão, gestão, análise e auditoria.')}
          <div class="stat-list">
            ${['RESUMO_EXECUTIVO','RESUMO_DIARIO','SLA_PRAZOS','FLUXO_OPERACIONAL','RESUMO_MENSAL','COMPARATIVO','DIAS_SEMANA','HORARIOS_PICO','TAXAS_PDV','STATUS','RANKING_OPERACIONAL','METODOLOGIA','ENTREGAS','CONTATOS_CLIENTES','CLIENTES','CAIXAS_PDV','OCORRENCIAS','QUALIDADE_DADOS','INCONSISTENCIAS','PREVISAO_AGENDA','PREVISAO_MOVIMENTO','CUSTOS','CICLOS','ODOMETRO_DIARIO','VEICULOS','COLABORADORES','BAIRROS','PROGRAMADAS','PENDENCIAS','FECHAMENTOS_DIA','HISTORICO'].map(name=>statRow(name,'Incluída','Gerada automaticamente')).join('')}
          </div>
        </article>
      </section>
    `;
    $('#reportMonth').value = String(new Date().getMonth()+1).padStart(2,'0');
    $('#reportYear').value = String(new Date().getFullYear());
    $('#exportExcelBtn').addEventListener('click', exportExcelReport);
    $('#printReportBtn').addEventListener('click', printReport);
  }

  function availableYears() {
    const currentYear=new Date().getFullYear();
    const years=new Set(Array.from({length:YEAR_PAST_RANGE+YEAR_FUTURE_RANGE+1},(_,index)=>currentYear-YEAR_PAST_RANGE+index));
    [...scoped(state.deliveries),...scoped(state.costs),...scoped(state.cycles),...scoped(state.odometerLogs)].forEach(x=>{const year=Number(x.date?.slice(0,4));if(Number.isInteger(year))years.add(year);});
    return [...years].sort((a,b)=>b-a);
  }

  function reportRangeFromForm() {
    const type = $('#reportType').value;
    const ref = $('#reportRef').value || todayISO();
    const year = $('#reportYear').value;
    const month = $('#reportMonth').value;
    if (type === 'day') return {start:ref,end:ref,label:ref};
    if (type === 'week') return {start:startOfWeek(ref),end:endOfWeek(ref),label:`semana_${startOfWeek(ref)}`};
    if (type === 'month') { const last=new Date(Number(year),Number(month),0).getDate(); return {start:`${year}-${month}-01`,end:`${year}-${month}-${String(last).padStart(2,'0')}`,label:`${year}_${month}`}; }
    if (type === 'year') return {start:`${year}-01-01`,end:`${year}-12-31`,label:year};
    return {start:$('#reportStart').value || '0000-01-01',end:$('#reportEnd').value || '9999-12-31',label:'personalizado'};
  }


  function renderTrash() {
    const items = state.trash.filter(x => (x.mode || 'production') === currentMode()).slice().sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)));
    $('#view').innerHTML = `<section class="trash-hero"><div><span class="eyebrow">SEGURANÇA E CORREÇÃO</span><h2>Lixeira de registros</h2><p>Apagou algo por engano? Restaure aqui. Entregas, ciclos, custos e KM vão primeiro para a lixeira.</p></div><div class="hero-meta"><span class="hero-chip">${items.length} item(ns)</span><span class="hero-chip">${esc(modeLabel())}</span></div></section><article class="card section-card" style="margin-top:14px">${sectionHeader('⌫','Itens apagados','A lixeira é separada entre operação real e treinamento.', items.length ? `<button class="btn danger small" data-trash-action="empty">Esvaziar lixeira deste ambiente</button>` : '')}${trashTable(items)}</article>`;
    $$('[data-trash-action="restore"]').forEach(b=>b.addEventListener('click',()=>restoreTrashItem(b.dataset.id)));
    $$('[data-trash-action="permanent"]').forEach(b=>b.addEventListener('click',()=>permanentDeleteTrashItem(b.dataset.id)));
    $('[data-trash-action="empty"]')?.addEventListener('click',emptyTrashCurrentMode);
  }
  function trashTable(items) {
    if (!items.length) return emptyState('✓','Lixeira vazia','Nenhum registro apagado neste ambiente.');
    return `<div class="trash-list">${items.map(item=>`<article class="trash-item"><div class="trash-type">${trashTypeLabel(item.recordType)}</div><div class="trash-copy"><strong>${esc(item.label||'Registro')}</strong><small>Apagado em ${dateTimeBR(item.deletedAt)} • ${item.mode==='training'?'Treinamento':'Operação real'}</small></div><div class="actions"><button class="btn secondary small" data-trash-action="restore" data-id="${item.id}">Restaurar</button><button class="btn danger small" data-trash-action="permanent" data-id="${item.id}">Excluir definitivamente</button></div></article>`).join('')}</div>`;
  }
  function trashTypeLabel(type) { return ({delivery_bundle:'ENTREGA',cycle:'CICLO',cost:'CUSTO',odometer:'KM'})[type] || 'REGISTRO'; }
  async function moveToTrash(recordType, payload, label, context={}) {
    state.trash.unshift({id:uid('trash'),recordType,label,deletedAt:nowISO(),mode:currentMode(),payload:cloneData(payload),context:cloneData(context)});
    if(state.trash.length>1500) state.trash=state.trash.slice(0,1500);
  }
  async function deleteRecord(type,id) {
    if(type==='delivery') return deleteDelivery(id);
    if(type==='cost') {
      const item=scoped(state.costs).find(x=>x.id===id); if(!item)return;
      if(!confirm(`Apagar o custo “${item.description||'sem descrição'}” de ${money(item.value)}?`)) return;
      await moveToTrash('cost',item,`Custo • ${item.description||money(item.value)}`); state.costs=state.costs.filter(x=>x.id!==id);
    } else if(type==='odometer') {
      const item=scoped(state.odometerLogs).find(x=>x.id===id); if(!item)return;
      if(!confirm(`Apagar o registro de KM de ${vehicle(item.vehicleId)?.name||'veículo'} em ${dateBR(item.date)}?`)) return;
      await moveToTrash('odometer',item,`KM • ${vehicle(item.vehicleId)?.name||'Veículo'} • ${dateBR(item.date)}`); state.odometerLogs=state.odometerLogs.filter(x=>x.id!==id);
    } else if(type==='cycle') {
      const item=scoped(state.cycles).find(x=>x.id===id); if(!item)return;
      const linked=scoped(state.deliveries).filter(d=>d.cycleId===id);
      const linkedRouteTracks=scoped(state.routeTracks).filter(track=>track.cycleId===id);
      if(!confirm(`Apagar o ciclo ${item.code} e devolver ${linked.length} entrega(s) para fora do ciclo?`)) return;
      if(activeRouteCycleId===id) clearLocalRouteWatcher();
      await moveToTrash('cycle',item,`Ciclo • ${item.code}`,{linkedDeliveries:linked,routeTracks:linkedRouteTracks});
      linked.forEach(d=>{ d.cycleId=''; if(d.departureTime===item.departureTime)d.departureTime=''; if(d.returnTime===item.returnTime)d.returnTime=''; if(d.vehicleId===item.vehicleId)d.vehicleId=''; if(d.driverId===item.driverId)d.driverId=''; if(d.status==='Em rota')d.status='Na loja'; d.updatedAt=nowISO(); });
      state.cycles=state.cycles.filter(x=>x.id!==id);
      state.routeTracks=state.routeTracks.filter(track=>track.cycleId!==id);
    }
    await saveState(`${type} apagado e enviado para lixeira`); toast('Registro apagado. Você pode restaurá-lo na Lixeira.','success'); render();
  }
  async function restoreTrashItem(trashId) {
    const item=state.trash.find(x=>x.id===trashId); if(!item)return;
    if(item.recordType==='cost' && !state.costs.some(x=>x.id===item.payload.id)) state.costs.push(item.payload);
    if(item.recordType==='odometer' && !state.odometerLogs.some(x=>x.id===item.payload.id)) state.odometerLogs.push(item.payload);
    if(item.recordType==='delivery_bundle') for(const d of item.payload){ if(!state.deliveries.some(x=>x.id===d.id)) state.deliveries.push(d); }
    if(item.recordType==='cycle') { if(!state.cycles.some(x=>x.id===item.payload.id)) state.cycles.push(item.payload); for(const track of (item.context?.routeTracks||[])){if(!state.routeTracks.some(x=>x.id===track.id))state.routeTracks.push(track);} for(const saved of (item.context?.linkedDeliveries||[])){ const d=state.deliveries.find(x=>x.id===saved.id); if(d) Object.assign(d,saved); } }
    state.trash=state.trash.filter(x=>x.id!==trashId); await saveState(`${item.label} restaurado da lixeira`); toast('Registro restaurado.','success'); render();
  }
  async function permanentDeleteTrashItem(trashId) { const item=state.trash.find(x=>x.id===trashId); if(!item)return; if(!confirm(`Excluir definitivamente “${item.label}”? Esta ação não pode ser desfeita.`))return; state.trash=state.trash.filter(x=>x.id!==trashId); await saveState(`${item.label} excluído definitivamente`); render(); }
  async function emptyTrashCurrentMode() { if(!confirm(`Esvaziar definitivamente a lixeira de ${modeLabel()}?`))return; state.trash=state.trash.filter(x=>(x.mode||'production')!==currentMode()); await saveState(`Lixeira de ${modeLabel()} esvaziada`); render(); }
  async function seedTrainingData() {
    if(currentMode()!=='training')return;
    const existing=scoped(state.deliveries).length+scoped(state.cycles).length+scoped(state.costs).length;
    if(existing && !confirm('Já existem dados de treinamento. Adicionar mais exemplos?'))return;
    const veh=state.vehicles.find(v=>v.active), emp=state.employees.find(e=>e.active), nbs=state.neighborhoods.filter(n=>n.active);
    if(!veh || !emp || !nbs.length){toast('Cadastre ao menos 1 veículo, 1 colaborador e 1 bairro.','warning');return;}
    const dates=[0,1,2,3].map(back=>{const d=new Date();d.setDate(d.getDate()-back);return localDateISO(d)}), created=[];
    for(let i=0;i<10;i++){ const date=dates[i%dates.length], fee=i%3===0?9.99:6.99, nb=nbs[i%nbs.length]; const d={id:uid('del'),rootId:'',parentId:'',attemptNo:1,date,orderNo:String(i+1),coupon:`TREINO-${String(i+1).padStart(3,'0')}`,docNo:`DOC-${String(1001+i)}`,cashierNo:String((i%3)+1),customerName:i%2===0?`CLIENTE EXEMPLO ${i+1}`:'',customerPhone:i%2===0?`( 66 ) 9 9999-${String(1000+i)}`:'',purchaseTime:`${String(9+(i%7)).padStart(2,'0')}:${i%2?'20':'05'}`,neighborhoodId:nb.id,address:`Rua Exemplo ${i+1}`,addressNumber:String(100+i),addressComplement:'',addressReference:i%2?'Próximo à praça':'',priority:i===0,fee,driverId:'',vehicleId:'',cycleId:'',departureTime:'',finalizationTime:'',returnTime:'',status:'Na loja',scheduledDate:'',scheduledTime:'',scheduleNotes:'',scheduleKind:'',reasonId:'',reasonText:'',nextAction:'',notes:'Registro criado automaticamente para treinamento.',returnedUndelivered:false,returnReasonId:'',returnReasonText:'',refundAmount:0,refundDate:'',withdrawalDate:'',withdrawalTime:'',createdAt:nowISO(),updatedAt:nowISO(),mode:'training',history:[]}; d.rootId=d.id; if(i===7){d.status='Programada';d.scheduledDate=dates[0];d.scheduledTime='15:30';d.scheduleNotes='Ligar antes da entrega.';d.scheduleKind='Programada';d.history.push({id:uid('evt'),type:'scheduled',from:d.date,to:d.scheduledDate,scheduledTime:d.scheduledTime,scheduleNotes:d.scheduleNotes,at:nowISO()});} if(i===8){d.status='Devolvida';d.reasonId='ENDERECO_ERRADO';d.returnedUndelivered=true;d.returnReasonId='ENDERECO_ERRADO';} state.deliveries.push(d);created.push(d); }
    const cycleDeliveries=created.slice(0,3), c={id:uid('cyc'),code:'CIC-TREINO-001',date:dates[0],vehicleId:veh.id,driverId:emp.id,departureTime:'09:30',returnTime:'10:40',notes:'Ciclo de treinamento.',routeDeliveryIds:routeSortDeliveries(created.slice(0,3)).map(d=>d.id),routeGeneratedAt:nowISO(),routeStrategy:'priority_neighborhood_google_maps',createdAt:nowISO(),updatedAt:nowISO(),mode:'training'}; state.cycles.push(c); const trainingTrack=ensureRouteTrack(c);trainingTrack.status='completed';trainingTrack.startedAt=`${dates[0]}T09:30:00`;trainingTrack.endedAt=`${dates[0]}T10:40:00`;trainingTrack.points=[{lat:-14.6752,lng:-52.3521,accuracy:8,speed:null,heading:null,at:`${dates[0]}T09:30:00`},{lat:-14.6708,lng:-52.3462,accuracy:10,speed:null,heading:null,at:`${dates[0]}T09:47:00`},{lat:-14.6669,lng:-52.3514,accuracy:9,speed:null,heading:null,at:`${dates[0]}T10:06:00`},{lat:-14.6735,lng:-52.3581,accuracy:11,speed:null,heading:null,at:`${dates[0]}T10:24:00`},{lat:-14.6752,lng:-52.3521,accuracy:8,speed:null,heading:null,at:`${dates[0]}T10:40:00`}];trainingTrack.distanceKm=2.65;trainingTrack.lastPointAt=trainingTrack.points.at(-1).at; cycleDeliveries.forEach((d,idx)=>{d.cycleId=c.id;d.vehicleId=veh.id;d.driverId=emp.id;d.departureTime='09:30';d.finalizationTime=`10:${String(5+idx*8).padStart(2,'0')}`;d.returnTime='10:40';d.status='Finalizada';});
    state.odometerLogs.push({id:uid('odo'),date:dates[0],vehicleId:veh.id,kmStart:10000,kmEnd:10038,notes:'Treinamento',createdAt:nowISO(),updatedAt:nowISO(),mode:'training'});
    const fuel=state.costCategories.find(x=>x.name==='Combustível'); state.costs.push({id:uid('cost'),date:dates[0],time:'11:00',vehicleId:veh.id,categoryId:fuel?.id||'',description:'Abastecimento de treinamento',value:80,km:10038,supplier:'Posto Exemplo',receiptNo:'TREINO',responsibleId:emp.id,notes:'Dado de treinamento.',createdAt:nowISO(),updatedAt:nowISO(),mode:'training'});
    await saveState('Dados de treinamento de exemplo criados'); toast('Dados de treinamento criados.','success'); render();
  }
  async function clearTrainingData() { if(currentMode()!=='training')return; if(!confirm('Apagar TODOS os dados de treinamento? A operação real não será afetada.'))return; if(activeRouteCycleId)clearLocalRouteWatcher(); for(const key of ['deliveries','cycles','routeTracks','odometerLogs','costs']) state[key]=state[key].filter(x=>(x.mode||'production')!=='training'); state.trash=state.trash.filter(x=>(x.mode||'production')!=='training'); await saveState('Dados de treinamento limpos'); toast('Treinamento limpo.','success'); render(); }

  function renderSettings() {
    const tabs = [
      ['vehicles','Veículos'],['neighborhoods','Bairros'],['employees','Colaboradores'],['costCategories','Categorias de custo'],['reasons','Motivos'],['rules','Regras'],['data','Dados']
    ];
    $('#view').innerHTML = `
      <div class="settings-tabs">${tabs.map(([id,label])=>`<button class="tab-btn ${configTab===id?'active':''}" data-config-tab="${id}">${label}</button>`).join('')}</div>
      <section class="settings-grid">
        <aside class="card settings-side">
          <h3>Cadastros mestres</h3><p>Itens desativados deixam de aparecer em novos lançamentos, mas continuam nos relatórios e no histórico.</p>
          <div class="settings-stat"><span>Veículos ativos</span><strong>${state.vehicles.filter(x=>x.active).length}</strong></div>
          <div class="settings-stat"><span>Bairros ativos</span><strong>${state.neighborhoods.filter(x=>x.active).length}</strong></div>
          <div class="settings-stat"><span>Colaboradores ativos</span><strong>${state.employees.filter(x=>x.active).length}</strong></div>
          <div class="settings-stat"><span>Entregas registradas</span><strong>${scoped(state.deliveries).length}</strong></div>
        </aside>
        <article class="card section-card" id="settingsContent">${settingsContent()}</article>
      </section>
    `;
    $$('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{configTab=btn.dataset.configTab;renderSettings();}));
    bindSettingsActions();
  }

  function settingsContent() {
    if (configTab === 'rules') {
      return `${sectionHeader('⚙','Regras operacionais','Defina o expediente e os padrões máximos da entrega.')}
        <div class="form-grid">
          <label>Início expediente<input id="ruleWorkStart" type="time" value="${state.settings.workStart}" /></label>
          <label>Início almoço<input id="ruleLunchStart" type="time" value="${state.settings.lunchStart}" /></label>
          <label>Fim almoço<input id="ruleLunchEnd" type="time" value="${state.settings.lunchEnd}" /></label>
          <label>Fim expediente<input id="ruleWorkEnd" type="time" value="${state.settings.workEnd}" /></label>
          <label>Limite compra → saída (minutos)<input id="ruleDelay" type="number" min="1" value="${state.settings.delayMinutes}" /></label>
          <label>Limite compra → cliente (minutos)<input id="ruleCompletionLimit" type="number" min="1" value="${state.settings.completionLimitMinutes || 210}" /></label>
          <label class="span-2">Ponto de saída e retorno da rota<input id="ruleRouteOrigin" value="${attr(routeOriginLabel())}" placeholder="Ex.: Nilo Supermercado, Nova Xavantina - MT" /></label>
          <label class="span-2">Cidade usada pelo Google Maps<input id="ruleRouteCity" value="${attr(routeCityLabel())}" placeholder="Ex.: Nova Xavantina - MT" /></label>
          <div class="full form-note"><strong>Padrão 1:</strong> compra até a saída, em tempo corrido (padrão atual: 2h).<br><strong>Padrão 2:</strong> compra até a finalização na casa do cliente, também em tempo corrido (padrão atual: 3h30). Exemplo: compra às 10:00 e saída às 12:00 deixam 1h30 para a entrega.</div>
          <div class="full form-note"><strong>Roteirização:</strong> o ponto de saída também será o retorno do ciclo. Em cada bairro, configure a ordem operacional para evitar cruzamentos desnecessários.</div>
          <div class="full form-actions"><button class="btn primary" data-action="save-rules">Salvar regras</button></div>
        </div>`;
    }
    if (configTab === 'data') {
      return `${sectionHeader('⇩','Backup e restauração','Faça backup antes de trocar de aparelho ou limpar o navegador.')}
        <div class="form-note">Os dados continuam salvos no aparelho para funcionar offline e também são sincronizados pelo banco central quando a conta está conectada e a internet disponível.</div>
        <div class="form-note" style="margin-top:10px">Ao atualizar, o sistema mantém uma cópia local da versão anterior. Ao restaurar, valida o arquivo, compara as quantidades e baixa automaticamente uma cópia dos dados atuais antes da substituição.</div>
        <div class="form-actions" style="justify-content:flex-start"><button class="btn primary" data-action="backup-data">↓ Baixar backup JSON</button>${preUpdateBackup?`<button class="btn secondary" data-action="download-pre-update-backup">↓ Backup antes da atualização</button>`:''}<label class="btn secondary">↑ Restaurar backup<input id="settingsRestoreInput" type="file" accept=".json,application/json" hidden /></label></div>`;
    }
    const map = {
      vehicles:{title:'Veículos',subtitle:'Adicione, edite, desative ou reative veículos sem perder histórico.',label:'veículo',arr:state.vehicles},
      neighborhoods:{title:'Bairros',subtitle:'Cadastre os bairros e a sequência usada para montar os roteiros.',label:'bairro',arr:state.neighborhoods},
      employees:{title:'Colaboradores',subtitle:'Entregadores, conferentes, gestores e outros responsáveis.',label:'colaborador',arr:state.employees},
      costCategories:{title:'Categorias de custo',subtitle:'Combustível, manutenção, pneus e outros tipos de gasto.',label:'categoria',arr:state.costCategories},
      reasons:{title:'Motivos padronizados',subtitle:'Padronize endereço errado, cliente ausente, recusa e outros problemas.',label:'motivo',arr:state.reasons}
    };
    const cfg = map[configTab];
    return `${sectionHeader('＋',cfg.title,cfg.subtitle,`<button class="btn primary small" data-action="new-config">＋ Adicionar ${cfg.label}</button>`)}${configTable(cfg.arr)}`;
  }

  function configTable(list) {
    return `<div class="table-wrap"><table><thead><tr><th>Nome</th><th>Detalhes</th><th>Status</th><th>Ações</th></tr></thead><tbody>${list.map(item=>`<tr>
      <td><div class="cell-title">${esc(item.name)}</div></td>
      <td>${configDetails(item)}</td>
      <td>${item.active ? '<span class="badge green">Ativo</span>':'<span class="badge gray">Inativo</span>'}</td>
      <td><div class="actions"><button class="btn secondary small" data-action="edit-config" data-id="${item.id}">Editar</button><button class="btn ${item.active?'danger':'secondary'} small" data-action="toggle-config" data-id="${item.id}">${item.active?'Desativar':'Reativar'}</button></div></td>
    </tr>`).join('')}</tbody></table></div>`;
  }
  function configDetails(item) {
    if (configTab==='vehicles') return esc([item.plate,item.type].filter(Boolean).join(' • ') || '—');
    if (configTab==='neighborhoods') return esc([`Rota ${Number(item.routeOrder||0) || '—'}`,item.region,item.mapQuery].filter(Boolean).join(' • '));
    if (configTab==='employees') return esc(item.role || '—');
    return '—';
  }


  function closeDayChecklistHTML(checks) {
    const row = (item,tone) => `<div class="close-day-check ${tone}"><span>${item.icon}</span><p>${esc(item.text)}</p></div>`;
    return `<div class="close-day-checklist">${checks.blockers.map(x=>row(x,'blocker')).join('')}${checks.warnings.map(x=>row(x,'warning')).join('')}${!checks.blockers.length&&!checks.warnings.length?`<div class="close-day-all-good"><span>✓</span><div><strong>Tudo conferido</strong><p>Não encontramos ciclos abertos, entregas em rota ou KM pendente dos veículos que trabalharam.</p></div></div>`:''}</div>`;
  }

  function openCloseDayModal(date = todayISO()) {
    const existing = dayClosure(date);
    if (existing) {
      openModal('Operação já encerrada',`O dia ${dateBR(date)} foi encerrado em ${dateTimeBR(existing.closedAt)}.`,`
        <div class="close-day-closed-state"><span>✓</span><div><strong>Dia encerrado</strong><p>Você ainda pode corrigir registros. Reabra o dia para voltar ao fluxo operacional normal.</p></div></div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelCloseDayBtn">Fechar</button><button type="button" class="btn primary" id="reopenDayBtn">↺ Reabrir operação do dia</button></div>
      `,'ENCERRAMENTO DO DIA');
      $('#cancelCloseDayBtn').addEventListener('click',closeModal);
      $('#reopenDayBtn').addEventListener('click',()=>reopenDay(date));
      return;
    }

    const checks = dayClosingChecks(date);
    openModal('Conferir encerramento do dia',checks.blockers.length?'Ainda existem bloqueios que precisam ser resolvidos.':'A operação pode ser encerrada com segurança.',`
      <div class="close-day-summary ${checks.blockers.length?'blocked':'ready'}"><span>${checks.blockers.length?'!':'✓'}</span><div><strong>${checks.blockers.length?`${checks.blockers.length} bloqueio(s) encontrado(s)`:'Checklist principal concluído'}</strong><p>${checks.blockers.length?'Corrija os pontos abaixo e volte a conferir.':'Confira os avisos, se houver, e encerre o expediente.'}</p></div></div>
      ${closeDayChecklistHTML(checks)}
      <div class="form-actions"><button type="button" class="btn secondary" id="cancelCloseDayBtn">Voltar</button>${checks.blockers.length?'':`<button type="button" class="btn primary" id="confirmCloseDayBtn">✓ Encerrar operação de ${dateBR(date)}</button>`}</div>
    `,'CHECKPOINT OPERACIONAL');
    $('#cancelCloseDayBtn').addEventListener('click',closeModal);
    $('#confirmCloseDayBtn')?.addEventListener('click',async()=>{
      const snapshot = {
        deliveries:scoped(state.deliveries).filter(d=>d.date===date).length,
        cycles:scoped(state.cycles).filter(c=>c.date===date).length,
        km:totalKmFromOdometers(scoped(state.odometerLogs).filter(o=>o.date===date)),
        warnings:checks.warnings.length
      };
      state.dayClosures.push({id:uid('close'),date,mode:currentMode(),closedAt:nowISO(),snapshot});
      await saveState(`Operação de ${dateBR(date)} encerrada`);
      closeModal(); toast('Operação do dia encerrada com sucesso.','success'); render();
    });
  }

  async function reopenDay(date = todayISO()) {
    const closure = dayClosure(date); if (!closure) return;
    if (!confirm(`Reabrir a operação de ${dateBR(date)}?`)) return;
    state.dayClosures = state.dayClosures.filter(x => x.id !== closure.id);
    await saveState(`Operação de ${dateBR(date)} reaberta`);
    closeModal(); toast('Operação do dia reaberta.','success'); render();
  }

  function bindViewActions() {
    $$('[data-action="new-delivery"]').forEach(b=>b.addEventListener('click',()=>openQuickDeliveryModal()));
    $$('[data-action="edit-delivery"]').forEach(b=>b.addEventListener('click',()=>openDeliveryModal(b.dataset.id)));

    $$('[data-action="quick-departure"]').forEach(b=>b.addEventListener('click',()=>quickDeparture(b.dataset.id)));
    $$('[data-action="quick-delivered"]').forEach(b=>b.addEventListener('click',()=>quickDelivered(b.dataset.id)));
    $$('[data-action="quick-return"]').forEach(b=>b.addEventListener('click',()=>quickReturn(b.dataset.id)));
    $$('[data-action="quick-reschedule"]').forEach(b=>b.addEventListener('click',()=>quickReschedule(b.dataset.id)));
    $$('[data-action="quick-pickup"]').forEach(b=>b.addEventListener('click',()=>quickPickup(b.dataset.id)));
    $$('[data-action="quick-devolution"]').forEach(b=>b.addEventListener('click',()=>quickDevolution(b.dataset.id)));
    $$('[data-action="trace-delivery"]').forEach(b=>b.addEventListener('click',()=>{navigate('trace');setTimeout(()=>{const input=$('#traceSearchForm [name="coupon"]');if(input)input.value=b.dataset.coupon;showTraceResults({coupon:b.dataset.coupon});},0);}));
    $$('[data-action="start-scheduled"]').forEach(b=>b.addEventListener('click',()=>startScheduledDelivery(b.dataset.id)));
    $$('[data-action="start-cycle"]').forEach(b=>b.addEventListener('click',()=>openCycleDepartureModal()));
    $$('[data-action="auto-detect-cycles"]').forEach(b=>b.addEventListener('click',()=>runAutoCycleDetection()));
    $$('[data-action="close-cycle"]').forEach(b=>b.addEventListener('click',()=>openCloseCycleModal(b.dataset.id)));
    $$('[data-action="open-cycle-route"]').forEach(b=>b.addEventListener('click',()=>openCycleRouteModal(b.dataset.id)));
    $$('[data-action="start-route-gps"]').forEach(b=>b.addEventListener('click',event=>{event.stopPropagation();startRouteTracking(b.dataset.id);}));
    $$('[data-action="pause-route-gps"]').forEach(b=>b.addEventListener('click',event=>{event.stopPropagation();stopRouteTracking(b.dataset.id);}));
    $$('[data-action="view-route-track"]').forEach(b=>b.addEventListener('click',event=>{event.stopPropagation();routeHistorySelectedTrackId=b.dataset.id;navigate('route-history');}));
    $$('[data-action="open-recorded-route"]').forEach(b=>b.addEventListener('click',event=>{event.stopPropagation();openRecordedTrackInMaps(b.dataset.id);}));
    $$('[data-action="select-route-track"]').forEach(b=>b.addEventListener('click',()=>{routeHistorySelectedTrackId=b.dataset.id;render();}));
    $$('[data-action="new-cycle"]').forEach(b=>b.addEventListener('click',()=>openCycleDepartureModal()));
    $$('[data-action="edit-cycle"]').forEach(b=>b.addEventListener('click',()=>openCycleModal(b.dataset.id)));
    $$('[data-action="manage-cycle-deliveries"]').forEach(b=>b.addEventListener('click',()=>openManageCycleDeliveriesModal(b.dataset.id)));
    $$('[data-action="new-odometer"]').forEach(b=>b.addEventListener('click',()=>openOdometerModal('', b.dataset.vehicleId || '')));
    $$('[data-action="edit-odometer"]').forEach(b=>b.addEventListener('click',()=>openOdometerModal(b.dataset.id)));
    $$('[data-action="new-cost"]').forEach(b=>b.addEventListener('click',()=>openCostModal()));
    $$('[data-action="edit-cost"]').forEach(b=>b.addEventListener('click',()=>openCostModal(b.dataset.id)));
    $$('[data-action="delete-record"]').forEach(b=>b.addEventListener('click',()=>deleteRecord(b.dataset.type,b.dataset.id)));
    $$('[data-action="scroll-deliveries"]').forEach(b=>b.addEventListener('click',()=>$('#todayDeliveriesSection')?.scrollIntoView({behavior:'smooth',block:'start'})));
    $$('[data-action="scroll-cycles"]').forEach(b=>b.addEventListener('click',()=>$('#todayCyclesSection')?.scrollIntoView({behavior:'smooth',block:'start'})));
    $$('[data-action="scroll-odometer"]').forEach(b=>b.addEventListener('click',()=>$('#todayOdometerSection')?.scrollIntoView({behavior:'smooth',block:'start'})));
    $$('[data-action="scroll-scheduled"]').forEach(b=>b.addEventListener('click',()=>$('#todayScheduledSection')?.scrollIntoView({behavior:'smooth',block:'start'})));
    $$('[data-action="go-pending"]').forEach(b=>b.addEventListener('click',()=>navigate('pending')));
    $$('[data-action="close-day"]').forEach(b=>b.addEventListener('click',()=>openCloseDayModal(todayISO())));
    $$('[data-action="reopen-day"]').forEach(b=>b.addEventListener('click',()=>reopenDay(todayISO())));
  }
  function bindSettingsActions() {
    $$('[data-action="new-config"]').forEach(b=>b.addEventListener('click',()=>openConfigModal()));
    $$('[data-action="edit-config"]').forEach(b=>b.addEventListener('click',()=>openConfigModal(b.dataset.id)));
    $$('[data-action="toggle-config"]').forEach(b=>b.addEventListener('click',()=>toggleConfig(b.dataset.id)));
    $$('[data-action="save-rules"]').forEach(b=>b.addEventListener('click',saveRules));
    $$('[data-action="backup-data"]').forEach(b=>b.addEventListener('click',downloadBackup));
    $$('[data-action="download-pre-update-backup"]').forEach(b=>b.addEventListener('click',downloadPreUpdateBackup));
    const input=$('#settingsRestoreInput'); if(input) input.addEventListener('change',e=>{if(e.target.files?.[0]) restoreBackup(e.target.files[0]);e.target.value='';});
  }

  function openModal(title,subtitle,body,kicker='CADASTRO OPERACIONAL') {
    if ($('#modalWrap').classList.contains('hidden')) lastFocusedElement = document.activeElement;
    $('#modalKicker').textContent = kicker;
    $('#modalTitle').textContent = title;
    $('#modalSubtitle').textContent = subtitle || '';
    $('#modalBody').innerHTML = `<div class="modal-body">${body}</div>`;
    bindInputNormalizers($('#modalBody'));
    $('#modalWrap').classList.remove('hidden');
    $('#modalWrap').setAttribute('aria-hidden', 'false');
    $('#appShell').setAttribute('aria-hidden', 'true');
    if ('inert' in $('#appShell')) $('#appShell').inert = true;
    document.body.style.overflow='hidden';
    requestAnimationFrame(() => {
      const autofocus = $('#modal [autofocus]');
      const firstControl = $('#modal button:not([disabled]), #modal input:not([type="hidden"]):not([disabled]), #modal select:not([disabled]), #modal textarea:not([disabled])');
      (autofocus || firstControl || $('#modalClose'))?.focus();
    });
  }
  function closeModal() {
    if ($('#modalWrap').classList.contains('hidden')) return;
    $('#modalWrap').classList.add('hidden');
    $('#modalWrap').setAttribute('aria-hidden', 'true');
    $('#appShell').removeAttribute('aria-hidden');
    if ('inert' in $('#appShell')) $('#appShell').inert = false;
    document.body.style.overflow='';
    const focusTarget = lastFocusedElement;
    lastFocusedElement = null;
    if (focusTarget?.isConnected) requestAnimationFrame(() => focusTarget.focus());
  }

  function handleModalKeydown(event) {
    if ($('#modalWrap').classList.contains('hidden')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = $$('#modal button:not([disabled]), #modal input:not([type="hidden"]):not([disabled]), #modal select:not([disabled]), #modal textarea:not([disabled]), #modal [href], #modal [tabindex]:not([tabindex="-1"])')
      .filter(element => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      $('#modalClose').focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const focusOutsideModal = !$('#modal').contains(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || focusOutsideModal)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || focusOutsideModal)) {
      event.preventDefault();
      first.focus();
    }
  }

  function options(list, selected='', label='name') {
    return `<option value="">Selecione...</option>` + list.filter(x=>x.active || x.id===selected).map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${esc(x[label])}</option>`).join('');
  }


  function openQuickDeliveryModal() {
    const today = todayISO();
    const time = currentTimeHM();
    const last = lastPurchaseSummary(today);
    const prev = last.previous;
    openModal('Registrar nova compra','Lançamento rápido em 3 passos. O número da compra fica em destaque para evitar erro de sequência.',`
      <form id="quickDeliveryForm" class="quick-entry-form clear-form">
        <div class="previous-purchase-banner">
          <div class="previous-purchase-label"><span>ÚLTIMA COMPRA REGISTRADA HOJE</span><strong>${prev ? `Nº ${esc(prev.orderNo || '—')}` : 'Nenhuma ainda'}</strong></div>
          <div class="previous-purchase-detail"><small>${prev ? `Nº do cupom ${esc(prev.coupon || '—')} • DOC ${esc(prev.docNo || '—')} • Caixa ${esc(prev.cashierNo || '—')} • ${prev.purchaseTime || '—'} • ${esc(neighborhood(prev.neighborhoodId)?.name || 'Sem bairro')}` : 'Esta será a primeira compra do dia.'}</small></div>
          <div class="next-purchase-suggestion"><span>NÚMERO AUTOMÁTICO PARA A NOVA</span><strong id="nextPurchaseSuggestedNumber">Nº ${esc(last.suggested || '1')}</strong></div>
        </div>

        <section class="quick-step-card">
          <div class="quick-step-head"><span>1</span><div><strong>Identificação da compra</strong><small>O número da compra é o campo principal da sequência do dia.</small></div></div>
          <div class="quick-entry-grid identity-grid">
            <label class="purchase-number-input">Nº DA COMPRA <small>(automático)</small><input name="orderNo" value="${attr(last.suggested)}" inputmode="numeric" readonly aria-readonly="true" required /></label>
            <label class="coupon-number-input">Nº DO CUPOM <small>(obrigatório)</small><input name="coupon" inputmode="numeric" autofocus required placeholder="Ex.: 45879" /></label>
            <label>Nº DO DOC <small>(obrigatório)</small><input name="docNo" inputmode="numeric" required placeholder="Ex.: 102548" /></label>
            <label>Nº DO CAIXA <small>(obrigatório)</small><input name="cashierNo" inputmode="numeric" required placeholder="Ex.: 3" /></label>
            <label>Data da compra <small>(obrigatório)</small><input name="date" type="date" value="${today}" required /></label>
            <label>Hora da compra <small>(obrigatório)</small><input name="purchaseTime" type="time" value="${time}" required /></label>
            <label>Bairro <small>(obrigatório)</small><select name="neighborhoodId" required>${options(state.neighborhoods,'')}</select></label>
            <label>Rua / avenida <small>(recomendado para a rota)</small><input name="address" autocomplete="street-address" placeholder="Ex.: AVENIDA BRASIL" /></label>
            <label>Número <small>(recomendado para a rota)</small><input name="addressNumber" inputmode="numeric" placeholder="Ex.: 1250" /></label>
            <label>Complemento <small>(opcional)</small><input name="addressComplement" placeholder="Ex.: APTO 2, FUNDOS" /></label>
            <label>Referência <small>(opcional)</small><input name="addressReference" placeholder="Ex.: AO LADO DA FARMÁCIA" /></label>
            <label>Nome do cliente <small>(opcional)</small><input name="customerName" autocomplete="name" data-uppercase-name placeholder="Ex.: MARIA DA SILVA" /></label>
            <label>Número de telefone <small>(opcional)</small><input name="customerPhone" type="tel" inputmode="tel" autocomplete="tel" data-phone-mask maxlength="20" placeholder="Ex.: ( 99 ) 9 9999-9999" /></label>
            <label class="priority-delivery-toggle"><input name="priority" type="checkbox" /><span><strong>★ Entrega prioritária</strong><small>Será colocada no início do roteiro do ciclo.</small></span></label>
          </div>
        </section>

        <section class="quick-step-card">
          <div class="quick-step-head"><span>2</span><div><strong>Taxa cobrada no PDV</strong><small>O faturamento entra agora, no registro da compra.</small></div></div>
          <input type="hidden" name="fee" id="quickFee" value="" />
          <input type="hidden" name="feeMode" id="quickFeeMode" value="" />
          <div class="choice-buttons simple-choices fee-choice-grid" id="feeChoices">
            <button type="button" class="choice-btn" data-value="6.99">R$ 6,99</button>
            <button type="button" class="choice-btn" data-value="9.99">R$ 9,99</button>
            <button type="button" class="choice-btn" data-value="0">Sem taxa</button>
            <button type="button" class="choice-btn fee-custom-choice" data-value="custom">✎ Taxa livre</button>
          </div>
          <label id="quickCustomFeeWrap" class="quick-custom-fee hidden">
            <span>Valor livre da taxa</span>
            <div class="money-input-wrap"><strong>R$</strong><input id="quickCustomFee" name="customFee" type="text" inputmode="decimal" autocomplete="off" placeholder="Ex.: 12,50" /></div>
            <small>Digite qualquer valor. Você pode usar vírgula ou ponto.</small>
          </label>
        </section>

        <section class="quick-step-card">
          <div class="quick-step-head"><span>3</span><div><strong>Quando será entregue?</strong><small>Escolha hoje ou informe uma data específica.</small></div></div>
          <input type="hidden" name="deliveryMode" id="quickDeliveryMode" value="today" />
          <div class="choice-buttons simple-choices" id="deliveryModeChoices">
            <button type="button" class="choice-btn selected" data-value="today">🚚 Entregar hoje</button>
            <button type="button" class="choice-btn" data-value="schedule">📅 Agendar outro dia</button>
          </div>
          <div id="quickScheduledDateWrap" class="quick-schedule-details hidden">
            <label>Dia programado<input name="scheduledDate" type="date" min="${today}" /></label>
            <label>Horário previsto<input name="scheduledTime" type="time" /></label>
            <label class="full">Detalhes do agendamento <small>(opcional)</small><textarea name="scheduleNotes" placeholder="Ex.: Entregar na portaria e ligar antes"></textarea></label>
          </div>
        </section>

        <div class="finance-rule-note simplified-note">A taxa entra no faturamento no momento do registro. Reagendamentos não duplicam receita. Se houver retirada com reembolso, o reembolso é registrado separadamente.</div>
        <div class="form-actions sticky-actions"><button type="button" class="btn secondary" id="cancelQuickDeliveryBtn">Cancelar</button><button type="submit" class="btn primary large-action">Registrar compra Nº ${esc(last.suggested || '')}</button></div>
      </form>
    `,'LANÇAMENTO RÁPIDO');

    const feeButtons = $$('#feeChoices .choice-btn');
    const customFeeWrap = $('#quickCustomFeeWrap');
    const customFeeInput = $('#quickCustomFee');
    feeButtons.forEach(btn=>btn.addEventListener('click',()=>{
      feeButtons.forEach(x=>x.classList.remove('selected'));
      btn.classList.add('selected');
      const isCustom = btn.dataset.value === 'custom';
      $('#quickFeeMode').value = isCustom ? 'custom' : 'fixed';
      customFeeWrap?.classList.toggle('hidden', !isCustom);
      if (isCustom) {
        $('#quickFee').value = '';
        setTimeout(()=>customFeeInput?.focus(), 40);
      } else {
        $('#quickFee').value = btn.dataset.value;
        if (customFeeInput) customFeeInput.value = '';
      }
    }));
    customFeeInput?.addEventListener('input',()=>{
      const parsed = parseMoneyInput(customFeeInput.value);
      $('#quickFee').value = parsed === null ? '' : String(parsed);
    });
    const modeButtons = $$('#deliveryModeChoices .choice-btn');
    modeButtons.forEach(btn=>btn.addEventListener('click',()=>{
      modeButtons.forEach(x=>x.classList.remove('selected')); btn.classList.add('selected'); $('#quickDeliveryMode').value=btn.dataset.value;
      const scheduling = btn.dataset.value === 'schedule';
      $('#quickScheduledDateWrap').classList.toggle('hidden',!scheduling);
      const scheduledDateInput = $('#quickDeliveryForm [name="scheduledDate"]');
      const scheduledTimeInput = $('#quickDeliveryForm [name="scheduledTime"]');
      if (scheduledDateInput) scheduledDateInput.required = scheduling;
      if (scheduledTimeInput) scheduledTimeInput.required = scheduling;
    }));
    const orderInput = $('#quickDeliveryForm [name="orderNo"]');
    const submitBtn = $('#quickDeliveryForm button[type="submit"]');
    const syncAutomaticOrderNumber = () => {
      if (!orderInput) return;
      const selectedDate = $('#quickDeliveryForm [name="date"]')?.value || today;
      orderInput.value = lastPurchaseSummary(selectedDate).suggested || '1';
      if (submitBtn) submitBtn.textContent = `Registrar compra Nº ${orderInput.value}`;
      const suggestion = $('#nextPurchaseSuggestedNumber');
      if (suggestion) suggestion.textContent = `Nº ${orderInput.value}`;
    };
    $('#quickDeliveryForm [name="date"]')?.addEventListener('change',syncAutomaticOrderNumber);
    syncAutomaticOrderNumber();
    $('#cancelQuickDeliveryBtn').addEventListener('click',closeModal);
    $('#quickDeliveryForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const data=Object.fromEntries(new FormData(e.target).entries());
      for (const field of ['orderNo','coupon','docNo','cashierNo']) data[field] = String(data[field] || '').trim();
      data.customerName = uppercaseName(data.customerName);
      data.customerPhone = formatPhoneBR(data.customerPhone);
      for (const field of ['address','addressNumber','addressComplement','addressReference']) data[field] = String(data[field] || '').trim();
      data.priority = data.priority === 'on';
      data.scheduleNotes = String(data.scheduleNotes || '').trim();
      const parsedFee = data.feeMode === 'custom' ? parseMoneyInput(data.customFee) : parseMoneyInput(data.fee);
      if(parsedFee === null){toast(data.feeMode === 'custom' ? 'Informe um valor válido para a taxa livre.' : 'Escolha a taxa de entrega.','warning');return;}
      data.fee = String(parsedFee);
      if(data.deliveryMode==='schedule' && (!data.scheduledDate || !data.scheduledTime)){toast('Informe o dia e o horário previstos para a entrega.','warning');return;}
      const duplicateOrder = scoped(state.deliveries).find(d => d.date===data.date && isRootPurchase(d) && String(d.orderNo||'').trim()===String(data.orderNo||'').trim());
      if (duplicateOrder && !confirm(`Atenção: já existe a Compra Nº ${data.orderNo} nesta data (Nº do cupom ${duplicateOrder.coupon||'—'}).\n\nDeseja continuar mesmo assim?`)) return;
      const duplicateCoupon = scoped(state.deliveries).find(d => d.date===data.date && isRootPurchase(d) && String(d.coupon||'').trim()===String(data.coupon||'').trim());
      if (duplicateCoupon && !confirm(`Possível duplicidade: o Nº do cupom ${data.coupon} já está na Compra Nº ${duplicateCoupon.orderNo||'—'}.\n\nConfira antes de continuar. Deseja registrar mesmo assim?`)) return;
      const duplicateDoc = scoped(state.deliveries).find(d => d.date===data.date && isRootPurchase(d) && String(d.docNo||'').trim()===data.docNo && String(d.cashierNo||'').trim()===data.cashierNo);
      if (duplicateDoc && !confirm(`Possível duplicidade: o DOC ${data.docNo} do Caixa ${data.cashierNo} já está na Compra Nº ${duplicateDoc.orderNo||'—'}.\n\nConfira antes de continuar. Deseja registrar mesmo assim?`)) return;
      const id=uid('del');
      const scheduled=data.deliveryMode==='schedule';
      const d={
        id,rootId:id,parentId:'',attemptNo:1,date:data.date,orderNo:data.orderNo||'',coupon:data.coupon,docNo:data.docNo,cashierNo:data.cashierNo,customerName:data.customerName,customerPhone:data.customerPhone,purchaseTime:data.purchaseTime,
        neighborhoodId:data.neighborhoodId,address:data.address,addressNumber:data.addressNumber,addressComplement:data.addressComplement,addressReference:data.addressReference,priority:data.priority,fee:Number(data.fee||0),driverId:'',vehicleId:'',cycleId:'',departureTime:'',finalizationTime:'',returnTime:'',
        status:scheduled?'Programada':'Na loja',scheduledDate:scheduled?data.scheduledDate:'',scheduledTime:scheduled?data.scheduledTime:'',scheduleNotes:scheduled?data.scheduleNotes:'',scheduleKind:'Programada',reasonId:scheduled?'CLIENTE_OUTRO_DIA':'',reasonText:'',nextAction:scheduled?`Entregar em ${dateBR(data.scheduledDate)} às ${data.scheduledTime}`:'',notes:'',returnedUndelivered:false,returnReasonId:'',returnReasonText:'',
        refundAmount:0,refundDate:'',withdrawalDate:'',withdrawalTime:'',createdAt:nowISO(),updatedAt:nowISO(),mode:currentMode(),
        history:[{id:uid('evt'),type:'purchase_registered',at:nowISO(),fee:Number(data.fee||0)}]
      };
      if(scheduled)d.history.push({id:uid('evt'),type:'scheduled',from:d.date,to:d.scheduledDate,scheduledTime:d.scheduledTime,scheduleNotes:d.scheduleNotes,kind:'Programada',at:nowISO(),reasonId:d.reasonId});
      state.deliveries.push(d);
      await saveState(`Compra ${d.orderNo || d.coupon} registrada`);
      closeModal();toast(scheduled?`Compra Nº ${d.orderNo || '—'} agendada para ${scheduledDateTimeLabel(d)}.`:`Compra Nº ${d.orderNo || '—'} registrada. A taxa já entrou no faturamento.`,'success');render();
    });
  }

  function openDeliveryModal(id='') {
    if (!id) { openQuickDeliveryModal(); return; }
    const existing = id ? scoped(state.deliveries).find(d=>d.id===id) : null;
    const d = existing ? {...existing} : {
      id:uid('del'), rootId:'', parentId:'', attemptNo:1,
      date:todayISO(), orderNo:'', coupon:'', docNo:'', cashierNo:'', customerName:'', customerPhone:'', purchaseTime:'', neighborhoodId:'', address:'', addressNumber:'', addressComplement:'', addressReference:'', priority:false, fee:0,
      driverId:'', vehicleId:'', cycleId:'', departureTime:'', finalizationTime:'', returnTime:'',
      status:'Na loja', scheduledDate:'', scheduledTime:'', scheduleNotes:'', scheduleKind:'Programada', reasonId:'', reasonText:'', nextAction:'', notes:'', returnedUndelivered:false, returnReasonId:'', returnReasonText:'', refundAmount:0, refundDate:'', withdrawalDate:'', withdrawalTime:'', createdAt:nowISO(), updatedAt:nowISO(), mode:currentMode(), history:[]
    };
    if (!d.rootId) d.rootId = d.id;
    const calc = deliveryCalc(d);
    openModal(existing?'Editar entrega':'Nova entrega','Registre os horários reais para calcular espera, atraso, tempo até o cliente e tempo total de rota.',`
      <form id="deliveryForm">
        <input type="hidden" name="id" value="${d.id}" />
        <div class="form-section-title">Identificação da entrega</div>
        <div class="form-grid">
          <label>Data<input name="date" type="date" value="${d.date}" required /></label>
          <label>Nº da compra<input name="orderNo" value="${attr(d.orderNo)}" placeholder="Ordem de chegada" /></label>
          <label>Nº DO CUPOM<input name="coupon" value="${attr(d.coupon)}" required /></label>
          <label>Nº do DOC<input name="docNo" value="${attr(d.docNo)}" inputmode="numeric" placeholder="Não informado em registros antigos" /></label>
          <label>Nº do caixa<input name="cashierNo" value="${attr(d.cashierNo)}" inputmode="numeric" placeholder="Não informado em registros antigos" /></label>
          <label>Nome do cliente <small>(opcional)</small><input name="customerName" value="${attr(d.customerName)}" autocomplete="name" data-uppercase-name /></label>
          <label>Número de telefone <small>(opcional)</small><input name="customerPhone" value="${attr(d.customerPhone)}" type="tel" inputmode="tel" autocomplete="tel" data-phone-mask maxlength="20" placeholder="( 99 ) 9 9999-9999" /></label>
          <label>Hora da compra / entrada<input name="purchaseTime" type="time" value="${d.purchaseTime || ''}" /></label>
          <label>Bairro<select name="neighborhoodId">${options(state.neighborhoods,d.neighborhoodId)}</select></label>
          <label>Rua / avenida<input name="address" value="${attr(d.address||'')}" autocomplete="street-address" /></label>
          <label>Número<input name="addressNumber" value="${attr(d.addressNumber||'')}" inputmode="numeric" /></label>
          <label>Complemento<input name="addressComplement" value="${attr(d.addressComplement||'')}" /></label>
          <label>Referência<input name="addressReference" value="${attr(d.addressReference||'')}" /></label>
          <label class="priority-delivery-toggle"><input name="priority" type="checkbox" ${d.priority?'checked':''} /><span><strong>★ Entrega prioritária</strong><small>Fica no começo do roteiro do ciclo.</small></span></label>
          <label>Taxa de entrega<input name="fee" type="number" step="0.01" min="0" value="${Number(d.fee||0) || ''}" /></label>
          <label>Entregador<select name="driverId">${options(state.employees.filter(x=>x.role==='Entregador'||x.role==='Colaborador'),d.driverId)}</select></label>
          <label>Veículo<select name="vehicleId">${options(state.vehicles,d.vehicleId)}</select></label>
          <label>Ciclo<select name="cycleId">${options(scoped(state.cycles),d.cycleId,'code')}</select></label>
          <label>Status<select name="status">${statusOptions.map(s=>`<option value="${s}" ${d.status===s?'selected':''}>${s}</option>`).join('')}</select></label>
        </div>

        <div class="form-section"><div class="form-section-title">Tempos da operação</div>
          <div class="form-grid">
            <label>Saída para entrega<input name="departureTime" type="time" value="${d.departureTime || ''}" /></label>
            <label>Finalização no cliente<input name="finalizationTime" type="time" value="${d.finalizationTime || ''}" /></label>
            <label>Retorno à loja<input name="returnTime" type="time" value="${d.returnTime || ''}" /></label>
            <div class="form-note">Compra → saída: <strong>${fmtMinutes(calc.wait)}</strong><br>Loja → cliente: <strong>${fmtMinutes(calc.toClient)}</strong><br>Compra → entrega: <strong>${fmtMinutes(calc.purchaseToClient)}</strong><br>Rota total: <strong>${fmtMinutes(calc.route)}</strong><br>${deliveryStandardBadges(d,calc)}</div>
          </div>
        </div>



        <div class="form-section"><div class="form-section-title">Financeiro e retirada na loja</div>
          <div class="form-grid">
            <div class="form-note span-2">A taxa original de <strong>${money(rootDelivery(d)?.fee || d.fee)}</strong> foi contabilizada no registro da compra. Reagendamentos não geram nova receita.</div>
            <label>Valor reembolsado<input name="refundAmount" type="number" step="0.01" min="0" value="${Number(rootDelivery(d)?.refundAmount||0)||''}" /></label>
            <label>Data do reembolso<input name="refundDate" type="date" value="${rootDelivery(d)?.refundDate||''}" /></label>
          </div>
        </div>

        <div class="form-section"><div class="form-section-title">Programação, reagendamento e ocorrências</div>
          <div class="form-grid">
            <label>Dia programado<input name="scheduledDate" type="date" value="${d.scheduledDate || ''}" /></label>
            <label>Horário previsto<input name="scheduledTime" type="time" value="${d.scheduledTime || ''}" /></label>
            <label>Tipo<select name="scheduleKind"><option value="Programada" ${d.scheduleKind==='Programada'?'selected':''}>Programada</option><option value="Reagendada" ${d.scheduleKind==='Reagendada'?'selected':''}>Reagendada</option></select></label>
            <label>Motivo padronizado<select name="reasonId">${options(state.reasons,d.reasonId)}</select></label>
            <label>Motivo complementar<input name="reasonText" value="${attr(d.reasonText)}" placeholder="Opcional" /></label>
            <label class="span-2">Próxima ação<input name="nextAction" value="${attr(d.nextAction)}" placeholder="Ex.: Reentregar amanhã" /></label>
            <label class="span-2">Detalhes do agendamento<textarea name="scheduleNotes" placeholder="Ex.: Ligar antes, entregar na portaria">${esc(d.scheduleNotes || '')}</textarea></label>
            <label class="span-2">Observações<textarea name="notes">${esc(d.notes)}</textarea></label>
          </div>
        </div>
        <div class="form-actions">
          ${existing ? `<button type="button" class="btn danger" id="deleteDeliveryBtn">Apagar e enviar para Lixeira</button>`:''}
          <button type="button" class="btn secondary" id="cancelDeliveryBtn">Cancelar</button>
          <button type="submit" class="btn primary">Salvar entrega</button>
        </div>
      </form>
    `);
    $('#cancelDeliveryBtn').addEventListener('click',closeModal);
    if(existing) $('#deleteDeliveryBtn').addEventListener('click',()=>deleteDelivery(d.id));
    $('#deliveryForm').addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      for (const field of ['orderNo','coupon','docNo','cashierNo']) data[field] = String(data[field] || '').trim();
      data.customerName = uppercaseName(data.customerName);
      data.customerPhone = formatPhoneBR(data.customerPhone);
      for (const field of ['address','addressNumber','addressComplement','addressReference']) data[field] = String(data[field] || '').trim();
      data.priority = data.priority === 'on';
      data.scheduleNotes = String(data.scheduleNotes || '').trim();
      if (!data.scheduledDate) { data.scheduledTime = ''; data.scheduleNotes = ''; }
      data.fee = Number(data.fee || 0);
      data.refundAmount = Number(data.refundAmount || 0);
      const old = scoped(state.deliveries).find(x=>x.id===data.id);
      const root = old ? rootDelivery(old) : null;
      if (root && root.id !== old.id) { root.refundAmount = data.refundAmount; root.refundDate = data.refundDate || ''; data.refundAmount = Number(old.refundAmount||0); data.refundDate = old.refundDate||''; }
      data.rootId = old?.rootId || data.id;
      data.parentId = old?.parentId || '';
      data.attemptNo = old?.attemptNo || 1;
      data.createdAt = old?.createdAt || nowISO();
      data.updatedAt = nowISO();
      data.mode = old?.mode || currentMode();
      data.history = old?.history ? [...old.history] : [];
      if (old && (old.scheduledDate !== data.scheduledDate || old.scheduledTime !== data.scheduledTime || old.scheduleNotes !== data.scheduleNotes) && data.scheduledDate) {
        data.history.push({ id:uid('evt'), type:'schedule_change', from:old.scheduledDate || old.date, fromTime:old.scheduledTime || '', to:data.scheduledDate, scheduledTime:data.scheduledTime || '', scheduleNotes:data.scheduleNotes, kind:data.scheduleKind, at:nowISO(), reasonId:data.reasonId, reasonText:data.reasonText });
      } else if (!old && data.scheduledDate) {
        data.history.push({ id:uid('evt'), type:'scheduled', from:data.date, to:data.scheduledDate, scheduledTime:data.scheduledTime || '', scheduleNotes:data.scheduleNotes, kind:data.scheduleKind, at:nowISO(), reasonId:data.reasonId, reasonText:data.reasonText });
      }
      if (data.returnTime && !['Devolvida','Retirada na loja','Cancelada'].includes(data.status)) data.status='Finalizada';
      else if (data.departureTime && !data.returnTime && data.status==='Na loja') data.status='Em rota';
      if (data.scheduledDate && ['Na loja','Em rota','Devolvida'].includes(data.status)) data.status = data.scheduleKind || 'Programada';
      const previousDate = old?.date || '';
      if (old) {
        const previousCycle = old.cycleId ? state.cycles.find(c=>c.id===old.cycleId) : null;
        const previousAutoKey = previousCycle?.autoGenerated ? automaticCycleKeyFromCycle(previousCycle) : '';
        const newAutoKey = automaticCycleKeyFromDelivery(data);
        if (previousCycle?.autoGenerated && data.cycleId === previousCycle.id && previousAutoKey !== newAutoKey) data.cycleId = '';
        if (data.status === 'Finalizada') {
          data.returnedUndelivered = false;
          data.returnReasonId = '';
          data.returnReasonText = '';
        }
        Object.assign(old,data);
      } else state.deliveries.push(data);
      const autoCycleResult=autoIdentifyCyclesSync({date:data.date});
      if (previousDate && previousDate !== data.date) autoIdentifyCyclesSync({date:previousDate});
      await saveState(old ? `Entrega ${data.coupon} editada${autoCycleResult.cyclesCreated?` • ${autoCycleResult.cyclesCreated} ciclo automático criado`:''}` : `Entrega ${data.coupon} criada${autoCycleResult.cyclesCreated?` • ${autoCycleResult.cyclesCreated} ciclo automático criado`:''}`);
      closeModal(); toast(autoCycleResult.cyclesCreated?'Entrega salva e ciclo automático identificado.':'Entrega salva com sucesso.','success'); render();
    });
  }

  async function deleteDelivery(id) {
    const d=scoped(state.deliveries).find(x=>x.id===id); if(!d)return;
    const descendants=[]; const walk=(parentId)=>{scoped(state.deliveries).filter(x=>x.parentId===parentId).forEach(x=>{descendants.push(x);walk(x.id);});}; walk(d.id);
    const bundle=[d,...descendants];
    const message=descendants.length ? `Apagar esta entrega e também ${descendants.length} tentativa(s) ligada(s) a ela? Tudo irá para a Lixeira.` : 'Apagar este registro? Ele irá para a Lixeira e poderá ser restaurado.';
    if(!confirm(message))return;
    await moveToTrash('delivery_bundle',bundle,`Entrega • Nº do cupom ${d.coupon||'—'}`);
    const ids=new Set(bundle.map(x=>x.id)); state.deliveries=state.deliveries.filter(x=>!ids.has(x.id));
    await saveState(`Entrega ${d.coupon||d.id} apagada`); closeModal();toast('Entrega enviada para a Lixeira.','success');render();
  }


  async function quickDelivered(id) {
    const d=state.deliveries.find(x=>x.id===id); if(!d)return;
    d.finalizationTime=currentTimeHM();
    if(!d.departureTime)d.departureTime=d.finalizationTime;
    d.returnedUndelivered=false;d.returnReasonId='';d.returnReasonText='';
    d.status=d.returnTime?'Finalizada':'Em rota';d.updatedAt=nowISO();d.history||=[];d.history.push({id:uid('evt'),type:'delivered',at:nowISO(),time:d.finalizationTime});
    const autoCycleResult=autoIdentifyCyclesSync({date:d.date});
    await saveState(`Entrega ${d.coupon} marcada como entregue${autoCycleResult.cyclesCreated?` • ciclo automático ${autoCycleResult.cyclesCreated}`:''}`);toast(autoCycleResult.cyclesCreated?'Hora de entrega registrada e ciclo automático identificado.':'Hora de entrega registrada automaticamente.','success');render();
  }

  async function quickReturn(id) {
    const d=state.deliveries.find(x=>x.id===id); if(!d)return;
    if (d.cycleId) {
      openCloseCycleModal(d.cycleId);
      return;
    }
    if(!d.finalizationTime && !confirm('A entrega ainda não tem hora de finalização no cliente. Registrar o retorno mesmo assim?'))return;
    d.returnTime=currentTimeHM();d.status='Finalizada';d.updatedAt=nowISO();d.history||=[];d.history.push({id:uid('evt'),type:'returned_to_store',at:nowISO(),time:d.returnTime});
    await saveState(`Retorno da entrega ${d.coupon} registrado`);toast('Retorno à loja registrado. Entrega finalizada.','success');render();
  }
  function quickDeparture(id) {
    openCycleDepartureModal(id || '');
  }

  function cycleAvailableDeliveries(date = todayISO()) {
    return scoped(state.deliveries).filter(d => {
      if (d.date !== date || isFinal(d) || d.departureTime) return false;
      if (d.scheduledDate && openScheduled(d)) return false;
      return true;
    }).sort((a,b)=>{
      const aw=currentWaitMinutes(a)??0,bw=currentWaitMinutes(b)??0;
      const ad=aw>Number(state.settings.delayMinutes||120)?0:1,bd=bw>Number(state.settings.delayMinutes||120)?0:1;
      return ad-bd || bw-aw || (a.purchaseTime||'').localeCompare(b.purchaseTime||'');
    });
  }

  function nextCycleCode(date = todayISO()) {
    const prefix = `CIC-${date.replaceAll('-','')}-`;
    const seq = scoped(state.cycles).filter(c=>c.date===date).length + 1;
    return `${prefix}${String(seq).padStart(2,'0')}`;
  }

  function automaticCycleKeyFromDelivery(d) {
    if (!d?.date || !d?.departureTime || !d?.vehicleId || !d?.driverId) return '';
    return `${d.mode || 'production'}|${d.date}|${d.departureTime}|${d.vehicleId}|${d.driverId}`;
  }

  function automaticCycleKeyFromCycle(c) {
    if (!c?.date || !c?.departureTime || !c?.vehicleId || !c?.driverId) return '';
    return `${c.mode || 'production'}|${c.date}|${c.departureTime}|${c.vehicleId}|${c.driverId}`;
  }

  function autoIdentifyCyclesSync({ date = '' } = {}) {
    if (!state?.settings?.autoCycles) return { changed:false, cyclesCreated:0, deliveriesLinked:0, cyclesMerged:0 };
    let changed=false, cyclesCreated=0, deliveriesLinked=0, cyclesMerged=0;
    const mode=currentMode();
    const deliveryScope=state.deliveries.filter(d => (d.mode || 'production') === mode && (!date || d.date === date));
    const cycleScope=state.cycles.filter(c => (c.mode || 'production') === mode && (!date || c.date === date));

    // Primeiro, reúne ciclos automáticos duplicados que representam a mesma saída real.
    const cycleGroups=new Map();
    cycleScope.forEach(c=>{
      const key=automaticCycleKeyFromCycle(c); if(!key)return;
      if(!cycleGroups.has(key)) cycleGroups.set(key,[]);
      cycleGroups.get(key).push(c);
    });
    cycleGroups.forEach((cycles,key)=>{
      if(cycles.length<2)return;
      const preferred=cycles.find(c=>!c.autoGenerated) || cycles[0];
      cycles.filter(c=>c.id!==preferred.id && c.autoGenerated).forEach(extra=>{
        deliveryScope.filter(d=>d.cycleId===extra.id).forEach(d=>{
          d.cycleId=preferred.id; d.updatedAt=nowISO(); d.history||=[];
          d.history.push({id:uid('evt'),type:'cycle_auto_merged',fromCycleId:extra.id,toCycleId:preferred.id,at:nowISO()});
          deliveriesLinked++; changed=true;
        });
        state.cycles=state.cycles.filter(c=>c.id!==extra.id);
        cyclesMerged++; changed=true;
      });
    });

    const groups=new Map();
    deliveryScope.forEach(d=>{
      if(d.cycleId)return;
      const key=automaticCycleKeyFromDelivery(d); if(!key)return;
      if(!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(d);
    });

    groups.forEach((deliveries,key)=>{
      const [recordMode,cycleDate,departureTime,vehicleId,driverId]=key.split('|');
      let c=state.cycles.find(x => automaticCycleKeyFromCycle(x)===key);
      if(!c){
        const sameReturns=unique(deliveries.map(d=>d.returnTime).filter(Boolean));
        c={
          id:uid('cyc'),code:nextCycleCode(cycleDate),date:cycleDate,vehicleId,driverId,departureTime,
          returnTime:sameReturns.length===1 && deliveries.every(d=>!!d.returnTime) ? sameReturns[0] : '',
          notes:`Ciclo identificado automaticamente: ${deliveries.length} entrega(s) com a mesma saída, veículo e entregador.`,
          routeDeliveryIds:[],routeGeneratedAt:nowISO(),routeStrategy:'priority_neighborhood_google_maps',
          createdAt:nowISO(),updatedAt:nowISO(),mode:recordMode,autoGenerated:true,creationMethod:'automatic_departure_group'
        };
        state.cycles.push(c); ensureRouteTrack(c); cyclesCreated++; changed=true;
      }
      deliveries.forEach(d=>{
        d.cycleId=c.id; d.updatedAt=nowISO(); d.history||=[];
        d.history.push({id:uid('evt'),type:'cycle_auto_linked',cycleId:c.id,cycleCode:c.code,at:nowISO(),departureTime:d.departureTime});
        deliveriesLinked++; changed=true;
      });
      c.routeDeliveryIds=routeSortDeliveries(state.deliveries.filter(d=>d.cycleId===c.id)).map(d=>d.id);
      c.routeGeneratedAt=nowISO();
      c.routeStrategy='priority_neighborhood_google_maps';
    });

    // Remove somente ciclos automáticos vazios; ciclos manuais nunca são apagados por esta rotina.
    const usedCycleIds=new Set(state.deliveries.filter(d=>(d.mode||'production')===mode && d.cycleId).map(d=>d.cycleId));
    const before=state.cycles.length;
    state.cycles=state.cycles.filter(c=>!((c.mode||'production')===mode && c.autoGenerated && (!date || c.date===date) && !usedCycleIds.has(c.id)));
    if(state.cycles.length!==before) changed=true;

    return { changed, cyclesCreated, deliveriesLinked, cyclesMerged };
  }

  async function runAutoCycleDetection(date = '') {
    const result=autoIdentifyCyclesSync({date});
    if(!result.changed){
      toast(date ? 'Nenhuma nova saída conjunta encontrada nesta data.' : 'Nenhuma nova saída conjunta encontrada para identificar.','info');
      return;
    }
    await saveState(`Detecção automática criou ${result.cyclesCreated} ciclo(s) e vinculou ${result.deliveriesLinked} entrega(s)`);
    toast(`${result.cyclesCreated} ciclo(s) automático(s) identificado(s) • ${result.deliveriesLinked} entrega(s) vinculada(s).`,'success');
    render();
  }

  function cycleRoutePreviewHTML(deliveries) {
    const ordered = routeSortDeliveries(deliveries);
    if (!ordered.length) return `<div class="cycle-route-preview empty"><strong>Roteiro aguardando seleção</strong><small>Marque as entregas e a ordem por prioridade e bairro aparecerá aqui.</small></div>`;
    const priorities = ordered.filter(d=>d.priority).length;
    const precise = ordered.filter(deliveryHasPreciseAddress).length;
    const neighborhoods = unique(ordered.map(d=>d.neighborhoodId).filter(Boolean)).length;
    return `<section class="cycle-route-preview">
      <div class="cycle-route-preview-head"><div><span>ROTEIRO SUGERIDO</span><strong>${ordered.length} entrega(s) • ${neighborhoods} bairro(s)</strong><small>${priorities ? `${priorities} prioridade(s) posicionada(s) primeiro` : 'Sem entrega prioritária nesta saída'} • ${precise}/${ordered.length} com endereço exato</small></div><span class="maps-brand">Google Maps</span></div>
      <ol>${ordered.slice(0,8).map(d=>`<li class="${d.priority?'priority':''}"><span>${d.priority?'★':ordered.indexOf(d)+1}</span><div><strong>${d.priority?'<b>PRIORIDADE</b> ':''}NF ${esc(d.docNo||'—')} • ${esc(neighborhood(d.neighborhoodId)?.name||'Sem bairro')} • <b class="route-delivery-number">ENTREGA Nº ${esc(d.orderNo||'—')}</b></strong><small>${esc(deliveryAddressLine(d) || 'Parada aproximada pelo bairro')} • ${esc(d.customerName || `Cupom ${d.coupon||'—'}`)}</small></div></li>`).join('')}</ol>
      ${ordered.length>8?`<small class="cycle-route-more">+ ${ordered.length-8} entrega(s) na sequência do roteiro</small>`:''}
    </section>`;
  }

  function openCycleDepartureModal(preselectDeliveryId='') {
    const date=todayISO();
    const available=cycleAvailableDeliveries(date);
    if (!available.length) {
      toast('Não há entregas disponíveis para montar uma nova saída.','warning');
      return;
    }
    openModal('Montar saída / ciclo automático','Selecione todas as entregas que irão juntas. Ao confirmar a saída, o sistema cria e identifica o ciclo automaticamente.',`
      <form id="cycleDepartureForm" class="quick-action-form">
        <div class="cycle-definition-box"><span>↻</span><div><strong>✓ CICLO AUTOMÁTICO • 1 saída + 1 retorno = 1 ciclo</strong><small>Todas as entregas selecionadas recebem o mesmo ciclo automaticamente. O KM não é digitado aqui. O sistema usa o KM inicial e final do expediente do veículo para calcular as médias por ciclo e por entrega.</small></div></div>
        <div class="form-grid">
          <label>Hora da saída<input name="departureTime" type="time" value="${currentTimeHM()}" required /></label>
          <label>Veículo<select name="vehicleId" required>${options(state.vehicles,'')}</select></label>
          <label>Entregador<select name="driverId" required>${options(state.employees.filter(x=>x.role==='Entregador'||x.role==='Colaborador'),'')}</select></label>
          <label>Identificação automática<input name="code" value="${nextCycleCode(date)}" readonly /><small>Gerada pelo sistema</small></label>
        </div>
        <div class="delivery-picker-head"><div><strong>Quais entregas serão levadas nesta saída?</strong><small>Selecione uma ou várias. Todas receberão a mesma hora de saída, veículo, entregador e ciclo.</small></div><span id="selectedDeliveryCount" class="badge blue">0 selecionadas</span></div>
        <div class="delivery-picker-list">
          ${routeSortDeliveries(available).map(d=>{const wait=currentWaitMinutes(d);const delayed=wait!==null&&wait>Number(state.settings.delayMinutes||120);return `<label class="delivery-picker-item v11-picker-item ${delayed?'late':''} ${d.priority?'priority':''}"><input type="checkbox" name="deliveryIds" value="${d.id}" ${d.id===preselectDeliveryId?'checked':''}/><span class="v11-picker-number">${d.priority?'★ PRI.':`Nº ${esc(d.orderNo||'—')}`}</span><span class="v11-picker-copy"><strong>${d.priority?'<b class="priority-inline">PRIORIDADE</b> ':''}Nº do cupom ${esc(d.coupon||'—')} • ${esc(neighborhood(d.neighborhoodId)?.name||'Sem bairro')}</strong><small>${esc(deliveryAddressLine(d) || 'Endereço exato não informado')} • Entrada ${d.purchaseTime||'—'} • espera ${fmtMinutes(wait)} • taxa ${money(rootDelivery(d)?.fee||d.fee)}</small></span>${delayed?'<span class="badge red">Atrasada</span>':''}</label>`;}).join('')}
        </div>
        <div id="cycleRoutePreview">${cycleRoutePreviewHTML(available.filter(d=>d.id===preselectDeliveryId))}</div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelCycleDepartureBtn">Cancelar</button><button type="submit" class="btn primary large-action">🚚 Confirmar saída e criar ciclo automático</button></div>
      </form>
    `,'SAÍDA DA LOJA');
    $('#cancelCycleDepartureBtn').addEventListener('click',closeModal);
    const form=$('#cycleDepartureForm');
    const updateCount=()=>{
      const selectedIds=new Set($$('input[name="deliveryIds"]:checked',form).map(input=>input.value));
      const selected=available.filter(d=>selectedIds.has(d.id));
      const n=selected.length;
      $('#selectedDeliveryCount').textContent=`${n} selecionada${n===1?'':'s'}`;
      $('#cycleRoutePreview').innerHTML=cycleRoutePreviewHTML(selected);
    };
    $$('input[name="deliveryIds"]',form).forEach(x=>x.addEventListener('change',updateCount)); updateCount();
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const fd=new FormData(form); const ids=fd.getAll('deliveryIds');
      const vehicleId=fd.get('vehicleId'), driverId=fd.get('driverId'), departureTime=fd.get('departureTime');
      if (!ids.length) { toast('Selecione pelo menos uma entrega para esta saída.','warning'); return; }
      const openVehicleCycle=scoped(state.cycles).find(c=>c.date===date && c.vehicleId===vehicleId && !c.returnTime);
      if (openVehicleCycle) { toast(`O veículo ${vehicle(vehicleId)?.name||''} já está em rota no ciclo ${openVehicleCycle.code}. Registre o retorno antes de abrir outra saída.`,'error'); return; }
      const openDriverCycle=scoped(state.cycles).find(c=>c.date===date && c.driverId===driverId && !c.returnTime);
      if (openDriverCycle) { toast(`O entregador ${employee(driverId)?.name||''} já está em rota no ciclo ${openDriverCycle.code}. Registre o retorno antes de abrir outra saída.`,'error'); return; }
      const selectedDeliveries=ids.map(id=>state.deliveries.find(x=>x.id===id)).filter(Boolean);
      const routeDeliveryIds=routeSortDeliveries(selectedDeliveries).map(d=>d.id);
      const c={id:uid('cyc'),code:fd.get('code')||nextCycleCode(date),date,vehicleId,driverId,departureTime,returnTime:'',notes:`Ciclo automático criado a partir da saída conjunta de ${ids.length} entrega(s).`,routeDeliveryIds,routeGeneratedAt:nowISO(),routeStrategy:'priority_neighborhood_google_maps',createdAt:nowISO(),updatedAt:nowISO(),mode:currentMode(),autoGenerated:true,creationMethod:'automatic_departure_group'};
      state.cycles.push(c);
      ensureRouteTrack(c);
      ids.forEach(id=>{
        const d=state.deliveries.find(x=>x.id===id); if(!d)return;
        d.departureTime=departureTime; d.vehicleId=vehicleId; d.driverId=driverId; d.cycleId=c.id; d.status='Em rota'; d.updatedAt=nowISO();
        d.history||=[]; d.history.push({id:uid('evt'),type:'departure',at:nowISO(),time:departureTime,vehicleId,driverId,cycleId:c.id});
      });
      await saveState(`Ciclo ${c.code} aberto com ${ids.length} entrega(s)`);
      closeModal();
      const odo=scoped(state.odometerLogs).find(o=>o.date===date && o.vehicleId===vehicleId && Number(o.kmStart||0)>0);
      toast(odo?`Ciclo ${c.code} iniciado com ${ids.length} entrega(s).`:`Ciclo iniciado. Atenção: registre o KM inicial do veículo ${vehicle(vehicleId)?.name||''}.`,odo?'success':'warning');
      if(shouldAutoStartRouteTracking()) startRouteTracking(c.id,{automatic:true});
      else { toast('No celular do entregador, abra este ciclo e toque em “Ativar GPS” para registrar o trajeto real.','warning'); render(); }
    });
  }


  function openManageCycleDeliveriesModal(cycleId) {
    const c = scoped(state.cycles).find(x => x.id === cycleId); if (!c) return;
    const linked = scoped(state.deliveries).filter(d => d.cycleId === c.id);
    const linkedIds = new Set(linked.map(d => d.id));
    const finalStates = ['Finalizada','Devolvida','Retirada na loja','Cancelada','Reagendada','Programada'];
    const available = scoped(state.deliveries)
      .filter(d => d.date === c.date && !d.cycleId && (!c.returnTime || finalStates.includes(d.status) || !!d.finalizationTime))
      .filter(d => !linkedIds.has(d.id))
      .sort((a,b) => `${a.purchaseTime||''}`.localeCompare(`${b.purchaseTime||''}`));
    const all = [...linked, ...available];

    openModal(
      'Gerenciar entregas do ciclo',
      c.returnTime
        ? 'Este ciclo já está fechado. Você ainda pode corrigir o histórico, mas alterações podem mudar indicadores antigos.'
        : 'Adicione ou retire entregas livremente antes do retorno à loja. Os indicadores são recalculados automaticamente.',
      `
      <form id="manageCycleDeliveriesForm" class="quick-action-form">
        <div class="cycle-manager-hero ${c.returnTime?'closed':'open'}">
          <div class="cycle-manager-code"><span>${c.returnTime?'CICLO FECHADO':'CICLO EM ROTA'}</span><strong>${esc(c.code)}</strong></div>
          <div class="cycle-manager-stats">
            <div><span>Veículo</span><strong>${esc(vehicle(c.vehicleId)?.name||'—')}</strong></div>
            <div><span>Entregador</span><strong>${esc(employee(c.driverId)?.name||'—')}</strong></div>
            <div><span>Saída</span><strong>${c.departureTime||'—'}</strong></div>
            <div><span>Retorno</span><strong>${c.returnTime||'Em rota'}</strong></div>
          </div>
        </div>

        ${c.returnTime ? `<div class="note warning-note"><strong>Atenção:</strong> este ciclo já foi encerrado. Use esta tela apenas para corrigir um erro real de vínculo. O histórico da entrega receberá o registro da alteração.</div>` : `<div class="note"><strong>Como usar:</strong> marque tudo que realmente saiu neste ciclo. Desmarque uma entrega para retirá-la; marque uma disponível para adicioná-la.</div>`}

        <div class="cycle-manager-toolbar">
          <div>
            <strong>Entregas do ciclo</strong>
            <small>Selecione os cupons que realmente foram levados nesta saída.</small>
          </div>
          <span id="manageCycleCount" class="badge blue">${linked.length} selecionada${linked.length===1?'':'s'}</span>
        </div>

        <div class="cycle-manager-columns">
          <section class="cycle-manager-column inside">
            <div class="cycle-manager-column-head"><span>NO CICLO AGORA</span><strong>${linked.length}</strong></div>
            <div class="delivery-picker-list cycle-manager-list">
              ${linked.length ? linked.map(d => cycleManagerDeliveryItem(d, true, c)).join('') : `<div class="cycle-manager-empty">Nenhuma entrega vinculada.</div>`}
            </div>
          </section>
          <section class="cycle-manager-column available">
            <div class="cycle-manager-column-head"><span>DISPONÍVEIS PARA ADICIONAR</span><strong>${available.length}</strong></div>
            <div class="delivery-picker-list cycle-manager-list">
              ${available.length ? available.map(d => cycleManagerDeliveryItem(d, false, c)).join('') : `<div class="cycle-manager-empty">Nenhuma entrega disponível para esta data.</div>`}
            </div>
          </section>
        </div>

        ${c.returnTime ? `<label class="cycle-history-confirm"><input id="closedCycleConfirm" type="checkbox" /> <span>Confirmo que esta alteração corrige o histórico real deste ciclo fechado.</span></label>` : ''}

        <div class="form-actions">
          <button type="button" class="btn secondary" id="cancelManageCycleBtn">Cancelar</button>
          <button type="submit" class="btn primary large-action">✓ Salvar entregas do ciclo</button>
        </div>
      </form>
      `,
      'GESTÃO DO CICLO'
    );

    const form = $('#manageCycleDeliveriesForm');
    $('#cancelManageCycleBtn').addEventListener('click', closeModal);
    const updateCount = () => {
      const n = $$('input[name="managedDeliveryIds"]:checked', form).length;
      $('#manageCycleCount').textContent = `${n} selecionada${n===1?'':'s'}`;
    };
    $$('input[name="managedDeliveryIds"]', form).forEach(x => x.addEventListener('change', updateCount));
    updateCount();

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (c.returnTime && !$('#closedCycleConfirm')?.checked) {
        toast('Confirme que você está corrigindo o histórico de um ciclo já fechado.', 'warning');
        return;
      }
      const ids = new FormData(form).getAll('managedDeliveryIds');
      if (!ids.length) {
        toast('Um ciclo precisa manter pelo menos uma entrega vinculada.', 'warning');
        return;
      }
      const selected = new Set(ids);
      const current = new Set(linked.map(d => d.id));
      const addedIds = ids.filter(id => !current.has(id));
      const removedIds = [...current].filter(id => !selected.has(id));

      removedIds.forEach(id => {
        const d = state.deliveries.find(x => x.id === id); if (!d) return;
        d.cycleId = '';
        if (d.departureTime === c.departureTime) d.departureTime = '';
        if (d.returnTime === c.returnTime) d.returnTime = '';
        if (d.vehicleId === c.vehicleId) d.vehicleId = '';
        if (d.driverId === c.driverId) d.driverId = '';
        if (d.status === 'Em rota') d.status = 'Na loja';
        d.updatedAt = nowISO();
        d.history ||= [];
        d.history.push({id:uid('evt'), type:'cycle_removed', cycleId:c.id, cycleCode:c.code, at:nowISO()});
      });

      addedIds.forEach(id => {
        const d = state.deliveries.find(x => x.id === id); if (!d) return;
        d.cycleId = c.id;
        d.vehicleId = c.vehicleId;
        d.driverId = c.driverId;
        d.departureTime = c.departureTime;
        if (c.returnTime) d.returnTime = c.returnTime;
        if (!finalStates.includes(d.status)) d.status = c.returnTime && d.finalizationTime ? 'Finalizada' : 'Em rota';
        d.updatedAt = nowISO();
        d.history ||= [];
        d.history.push({id:uid('evt'), type:'cycle_added', cycleId:c.id, cycleCode:c.code, at:nowISO(), departureTime:c.departureTime, returnTime:c.returnTime||''});
      });

      c.updatedAt = nowISO();
      c.routeDeliveryIds = routeSortDeliveries(ids.map(id=>state.deliveries.find(d=>d.id===id)).filter(Boolean)).map(d=>d.id);
      c.routeGeneratedAt = nowISO();
      c.routeStrategy = 'priority_neighborhood_google_maps';
      c.notes = `${c.notes||''}${c.notes?'\n':''}Gestão manual de entregas: +${addedIds.length} / -${removedIds.length} em ${new Date().toLocaleString('pt-BR')}`;
      await saveState(`Ciclo ${c.code}: ${addedIds.length} adicionada(s), ${removedIds.length} removida(s)`);
      closeModal();
      toast(`Ciclo atualizado: ${ids.length} entrega(s), +${addedIds.length} / -${removedIds.length}.`, 'success');
      render();
    });
  }

  function cycleManagerDeliveryItem(d, checked, c) {
    const calc = deliveryCalc(d);
    const status = d.status || 'Na loja';
    return `<label class="cycle-manager-item ${checked?'selected':''}">
      <input type="checkbox" name="managedDeliveryIds" value="${d.id}" ${checked?'checked':''} />
      <span class="cycle-manager-check">✓</span>
      <span class="cycle-manager-copy">
        <strong>${d.priority?'<b class="priority-inline">PRIORIDADE</b> ':''}Nº do cupom ${esc(d.coupon||'—')}</strong>
        <small>${esc(neighborhood(d.neighborhoodId)?.name||'Sem bairro')} • ${esc(deliveryAddressLine(d) || 'sem endereço exato')} • ${statusBadge(status)} • entrada ${d.purchaseTime||'—'}</small>
      </span>
      <span class="cycle-manager-time">${calc.wait!=null?fmtMinutes(calc.wait):'—'}</span>
    </label>`;
  }

  function openCycleRouteModal(cycleId) {
    const c = scoped(state.cycles).find(item=>item.id===cycleId); if (!c) return;
    const ordered = cycleRouteDeliveries(c);
    if (!ordered.length) { toast('Este ciclo ainda não possui entregas para roteirizar.','warning'); return; }
    const stops = routeStopsForDeliveries(ordered);
    if (!stops.length) { toast('Informe pelo menos o bairro ou o endereço das entregas antes de abrir o mapa.','warning'); return; }
    const fullRouteUrl = googleMapsFullRouteUrl(stops);
    const segments = googleMapsRouteSegments(stops);
    const preciseCount = ordered.filter(deliveryHasPreciseAddress).length;
    const priorityCount = ordered.filter(d=>d.priority).length;
    const neighborhoodCount = unique(ordered.map(d=>d.neighborhoodId).filter(Boolean)).length;
    openModal('Roteiro inteligente do ciclo','Prioridades vêm primeiro; as demais entregas são agrupadas pela sequência dos bairros. O Google Maps calcula o caminho pelas ruas.',`
      <section class="route-plan-hero">
        <div><span>ROTEIRO ${esc(c.code)}</span><strong>${ordered.length} entrega(s) em ${stops.length} parada(s)</strong><small>Saída e retorno: ${esc(routeOriginLabel())}</small></div>
        <div class="route-plan-kpis"><span><b>${priorityCount}</b> prioridade(s)</span><span><b>${neighborhoodCount}</b> bairro(s)</span><span><b>${preciseCount}/${ordered.length}</b> endereço(s) exato(s)</span></div>
      </section>
      <div class="route-plan-actions">
        ${fullRouteUrl?'<button type="button" class="btn maps-route-btn large-action" id="openFullRouteBtn">⌖ Abrir rota completa no Google Maps</button>':'<div class="note warning-note">A rota possui muitas paradas para um único link. Abra os trechos abaixo na sequência.</div>'}
        ${segments.length>1?`<div class="route-segment-buttons">${segments.map((segment,index)=>`<button type="button" class="btn secondary" data-route-segment="${index}">${segment.label} • paradas ${segment.start}–${segment.end}${segment.returnsToStore?' • retorna à loja':''}</button>`).join('')}</div>`:''}
      </div>
      ${preciseCount<ordered.length?`<div class="route-precision-note"><span>!</span><div><strong>${ordered.length-preciseCount} entrega(s) serão localizadas apenas pelo bairro</strong><small>Para a porta exata do cliente, complete rua e número no cadastro da entrega.</small></div></div>`:''}
      <ol class="route-stop-list">
        ${ordered.map((d,index)=>`<li class="route-stop-item ${d.priority?'priority':''}">
          <span class="route-stop-number">${d.priority?'★':index+1}</span>
          <div class="route-stop-copy"><div><strong>${d.priority?'<b>PRIORIDADE • ENTREGAR PRIMEIRO</b> ':''}NF ${esc(d.docNo||'—')} • Cupom ${esc(d.coupon||'—')} • <b class="route-delivery-number">ENTREGA Nº ${esc(d.orderNo||'—')}</b></strong>${d.priority?'<span class="badge red">Prioridade</span>':''}</div><small>${esc(d.customerName||'Cliente não informado')} • ${esc(d.customerPhone||'Sem telefone')}</small><p>${esc(deliveryAddressLine(d,true) || neighborhood(d.neighborhoodId)?.name || 'Endereço não informado')} • ${esc(neighborhood(d.neighborhoodId)?.name||'Sem bairro')}</p></div>
          <button type="button" class="route-stop-map" data-delivery-map="${d.id}" aria-label="Abrir parada ${index+1} no Google Maps">⌖</button>
        </li>`).join('')}
      </ol>
      <div class="route-method-note"><strong>Como a ordem é definida</strong><p>1º entregas prioritárias; depois sequência cadastrada dos bairros; dentro do mesmo bairro, endereço e horário de entrada. O roteiro continua disponível offline, mas abrir o mapa e calcular ruas exige internet.</p></div>
      <div class="form-actions"><button type="button" class="btn secondary" id="closeRoutePlanBtn">Fechar</button></div>
    `,'ROTEIRIZAÇÃO • GOOGLE MAPS');
    $('#openFullRouteBtn')?.addEventListener('click',()=>openExternalRoute(fullRouteUrl));
    $$('[data-route-segment]').forEach(button=>button.addEventListener('click',()=>openExternalRoute(segments[Number(button.dataset.routeSegment)]?.url || '')));
    $$('[data-delivery-map]').forEach(button=>button.addEventListener('click',()=>{
      const delivery = ordered.find(d=>d.id===button.dataset.deliveryMap);
      if (delivery) openExternalRoute(googleMapsDirectionsUrl(routeOriginLabel(),deliveryMapQuery(delivery),[]));
    }));
    $('#closeRoutePlanBtn').addEventListener('click',closeModal);
  }

  function openCloseCycleModal(cycleId) {
    const c=scoped(state.cycles).find(x=>x.id===cycleId); if(!c)return;
    if(c.returnTime){toast('Este ciclo já está fechado.','warning');return;}
    const linked=scoped(state.deliveries).filter(d=>d.cycleId===c.id);
    const unresolved=linked.filter(d=>!d.finalizationTime && !['Devolvida','Retirada na loja','Cancelada','Reagendada','Programada'].includes(d.status));
    const deliveredCount=linked.filter(deliveredToCustomer).length;
    const previouslyReturned=linked.filter(d=>d.returnedUndelivered || d.status==='Devolvida').length;
    openModal('Registrar retorno e fechar ciclo','Confirme o retorno do veículo. Se alguma entrega voltou, selecione a nota fiscal e informe o motivo.',`
      <form id="closeCycleForm" class="quick-action-form">
        <div class="cycle-return-summary"><div><span>CICLO</span><strong>${esc(c.code)}</strong></div><div><span>SAÍDA</span><strong>${c.departureTime||'—'}</strong></div><div><span>LEVADAS / ENTREGUES / VOLTARAM</span><strong>${linked.length} / ${deliveredCount} / ${previouslyReturned}</strong></div></div>
        <div class="form-grid"><label>Hora do retorno ao mercado<input name="returnTime" type="time" value="${currentTimeHM()}" required /></label></div>
        <fieldset class="cycle-return-question">
          <legend>Alguma entrega voltou sem ser entregue?</legend>
          <div class="cycle-return-answer-options">
            <label><input type="radio" name="hasReturnedDeliveries" value="no" checked /><span><strong>Não</strong><small>Todas foram finalizadas ou tiveram outro resultado.</small></span></label>
            <label><input type="radio" name="hasReturnedDeliveries" value="yes" /><span><strong>Sim</strong><small>Mostrar as notas fiscais ainda não finalizadas.</small></span></label>
          </div>
        </fieldset>
        <div class="cycle-return-deliveries hidden" id="returnedDeliveriesPanel">
          <div class="cycle-return-deliveries-head"><strong>Notas fiscais não finalizadas</strong><small>${unresolved.length ? `Selecione a(s) NF que voltaram e informe o motivo.` : 'Não existe nota fiscal pendente neste ciclo.'}</small></div>
          ${unresolved.length ? unresolved.map(d=>`<article class="cycle-return-delivery" data-return-card="${d.id}">
              <label class="cycle-return-choice"><input type="checkbox" name="returnedDeliveryIds" value="${d.id}" data-return-toggle="${d.id}" /><span><strong>NF ${esc(d.docNo||'—')} • Nº do cupom ${esc(d.coupon||'—')}</strong><small>${esc(neighborhood(d.neighborhoodId)?.name||'Sem bairro')} • ${esc(d.customerName||'Cliente não informado')}</small></span></label>
              <div class="return-resolution-fields" data-return-fields="${d.id}">
                <label>Por que voltou?<select name="returnReason_${d.id}" disabled>${options(state.reasons,d.returnReasonId||d.reasonId)}</select></label>
                <label>Detalhe complementar <small>(opcional)</small><input name="returnReasonText_${d.id}" value="${attr(d.returnReasonText||d.reasonText||'')}" disabled placeholder="Ex.: Cliente não estava no local" /></label>
              </div>
            </article>`).join('') : '<div class="note">Todas as notas fiscais deste ciclo já estão finalizadas ou possuem resultado registrado.</div>'}
        </div>
        ${!linked.length?'<div class="note warning-note">Este ciclo não possui entregas vinculadas. Corrija os vínculos antes de encerrar.</div>':''}
        <div class="note">As NFs marcadas como “voltou” serão registradas como devolvidas, com motivo e histórico. Entregas agendadas continuam fora do indicador comum de atraso.</div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelCloseCycleBtn">Cancelar</button><button type="submit" class="btn primary large-action">🏪 Confirmar retorno e fechar ciclo</button></div>
      </form>
    `,'RETORNO À LOJA');
    $('#cancelCloseCycleBtn').addEventListener('click',closeModal);
    $$('input[name="hasReturnedDeliveries"]').forEach(input=>input.addEventListener('change',()=>{
      $('#returnedDeliveriesPanel')?.classList.toggle('hidden',input.value!=='yes' || !input.checked);
    }));
    $$('[data-return-toggle]').forEach(input=>input.addEventListener('change',()=>{
      const id=input.dataset.returnToggle;
      const card=$(`[data-return-card="${id}"]`);
      card?.classList.toggle('selected',input.checked);
      $$(`[data-return-fields="${id}"] select, [data-return-fields="${id}"] input`).forEach(control=>{control.disabled=!input.checked;});
    }));
    $('#closeCycleForm').addEventListener('submit',async e=>{
      e.preventDefault();
      if(!linked.length){toast('Vincule pelo menos uma entrega antes de fechar o ciclo.','warning');return;}
      const formData=new FormData(e.target);
      const hasReturned=formData.get('hasReturnedDeliveries')==='yes';
      const returnedIds=new Set(formData.getAll('returnedDeliveryIds'));
      if(!hasReturned && unresolved.length){toast(`Existem ${unresolved.length} NF(s) ainda não finalizada(s). Marque “Sim” e informe quais voltaram, ou finalize as entregas antes de fechar o ciclo.`,'warning');return;}
      if(hasReturned && !returnedIds.size){toast('Selecione pelo menos uma NF que voltou sem ser entregue.','warning');return;}
      const missingOutcome=hasReturned?unresolved.filter(d=>!returnedIds.has(d.id)):[];
      if(missingOutcome.length){toast(`Ainda faltam ${missingOutcome.length} NF(s) sem resultado. Marque as que voltaram ou finalize-as antes de fechar o ciclo.`,'warning');return;}
      for(const id of returnedIds){
        if(!formData.get(`returnReason_${id}`)){toast('Informe o motivo de cada entrega que voltou.','warning');return;}
      }
      const returnTime=String(formData.get('returnTime')||'');
      c.returnTime=returnTime;c.returnedDeliveryCount=previouslyReturned+returnedIds.size;c.updatedAt=nowISO();
      const track=ensureRouteTrack(c);
      if(activeRouteCycleId===c.id)clearLocalRouteWatcher();
      track.status='completed';track.endedAt=`${c.date}T${returnTime}:00`;track.updatedAt=nowISO();
      linked.forEach(d=>{
        d.returnTime=returnTime;d.updatedAt=nowISO();d.history||=[];
        if(returnedIds.has(d.id)){
          d.returnedUndelivered=true;d.returnReasonId=String(formData.get(`returnReason_${d.id}`)||'');d.returnReasonText=String(formData.get(`returnReasonText_${d.id}`)||'').trim();d.reasonId=d.returnReasonId;d.reasonText=d.returnReasonText;d.status='Devolvida';d.nextAction=d.nextAction||'Definir próxima ação';
          d.history.push({id:uid('evt'),type:'delivery_returned_undelivered',at:nowISO(),time:returnTime,cycleId:c.id,reasonId:d.returnReasonId,reasonText:d.returnReasonText});
        } else if(d.finalizationTime && d.status!=='Devolvida') d.status='Finalizada';
        d.history.push({id:uid('evt'),type:'returned_to_store',at:nowISO(),time:returnTime,cycleId:c.id});
      });
      await saveState(`Ciclo ${c.code} fechado no retorno à loja • ${returnedIds.size} entrega(s) voltaram`);closeModal();toast(`Ciclo ${c.code} fechado: ${deliveredCount} entregue(s) e ${previouslyReturned+returnedIds.size} devolvida(s).`,'success');render();
    });
  }

  function quickReschedule(id) {
    const d=state.deliveries.find(x=>x.id===id);if(!d)return;
    openModal('Reagendar entrega','Escolha a nova data. O histórico anterior será preservado e não haverá novo faturamento.',`
      <form id="quickRescheduleForm" class="quick-action-form">
        <div class="quick-action-summary"><strong>Nº do cupom ${esc(d.coupon||'—')}</strong><small>Taxa original ${money(rootDelivery(d)?.fee||d.fee)} • não será duplicada</small></div>
        <div class="form-grid">
          <label>Nova data<input name="scheduledDate" type="date" min="${todayISO()}" required /></label>
          <label>Novo horário<input name="scheduledTime" type="time" value="${d.scheduledTime || ''}" required /></label>
          <label>Motivo<select name="reasonId">${options(state.reasons,d.reasonId)}</select></label>
          <label>Próxima ação<input name="nextAction" value="${attr(d.nextAction||'Reentregar na nova data')}" /></label>
          <label class="span-2">Detalhes do agendamento<textarea name="scheduleNotes" placeholder="Ex.: Ligar antes, entregar na portaria">${esc(d.scheduleNotes || '')}</textarea></label>
          <label class="span-2">Observação<input name="reasonText" placeholder="Opcional" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelRescheduleBtn">Cancelar</button><button type="submit" class="btn primary large-action">Confirmar reagendamento</button></div>
      </form>
    `,'AÇÃO RÁPIDA');
    $('#cancelRescheduleBtn').addEventListener('click',closeModal);
    $('#quickRescheduleForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());
      const oldDate=d.scheduledDate||d.date,oldTime=d.scheduledTime||'';d.scheduledDate=data.scheduledDate;d.scheduledTime=data.scheduledTime;d.scheduleNotes=String(data.scheduleNotes||'').trim();d.scheduleKind='Reagendada';d.status='Reagendada';d.reasonId=data.reasonId||'';d.reasonText=data.reasonText||'';d.nextAction=data.nextAction||'';d.updatedAt=nowISO();d.history||=[];d.history.push({id:uid('evt'),type:'schedule_change',from:oldDate,fromTime:oldTime,to:d.scheduledDate,scheduledTime:d.scheduledTime,scheduleNotes:d.scheduleNotes,kind:'Reagendada',at:nowISO(),reasonId:d.reasonId,reasonText:d.reasonText});
      await saveState(`Entrega ${d.coupon} reagendada`);closeModal();toast(`Entrega reagendada para ${scheduledDateTimeLabel(d)}. O faturamento não foi duplicado.`,'success');render();
    });
  }

  function quickPickup(id) {
    const d=state.deliveries.find(x=>x.id===id);if(!d)return;const root=rootDelivery(d);const fee=Number(root?.fee||0);
    openModal('Cliente retirou na loja','Registre se houve ou não reembolso da taxa de entrega.',`
      <form id="quickPickupForm" class="quick-action-form">
        <div class="quick-action-summary"><strong>Nº do cupom ${esc(d.coupon||'—')}</strong><small>Taxa cobrada no registro: ${money(fee)}</small></div>
        <div class="quick-entry-block">
          <div class="quick-entry-title"><span>↩</span><div><strong>Houve reembolso da taxa?</strong><small>O faturamento bruto permanece rastreável e o reembolso é registrado separadamente.</small></div></div>
          <input type="hidden" name="refundMode" id="refundMode" value="none" />
          <div class="choice-buttons" id="refundChoices">
            <button type="button" class="choice-btn selected" data-value="none">Não houve reembolso</button>
            <button type="button" class="choice-btn" data-value="full">Reembolso total (${money(fee)})</button>
            <button type="button" class="choice-btn" data-value="custom">Outro valor</button>
          </div>
          <label id="customRefundWrap" class="quick-schedule-date hidden">Valor do reembolso<input name="customRefund" type="number" min="0" max="${fee}" step="0.01" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelPickupBtn">Cancelar</button><button type="submit" class="btn primary large-action">Confirmar retirada</button></div>
      </form>
    `,'AÇÃO RÁPIDA');
    const buttons=$$('#refundChoices .choice-btn');buttons.forEach(btn=>btn.addEventListener('click',()=>{buttons.forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');$('#refundMode').value=btn.dataset.value;$('#customRefundWrap').classList.toggle('hidden',btn.dataset.value!=='custom');}));
    $('#cancelPickupBtn').addEventListener('click',closeModal);
    $('#quickPickupForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());let amount=0;if(data.refundMode==='full')amount=fee;if(data.refundMode==='custom')amount=Number(data.customRefund||0);
      root.refundAmount=amount;root.refundDate=amount>0?todayISO():'';root.withdrawalDate=todayISO();root.withdrawalTime=currentTimeHM();
      d.status='Retirada na loja';d.returnTime='';d.updatedAt=nowISO();d.history||=[];d.history.push({id:uid('evt'),type:'store_pickup',at:nowISO(),refundAmount:amount});
      await saveState(`Retirada na loja do nº do cupom ${d.coupon} registrada`);closeModal();toast(amount>0?`Retirada registrada com reembolso de ${money(amount)}.`:'Retirada registrada sem reembolso.','success');render();
    });
  }

  function quickDevolution(id) {
    const d=state.deliveries.find(x=>x.id===id);if(!d)return;
    openModal('Registrar devolução','Informe o motivo e, se já souber, uma nova data para reentrega.',`
      <form id="quickDevolutionForm" class="quick-action-form">
        <div class="form-grid">
          <label>Motivo<select name="reasonId" required>${options(state.reasons,d.reasonId)}</select></label>
          <label>Nova data (opcional)<input name="scheduledDate" type="date" min="${todayISO()}" /></label>
          <label>Horário previsto<input name="scheduledTime" type="time" /></label>
          <label>Próxima ação<input name="nextAction" placeholder="Ex.: Aguardar contato do cliente" /></label>
          <label class="span-2">Detalhes do novo agendamento<textarea name="scheduleNotes" placeholder="Opcional"></textarea></label>
          <label class="span-2">Observação<input name="reasonText" placeholder="Opcional" /></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelDevolutionBtn">Cancelar</button><button type="submit" class="btn primary large-action">Salvar devolução</button></div>
      </form>
    `,'AÇÃO RÁPIDA');
    $('#cancelDevolutionBtn').addEventListener('click',closeModal);
    $('#quickDevolutionForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());
      if(data.scheduledDate && !data.scheduledTime){toast('Informe o horário previsto do novo agendamento.','warning');return;}
      d.reasonId=data.reasonId;d.reasonText=data.reasonText||'';d.nextAction=data.nextAction||'';d.scheduledDate=data.scheduledDate||'';d.scheduledTime=data.scheduledDate?(data.scheduledTime||''):'';d.scheduleNotes=data.scheduledDate?String(data.scheduleNotes||'').trim():'';d.scheduleKind=data.scheduledDate?'Reagendada':d.scheduleKind;d.status=data.scheduledDate?'Reagendada':'Devolvida';d.returnedUndelivered=!data.scheduledDate;d.returnReasonId=!data.scheduledDate?d.reasonId:'';d.returnReasonText=!data.scheduledDate?d.reasonText:'';d.returnTime=d.returnTime||currentTimeHM();d.updatedAt=nowISO();d.history||=[];d.history.push({id:uid('evt'),type:'devolution',at:nowISO(),reasonId:d.reasonId,scheduledDate:d.scheduledDate,scheduledTime:d.scheduledTime,scheduleNotes:d.scheduleNotes});
      await saveState(`Devolução do nº do cupom ${d.coupon} registrada`);closeModal();toast(d.scheduledDate?`Devolvida e reagendada para ${scheduledDateTimeLabel(d)}.`:'Devolução registrada.','success');render();
    });
  }

  async function startScheduledDelivery(id) {
    const source = scoped(state.deliveries).find(d=>d.id===id);
    if (!source || !source.scheduledDate) return;
    const existingChild = childDeliveries(source.id)[0];
    if (existingChild) { openDeliveryModal(existingChild.id); return; }
    const child = {
      id:uid('del'), rootId:source.rootId || source.id, parentId:source.id, attemptNo:Number(source.attemptNo||1)+1,
      date:source.scheduledDate, orderNo:source.orderNo, coupon:source.coupon, docNo:source.docNo || '', cashierNo:source.cashierNo || '', customerName:uppercaseName(source.customerName), customerPhone:formatPhoneBR(source.customerPhone), purchaseTime:'', neighborhoodId:source.neighborhoodId,
      address:source.address || '', addressNumber:source.addressNumber || '', addressComplement:source.addressComplement || '', addressReference:source.addressReference || '', priority:Boolean(source.priority), fee:source.fee,
      driverId:source.driverId || '', vehicleId:'', cycleId:'', departureTime:'', finalizationTime:'', returnTime:'', status:'Na loja',
      scheduledDate:'', scheduledTime:source.scheduledTime || '', scheduleNotes:source.scheduleNotes || '', scheduleKind:'Reagendada', reasonId:'', reasonText:'', nextAction:'', notes:`Continuação automática da entrega agendada para ${scheduledDateTimeLabel(source)} e originada em ${dateBR(source.date)}.`,returnedUndelivered:false,returnReasonId:'',returnReasonText:'',
      refundAmount:0,refundDate:'',withdrawalDate:'',withdrawalTime:'',createdAt:nowISO(),updatedAt:nowISO(),history:[{id:uid('evt'),type:'continued_from',fromId:source.id,at:nowISO()}],mode:currentMode()
    };
    source.history ||= [];
    source.history.push({id:uid('evt'),type:'continued_to',toId:child.id,at:nowISO()});
    state.deliveries.push(child);
    await saveState(`Atendimento programado do nº do cupom ${source.coupon} iniciado`);
    toast(`Atendimento criado para a agenda de ${scheduledDateTimeLabel(source)}.`,'success');
    openDeliveryModal(child.id);
  }

  function openCycleModal(id='') {
    const existing=id?scoped(state.cycles).find(c=>c.id===id):null;
    if(!existing){ openCycleDepartureModal(); return; }
    const c={...existing};
    openModal('Ajustar ciclo','Edição avançada. O fluxo normal deve ser feito por Montar saída e Registrar retorno.',`
      <form id="cycleForm">
        <div class="cycle-definition-box"><span>↻</span><div><strong>1 ciclo = uma saída até um retorno</strong><small>Não existe KM inicial/final aqui. A quilometragem é registrada uma vez por veículo no início e no fim do expediente.</small></div></div>
        <div class="form-grid">
          <label>Código<input name="code" value="${attr(c.code)}" required /></label>
          <label>Data<input name="date" type="date" value="${c.date}" required /></label>
          <label>Veículo<select name="vehicleId">${options(state.vehicles,c.vehicleId)}</select></label>
          <label>Entregador<select name="driverId">${options(state.employees.filter(x=>x.role==='Entregador'||x.role==='Colaborador'),c.driverId)}</select></label>
          <label>Saída<input name="departureTime" type="time" value="${c.departureTime||''}" /></label>
          <label>Retorno<input name="returnTime" type="time" value="${c.returnTime||''}" /></label>
          <label class="full">Observações<textarea name="notes">${esc(c.notes||'')}</textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelCycleBtn">Cancelar</button><button type="button" class="btn danger" id="deleteCycleBtn">Apagar ciclo</button><button type="submit" class="btn primary">Salvar ajuste</button></div>
      </form>
    `,'AJUSTE AVANÇADO');
    $('#cancelCycleBtn').addEventListener('click',closeModal); $('#deleteCycleBtn').addEventListener('click',()=>deleteRecord('cycle',c.id));
    $('#cycleForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());
      data.id=c.id;data.createdAt=c.createdAt||nowISO();data.updatedAt=nowISO();data.mode=existing.mode||currentMode();Object.assign(existing,data);
      await saveState(`Ciclo ${data.code} ajustado`);closeModal();toast('Ciclo ajustado.','success');render();
    });
  }
  function openOdometerModal(id='', presetVehicleId='') {
    const existing = id ? scoped(state.odometerLogs).find(o=>o.id===id) : null;
    const o = existing ? {...existing} : {id:uid('odo'),date:todayISO(),vehicleId:presetVehicleId||'',kmStart:'',kmEnd:'',notes:'',createdAt:nowISO(),updatedAt:nowISO(),mode:currentMode()};
    openModal(existing?'Atualizar KM diário':'Registrar KM diário','Informe o KM inicial no começo do dia e complete o KM final no encerramento. O sistema calcula todas as médias automaticamente.',`
      <form id="odometerForm">
        <div class="odometer-form-intro"><span>KM</span><div><strong>Um único fechamento por veículo e por dia</strong><small>Não informe KM em cada ciclo. O app usa o total diário para calcular KM por ciclo e por entrega.</small></div></div>
        <div class="form-grid">
          <label>Data<input name="date" type="date" value="${o.date}" required /></label>
          <label>Veículo<select name="vehicleId" required>${options(state.vehicles,o.vehicleId)}</select></label>
          <label>KM inicial<input name="kmStart" type="number" step="0.1" min="0" value="${o.kmStart||''}" required /></label>
          <label>KM final<input name="kmEnd" type="number" step="0.1" min="0" value="${o.kmEnd||''}" placeholder="Preencha no fim do dia" /></label>
          <label class="full">Observações<textarea name="notes">${esc(o.notes||'')}</textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelOdometerBtn">Cancelar</button>${existing?`<button type="button" class="btn danger" id="deleteOdometerBtn">Apagar KM</button>`:""}<button type="submit" class="btn primary">Salvar KM</button></div>
      </form>
    `,'QUILOMETRAGEM DA FROTA');
    $('#cancelOdometerBtn').addEventListener('click',closeModal); if(existing) $('#deleteOdometerBtn').addEventListener('click',()=>deleteRecord('odometer',o.id));
    $('#odometerForm').addEventListener('submit',async e=>{
      e.preventDefault();
      const data=Object.fromEntries(new FormData(e.target).entries());
      data.kmStart=Number(data.kmStart||0);data.kmEnd=Number(data.kmEnd||0);
      if(data.kmEnd && data.kmEnd < data.kmStart){toast('O KM final não pode ser menor que o KM inicial.','error');return;}
      const duplicate=scoped(state.odometerLogs).find(x=>x.date===data.date && x.vehicleId===data.vehicleId && x.id!==o.id);
      if(duplicate){toast('Já existe um registro de KM para esse veículo nessa data. Abra o existente e atualize.','warning');return;}
      data.id=o.id;data.createdAt=o.createdAt||nowISO();data.updatedAt=nowISO();data.mode=existing?.mode||currentMode();
      if(existing) Object.assign(existing,data); else state.odometerLogs.push(data);
      await saveState(`KM diário de ${vehicle(data.vehicleId)?.name||'veículo'} salvo`);
      closeModal();toast(data.kmEnd?'Quilometragem diária fechada.':'KM inicial registrado. Complete o KM final no fim do dia.','success');render();
    });
  }

  function openCostModal(id='') {
    const existing=id?scoped(state.costs).find(c=>c.id===id):null;
    const fuelCat=state.costCategories.find(c=>c.name==='Combustível');
    const c=existing?{...existing}:{id:uid('cost'),date:todayISO(),time:'',vehicleId:'',categoryId:fuelCat?.id||'',description:'',value:0,km:0,supplier:'',receiptNo:'',responsibleId:'',notes:'',createdAt:nowISO(),updatedAt:nowISO(),mode:currentMode()};
    openModal(existing?'Editar custo':'Registrar custo','Todo gasto fica disponível nos relatórios por dia, semana, mês, ano e veículo.',`
      <form id="costForm">
        <div class="form-grid">
          <label>Data<input name="date" type="date" value="${c.date}" required /></label>
          <label>Hora<input name="time" type="time" value="${c.time||''}" /></label>
          <label>Veículo<select name="vehicleId">${options(state.vehicles,c.vehicleId)}</select></label>
          <label>Categoria<select name="categoryId">${options(state.costCategories,c.categoryId)}</select></label>
          <label>Valor<input name="value" type="number" step="0.01" min="0" value="${Number(c.value||0)||''}" required /></label>
          <label>KM atual<input name="km" type="number" step="0.1" min="0" value="${Number(c.km||0)||''}" /></label>
          <label class="span-2">Descrição<input name="description" value="${attr(c.description||'')}" required placeholder="Ex.: Abastecimento de gasolina" /></label>
          <label>Fornecedor<input name="supplier" value="${attr(c.supplier||'')}" /></label>
          <label>Nº nota/comprovante<input name="receiptNo" value="${attr(c.receiptNo||'')}" /></label>
          <label>Responsável<select name="responsibleId">${options(state.employees,c.responsibleId)}</select></label>
          <label class="span-3">Observações<textarea name="notes">${esc(c.notes||'')}</textarea></label>
        </div>
        <div class="form-actions"><button type="button" class="btn secondary" id="cancelCostBtn">Cancelar</button>${existing?`<button type="button" class="btn danger" id="deleteCostBtn">Apagar custo</button>`:""}<button type="submit" class="btn primary">Salvar custo</button></div>
      </form>
    `);
    $('#cancelCostBtn').addEventListener('click',closeModal); if(existing) $('#deleteCostBtn').addEventListener('click',()=>deleteRecord('cost',c.id));
    $('#costForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());
      data.id=c.id;data.value=Number(data.value||0);data.km=Number(data.km||0);data.createdAt=c.createdAt||nowISO();data.updatedAt=nowISO();data.mode=existing?.mode||currentMode();
      if(existing) Object.assign(existing,data); else state.costs.push(data);
      await saveState(`Custo ${data.description} salvo`);closeModal();toast('Custo salvo.','success');render();
    });
  }

  function openConfigModal(id='') {
    const arr=state[configTab];
    const existing=id?arr.find(x=>x.id===id):null;
    const item=existing?{...existing}:{id:uid(configTab.slice(0,3)),name:'',active:true};
    let extra='';
    if(configTab==='vehicles') extra=`<label>Placa<input name="plate" value="${attr(item.plate||'')}" /></label><label>Tipo<input name="type" value="${attr(item.type||'')}" placeholder="Moto, utilitário..." /></label>`;
    if(configTab==='neighborhoods') extra=`<label>Região<input name="region" value="${attr(item.region||'')}" placeholder="Opcional" /></label><label>Ordem no roteiro<input name="routeOrder" type="number" min="1" step="1" value="${Number(item.routeOrder||state.neighborhoods.length+1)}" required /><small>Menor número vem primeiro, depois das prioridades.</small></label><label class="span-2">Busca específica no Google Maps <small>(opcional)</small><input name="mapQuery" value="${attr(item.mapQuery||'')}" placeholder="Ex.: BAIRRO CENTRO, NOVA XAVANTINA - MT" /></label>`;
    if(configTab==='employees') extra=`<label>Função<select name="role">${['Entregador','Conferente','Gestor','Prevenção','Colaborador'].map(r=>`<option value="${r}" ${item.role===r?'selected':''}>${r}</option>`).join('')}</select></label>`;
    openModal(existing?'Editar cadastro':'Novo cadastro','Você pode desativar um cadastro sem perder o histórico.',`
      <form id="configForm"><div class="form-grid"><label>Nome<input name="name" value="${attr(item.name||'')}" ${configTab==='neighborhoods'?'data-uppercase-name':''} required /></label>${extra}</div><div class="form-actions"><button type="button" class="btn secondary" id="cancelConfigBtn">Cancelar</button><button type="submit" class="btn primary">Salvar</button></div></form>
    `,'CADASTRO MESTRE');
    $('#cancelConfigBtn').addEventListener('click',closeModal);
    $('#configForm').addEventListener('submit',async e=>{
      e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());
      if(configTab==='neighborhoods') {
        data.name=uppercaseName(data.name);
        data.routeOrder=Number(data.routeOrder||state.neighborhoods.length+1);
        data.mapQuery=String(data.mapQuery||'').trim();
      }
      data.id=item.id;data.active=item.active??true;data.createdAt=item.createdAt||nowISO();
      if(existing) Object.assign(existing,data); else arr.push(data);
      await saveState(`${configTab}: ${data.name} salvo`);closeModal();toast('Cadastro salvo.','success');renderSettings();
    });
  }

  async function toggleConfig(id) {
    const item=state[configTab].find(x=>x.id===id);if(!item)return;
    item.active=!item.active;await saveState(`${item.name} ${item.active?'reativado':'desativado'}`);toast(item.active?'Cadastro reativado.':'Cadastro desativado.','success');renderSettings();
  }

  async function saveRules() {
    state.settings.workStart=$('#ruleWorkStart').value;
    state.settings.lunchStart=$('#ruleLunchStart').value;
    state.settings.lunchEnd=$('#ruleLunchEnd').value;
    state.settings.workEnd=$('#ruleWorkEnd').value;
    state.settings.delayMinutes=Number($('#ruleDelay').value||120);
    state.settings.completionLimitMinutes=Number($('#ruleCompletionLimit').value||210);
    state.settings.routeOrigin=String($('#ruleRouteOrigin').value||'').trim() || 'Nilo Supermercado, Nova Xavantina - MT';
    state.settings.routeCity=String($('#ruleRouteCity').value||'').trim() || 'Nova Xavantina - MT';
    await saveState('Regras operacionais atualizadas');toast('Regras salvas.','success');renderSettings();
  }

  function buildCostCategoryRows(costs) {
    return state.costCategories.map(c=>({label:c.name,value:sum(costs.filter(x=>x.categoryId===c.id).map(x=>x.value))})).filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
  }
  function groupSumByDate(list, field) {
    const map={}; list.forEach(x=>map[x.date]=(map[x.date]||0)+Number(x[field]||0));
    return Object.entries(map).sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({label:dateBR(date).slice(0,5),value}));
  }

  /* Native SVG charts: no external library, so the dashboard also works offline. */
  function lineChartHTML(data, color='#2E73B9') {
    if(!data.length) return emptyState('▥','Sem dados para o gráfico','Registre dados no período selecionado.');
    const w=760,h=230,p=32,max=Math.max(...data.map(x=>Number(x.value||0)),1);
    const step=data.length>1?(w-p*2)/(data.length-1):0;
    const points=data.map((d,i)=>({x:p+i*step,y:h-p-(Number(d.value||0)/max)*(h-p*2),...d}));
    const poly=points.map(p=>`${p.x},${p.y}`).join(' ');
    const labels=points.filter((_,i)=>data.length<=10||i%Math.ceil(data.length/8)===0||i===data.length-1).map(p=>`<text x="${p.x}" y="${h-7}" text-anchor="middle" font-size="9" fill="#7A8C98">${esc(p.label)}</text>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" role="img"><line x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}" stroke="#E5ECEF"/><polyline fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${poly}"/>${points.map(pt=>`<circle cx="${pt.x}" cy="${pt.y}" r="4" fill="#fff" stroke="${color}" stroke-width="2"><title>${esc(pt.label)}: ${number(pt.value,2)}</title></circle>`).join('')}${labels}</svg>`;
  }

  function horizontalBarChartHTML(data,color='#2E73B9') {
    if(!data.length) return emptyState('◎','Sem dados para o gráfico','Registre entregas com bairros.');
    const max=Math.max(...data.map(x=>Number(x.value||0)),1);
    return `<div style="display:grid;gap:9px;height:100%;align-content:center">${data.map(row=>`<div style="display:grid;grid-template-columns:minmax(85px,145px) 1fr 42px;gap:8px;align-items:center"><span style="font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${attr(row.label)}">${esc(row.label)}</span><div style="height:10px;background:#EEF3F6;border-radius:99px;overflow:hidden"><div style="height:100%;width:${clamp(Number(row.value||0)/max*100,0,100)}%;background:${color};border-radius:99px"></div></div><strong style="font-size:10px;text-align:right">${number(row.value)}</strong></div>`).join('')}</div>`;
  }

  function groupedBarChartHTML(data,labelA='A',labelB='B') {
    if(!data.length) return emptyState('R$','Sem dados para o gráfico','Registre movimentações no período.');
    const max=Math.max(...data.flatMap(x=>[Number(x.a||0),Number(x.b||0)]),1);
    return `<div style="height:100%;display:flex;flex-direction:column"><div style="display:flex;gap:14px;font-size:9px;color:#71808C;margin-bottom:8px"><span><i style="display:inline-block;width:9px;height:9px;background:#2E73B9;border-radius:3px"></i> ${esc(labelA)}</span><span><i style="display:inline-block;width:9px;height:9px;background:#D95C5C;border-radius:3px"></i> ${esc(labelB)}</span></div><div style="display:flex;align-items:flex-end;gap:10px;flex:1;border-bottom:1px solid #E5ECEF;padding:6px 4px 0">${data.map(row=>`<div style="flex:1;min-width:42px;display:flex;align-items:flex-end;justify-content:center;gap:4px;height:100%;position:relative"><div title="${labelA}: ${money(row.a)}" style="width:30%;height:${clamp(row.a/max*100,1,100)}%;background:#2E73B9;border-radius:5px 5px 0 0"></div><div title="${labelB}: ${money(row.b)}" style="width:30%;height:${clamp(row.b/max*100,1,100)}%;background:#D95C5C;border-radius:5px 5px 0 0"></div><span style="position:absolute;bottom:-19px;font-size:8px;color:#7A8C98;white-space:nowrap">${esc(row.label)}</span></div>`).join('')}</div><div style="height:22px"></div></div>`;
  }

  function slaPerformanceChartHTML(rows) {
    if(!rows.some(row=>row.total)) return emptyState('◷','Prazos ainda não calculáveis','Informe os horários de compra, saída e finalização para gerar os percentuais.');
    return `<div class="sla-chart">${rows.map(row=>{
      const withinPct=percentage(row.within,row.total),outsidePct=percentage(row.outside,row.total);
      const tone=row.rate>=90?'good':row.rate>=75?'attention':'critical';
      return `<div class="sla-chart-row ${tone}">
        <div class="sla-chart-head"><div><strong>${esc(row.label)}</strong><small>${esc(row.limit)} • ${row.total} registro(s) calculável(is)</small></div><b>${percent(row.rate)}</b></div>
        <div class="sla-chart-track"><span class="within" style="width:${clamp(withinPct,0,100)}%" title="Dentro do padrão: ${row.within}"></span><span class="outside" style="width:${clamp(outsidePct,0,100)}%" title="Fora do padrão: ${row.outside}"></span></div>
        <div class="sla-chart-legend"><span><i class="within"></i>${row.within} dentro</span><span><i class="outside"></i>${row.outside} fora</span></div>
      </div>`;
    }).join('')}</div>`;
  }

  function operationalFlowChartHTML(rows,waitingDeparture=0) {
    const max=Math.max(...rows.map(row=>Number(row.value||0)),1);
    if(!rows.some(row=>row.value)) return emptyState('⇢','Sem fluxo no período','Registre compras e movimentações para visualizar a conversão operacional.');
    return `<div class="flow-chart">${rows.map((row,index)=>{
      const rate=index===0?100:percentage(row.value,rows[0].value);
      return `<div class="flow-stage"><div class="flow-copy"><span>${index+1}</span><div><strong>${esc(row.label)}</strong><small>${index===0?'Base do período':`${percent(rate)} das compras`}</small></div><b>${number(row.value)}</b></div><div class="flow-track"><i style="width:${clamp(Number(row.value||0)/max*100,0,100)}%"></i></div></div>`;
    }).join('')}<div class="flow-alert ${waitingDeparture?'attention':'ok'}"><span>${waitingDeparture?'!':'✓'}</span><div><strong>${waitingDeparture} aguardando saída</strong><small>${waitingDeparture?'Precisam de movimentação operacional.':'Nenhuma compra parada aguardando saída.'}</small></div></div></div>`;
  }

  function statusDistributionChartHTML(rows) {
    if(!rows.length) return emptyState('◉','Sem status no período','Os registros aparecerão aqui automaticamente.');
    const total=sum(rows.map(row=>row.value));
    const colors=['#F2B523','#5DA579','#56A6D8','#D06B70','#8D7BD0','#7FA2B4','#B4C1C7','#D19655'];
    let offset=0;
    const segments=rows.map((row,index)=>{const share=percentage(row.value,total),start=offset;offset+=share;return `${colors[index%colors.length]} ${start}% ${offset}%`;});
    return `<div class="dashboard-donut"><div class="dashboard-donut-ring" style="background:conic-gradient(${segments.join(',')})"><div><strong>${number(total)}</strong><small>registros</small></div></div><div class="dashboard-donut-legend">${rows.map((row,index)=>`<div><span><i style="background:${colors[index%colors.length]}"></i>${esc(row.label)}</span><strong>${row.value} <small>${percent(percentage(row.value,total))}</small></strong></div>`).join('')}</div></div>`;
  }

  function dashboardCostChartHTML(rows) {
    if(!rows.length) return emptyState('R$','Sem custos no período','Registre custos para visualizar a distribuição por categoria.');
    const total=sum(rows.map(row=>row.value));
    const colors=['#F2B523','#56A6D8','#D06B70','#5DA579','#8D7BD0','#D19655','#7FA2B4'];
    let offset=0;
    const segments=rows.map((row,index)=>{const share=percentage(row.value,total),start=offset;offset+=share;return `${colors[index%colors.length]} ${start}% ${offset}%`;});
    return `<div class="dashboard-donut"><div class="dashboard-donut-ring" style="background:conic-gradient(${segments.join(',')})"><div><strong>${money(total)}</strong><small>custos</small></div></div><div class="dashboard-donut-legend">${rows.slice(0,7).map((row,index)=>`<div><span><i style="background:${colors[index%colors.length]}"></i>${esc(row.label)}</span><strong>${money(row.value)} <small>${percent(percentage(row.value,total))}</small></strong></div>`).join('')}</div></div>`;
  }

  function donutChartHTML(rows) {
    if(!rows.length) return emptyState('◉','Sem custos no período','Registre custos para visualizar a distribuição.');
    const total=sum(rows.map(r=>r.value));
    const colors=['#2E73B9','#2EA8A1','#E9A93C','#D95C5C','#7A67C7','#6B8A9B','#9CB5C1'];
    let offset=0;
    const segments=rows.map((r,i)=>{const pct=r.value/total*100;const start=offset;offset+=pct;return `${colors[i%colors.length]} ${start}% ${offset}%`;});
    return `<div style="height:100%;display:grid;grid-template-columns:180px 1fr;align-items:center;gap:16px"><div style="width:165px;height:165px;border-radius:50%;background:conic-gradient(${segments.join(',')});position:relative;margin:auto"><div style="position:absolute;inset:28px;background:#fff;border-radius:50%;display:grid;place-items:center;text-align:center"><div><strong style="font-size:15px">${money(total)}</strong><div style="font-size:9px;color:#71808C">total</div></div></div></div><div class="stat-list">${rows.slice(0,7).map((r,i)=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10px"><span style="display:flex;align-items:center;gap:6px"><i style="width:8px;height:8px;border-radius:3px;background:${colors[i%colors.length]}"></i>${esc(r.label)}</span><strong>${money(r.value)}</strong></div>`).join('')}</div></div>`;
  }

  function problemNeighborhoodChartHTML(rows) {
    if(!rows.length) return emptyState('!','Sem problemas registrados','As ocorrências aparecerão aqui automaticamente.');
    const max=Math.max(...rows.map(r=>r.problemCount),1);
    return `<div style="display:grid;gap:8px;height:100%;align-content:center">${rows.map(r=>`<div><div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:4px"><strong>${esc(r.name)}</strong><span>${r.problemCount} ocorrências</span></div><div style="display:flex;height:11px;border-radius:99px;overflow:hidden;background:#EFF3F5"><span title="Endereço errado: ${r.wrongAddress}" style="width:${r.wrongAddress/max*100}%;background:#D95C5C"></span><span title="Reagendadas: ${r.rescheduled}" style="width:${r.rescheduled/max*100}%;background:#E9A93C"></span><span title="Devoluções: ${r.devolutions}" style="width:${r.devolutions/max*100}%;background:#7A67C7"></span><span title="Atrasadas: ${r.delayed}" style="width:${r.delayed/max*100}%;background:#2E73B9"></span></div></div>`).join('')}<div style="display:flex;gap:12px;font-size:8px;color:#71808C;margin-top:4px"><span>■ End. errado</span><span>■ Reagendada</span><span>■ Devolução</span><span>■ Atraso</span></div></div>`;
  }

  function percentage(part,total) { return total ? Number(part || 0) / total * 100 : 0; }
  function variationPercent(current,previous) { return Number(previous) ? (Number(current || 0) - Number(previous)) / Math.abs(Number(previous)) * 100 : ''; }
  function formattedReportValue(label,value,digits=1) {
    if(value==='' || value===null || value===undefined) return '—';
    if(typeof value!=='number' || !Number.isFinite(value)) return esc(value);
    const normalized=String(label||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    if(/%|percentual/.test(normalized)) return percent(value,digits);
    if(/r\$|faturamento|reembols|receita|custos?$|saldo|^valor$|taxa cobrada|taxa registrada|taxa media|taxas vinculadas|custo por/.test(normalized)) return money(value);
    if(/\bmin\b|em minutos|tempo min/.test(normalized)) return fmtMinutes(value);
    if(/\bkm\b|quilometragem/.test(normalized)) return `${number(value,1)} km`;
    return number(value,Number.isInteger(value)?0:digits);
  }
  function reportDate(value) {
    const date=new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function previousReportRange(range) {
    const start=reportDate(range.start), end=reportDate(range.end);
    if(!start || !end || end<start) return null;
    const days=Math.round((end-start)/86400000)+1;
    if(days<1 || days>3660) return null;
    const previousEnd=new Date(start); previousEnd.setDate(previousEnd.getDate()-1);
    const previousStart=new Date(previousEnd); previousStart.setDate(previousStart.getDate()-(days-1));
    return {start:localDateISO(previousStart),end:localDateISO(previousEnd),label:`${dateBR(localDateISO(previousStart))} a ${dateBR(localDateISO(previousEnd))}`};
  }
  function groupItems(items,keyFn) {
    const groups=new Map();
    items.forEach(item=>{const key=keyFn(item);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
    return groups;
  }
  function recordHasProblem(d) {
    return ['Devolvida','Reagendada','Cancelada'].includes(d.status) || d.scheduleKind==='Reagendada' || Boolean(d.reasonId || d.reasonText);
  }
  function chainForRoot(root,records) { const id=root?.rootId || root?.id; return records.filter(d=>(d.rootId || d.id)===id); }
  function rootWasFinalized(root,records) { return chainForRoot(root,records).some(deliveredToCustomer); }
  function rootHadProblem(root,records) { return chainForRoot(root,records).some(recordHasProblem); }
  function rootWasDelayed(root,records) { return chainForRoot(root,records).some(d=>deliveryCalc(d).delayed); }
  function normalizedCustomerKey(d) {
    const phone=String(d.customerPhone || '').replace(/\D/g,'');
    if(phone.length>=8) return `tel:${phone}`;
    const name=String(d.customerName || '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return name ? `nome:${name}` : '';
  }
  function mostCommon(values,fallback='—') {
    const valid=values.filter(Boolean); if(!valid.length)return fallback;
    const groups=groupItems(valid,x=>x);
    return [...groups.entries()].sort((a,b)=>b[1].length-a[1].length||String(a[0]).localeCompare(String(b[0])))[0][0];
  }
  function sequenceGaps(values,limit=50) {
    const numbers=unique(values.map(Number).filter(Number.isInteger).filter(n=>n>=0)).sort((a,b)=>a-b), gaps=[];
    for(let i=1;i<numbers.length && gaps.length<limit;i++) {
      const difference=numbers[i]-numbers[i-1];
      if(difference<=1 || difference>100)continue;
      for(let value=numbers[i-1]+1;value<numbers[i] && gaps.length<limit;value++)gaps.push(value);
    }
    return gaps;
  }
  function buildDeliveryInsights(range, records = scoped(state.deliveries), historicalEnd = '') {
    const dayNames=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    const deliveredRecords=records.filter(isRootPurchase).map(root=>purchaseOutcome(root,records)).filter(outcome=>outcome.delivered).map(outcome=>outcome.record).filter(record=>record?.date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const countByDate=list=>[...groupItems(list,record=>record.date).entries()].map(([date,rows])=>({date,count:rows.length})).sort((a,b)=>b.count-a.count||String(b.date).localeCompare(String(a.date)));
    const reportPeak=countByDate(deliveredRecords.filter(record=>inRange(record.date,range)))[0] || null;
    const historicalSource=historicalEnd?deliveredRecords.filter(record=>record.date<=historicalEnd):deliveredRecords;
    if(!historicalSource.length) return {reportPeak,start:'',end:'',calendarDays:0,deliveredCount:0,weekdayRows:[],weekOfMonthRows:[],peakWeekday:null,peakWeekOfMonth:null};

    const end=historicalSource.at(-1).date;
    const oneYearStartDate=reportDate(end);
    oneYearStartDate.setDate(oneYearStartDate.getDate()-364);
    const oneYearStart=localDateISO(oneYearStartDate);
    const start=historicalSource[0].date>oneYearStart?historicalSource[0].date:oneYearStart;
    const historical=historicalSource.filter(record=>record.date>=start&&record.date<=end);
    const deliveriesByDate=new Map(countByDate(historical).map(row=>[row.date,row.count]));
    const weekdayTotals=Array.from({length:7},()=>({days:0,deliveries:0}));
    const monthWeekSegments=new Map();
    let calendarDays=0;
    const cursor=reportDate(start),last=reportDate(end);
    while(cursor&&last&&cursor<=last){
      const date=localDateISO(cursor),day=cursor.getDay(),week=Math.ceil(cursor.getDate()/7),segmentKey=`${date.slice(0,7)}-${week}`,deliveries=deliveriesByDate.get(date)||0;
      weekdayTotals[day].days+=1;
      weekdayTotals[day].deliveries+=deliveries;
      if(!monthWeekSegments.has(segmentKey))monthWeekSegments.set(segmentKey,{week,days:0,deliveries:0});
      const segment=monthWeekSegments.get(segmentKey);
      segment.days+=1;
      segment.deliveries+=deliveries;
      calendarDays+=1;
      cursor.setDate(cursor.getDate()+1);
    }
    const weekdayRows=weekdayTotals.map((item,index)=>({index,label:dayNames[index],days:item.days,deliveries:item.deliveries,average:item.days?item.deliveries/item.days:0})).filter(row=>row.days);
    const weekOfMonthRows=[1,2,3,4,5].map(week=>{
      const segments=[...monthWeekSegments.values()].filter(segment=>segment.week===week),days=sum(segments.map(segment=>segment.days)),deliveries=sum(segments.map(segment=>segment.deliveries));
      return {week,label:`${week}ª semana`,detail:week<5?`dias ${(week-1)*7+1} a ${week*7}`:'dias 29 ao fim do mês',occurrences:segments.length,days,deliveries,average:days?deliveries/days:0};
    }).filter(row=>row.occurrences);
    const peakWeekday=weekdayRows.slice().sort((a,b)=>b.average-a.average||b.deliveries-a.deliveries)[0]||null;
    const peakWeekOfMonth=weekOfMonthRows.slice().sort((a,b)=>b.average-a.average||b.deliveries-a.deliveries)[0]||null;
    return {reportPeak,start,end,calendarDays,deliveredCount:historical.length,weekdayRows,weekOfMonthRows,peakWeekday,peakWeekOfMonth};
  }
  function buildMovementForecast(records = scoped(state.deliveries), reference = todayISO()) {
    const dayNames=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    const history=buildDeliveryInsights({start:'0000-01-01',end:reference},records,reference);
    const referenceDate=reportDate(reference)||new Date(),daysToNextMonday=((8-referenceDate.getDay())%7)||7,forecastStartDate=new Date(referenceDate);
    forecastStartDate.setDate(forecastStartDate.getDate()+daysToNextMonday);
    const forecastStart=localDateISO(forecastStartDate),forecastEndDate=new Date(forecastStartDate);
    forecastEndDate.setDate(forecastEndDate.getDate()+34);
    const forecastEnd=localDateISO(forecastEndDate);
    const scheduledCounts=new Map([...groupItems(allScheduleSummaries(records).filter(summary=>summary.open).map(summary=>summary.outcome.record).filter(record=>record.scheduledDate>=forecastStart&&record.scheduledDate<=forecastEnd),record=>record.scheduledDate).entries()].map(([date,rows])=>[date,rows.length]));
    const weekdayAverages=new Map(history.weekdayRows.map(row=>[row.index,row.average]));
    const monthWeekAverages=new Map(history.weekOfMonthRows.map(row=>[row.week,row.average]));
    const rows=[];
    for(let index=0;index<35;index++){
      const dateObj=new Date(forecastStartDate);dateObj.setDate(dateObj.getDate()+index);
      const date=localDateISO(dateObj),weekday=dateObj.getDay(),monthWeek=Math.ceil(dateObj.getDate()/7),weekdayAverage=weekdayAverages.get(weekday)||0,monthWeekAverage=monthWeekAverages.get(monthWeek)||0;
      const historicalEstimate=history.deliveredCount?(weekdayAverage*0.65+monthWeekAverage*0.35):0,scheduled=scheduledCounts.get(date)||0,estimate=Math.max(historicalEstimate,scheduled);
      rows.push({date,dayName:dayNames[weekday],weekday,monthWeek,forecastWeek:Math.floor(index/7)+1,historicalEstimate,scheduled,estimate});
    }
    const weeks=[1,2,3,4,5].map(week=>{const days=rows.filter(row=>row.forecastWeek===week);return{week,start:days[0].date,end:days.at(-1).date,estimate:sum(days.map(day=>day.estimate)),scheduled:sum(days.map(day=>day.scheduled)),dailyAverage:avg(days.map(day=>day.estimate))};});
    const weekdayRows=[0,1,2,3,4,5,6].map(weekday=>{const days=rows.filter(row=>row.weekday===weekday);return{weekday,label:dayNames[weekday],estimate:sum(days.map(day=>day.estimate)),average:avg(days.map(day=>day.estimate))};});
    const estimatedTotal=sum(rows.map(row=>row.estimate)),scheduledTotal=sum(rows.map(row=>row.scheduled));
    const peakDay=estimatedTotal?rows.slice().sort((a,b)=>b.estimate-a.estimate||String(a.date).localeCompare(String(b.date)))[0]:null;
    const peakWeek=estimatedTotal?weeks.slice().sort((a,b)=>b.estimate-a.estimate||a.week-b.week)[0]:null;
    const peakWeekday=estimatedTotal?weekdayRows.slice().sort((a,b)=>b.average-a.average||a.weekday-b.weekday)[0]:null;
    const confidence=history.calendarDays>=270&&history.deliveredCount>=100?'Alta':history.calendarDays>=90&&history.deliveredCount>=30?'Média':history.calendarDays>=28&&history.deliveredCount>=10?'Inicial':history.deliveredCount?'Baixa':'Somente agenda';
    return {reference,forecastStart,forecastEnd,history,rows,weeks,weekdayRows,peakDay,peakWeek,peakWeekday,confidence,scheduledTotal,estimatedTotal};
  }
  function periodMetrics(range) {
    const allRecords=scoped(state.deliveries);
    const deliveries=scoped(state.deliveries).filter(d=>inRange(d.date,range));
    const roots=deliveries.filter(isRootPurchase);
    const finalizedPurchases=roots.filter(root=>rootWasFinalized(root,allRecords));
    const costs=scoped(state.costs).filter(c=>inRange(c.date,range));
    const odometers=scoped(state.odometerLogs).filter(o=>inRange(o.date,range));
    const waits=deliveries.map(d=>deliveryCalc(d).wait).filter(v=>v!==null);
    const purchaseToClients=deliveries.map(d=>deliveryCalc(d).purchaseToClient).filter(v=>v!==null);
    const routes=deliveries.map(d=>deliveryCalc(d).route).filter(v=>v!==null);
    const delayed=deliveries.filter(d=>deliveryCalc(d).delayed).length;
    const completionDelayed=deliveries.filter(d=>deliveryCalc(d).completionDelayed).length;
    const departureWithin=waits.length-delayed,completionWithin=purchaseToClients.length-completionDelayed;
    const problems=roots.filter(root=>rootHadProblem(root,allRecords)).length;
    const financial=financialsForRange(range);
    return {
      purchases:roots.length,records:deliveries.length,finalized:finalizedPurchases.length,
      firstAttempt:roots.filter(deliveredToCustomer).length,
      firstAttemptRate:percentage(roots.filter(deliveredToCustomer).length,roots.length),
      departureCalculable:waits.length,departureWithin,departureComplianceRate:percentage(departureWithin,waits.length),delayed,delayRate:percentage(delayed,waits.length),completionCalculable:purchaseToClients.length,completionWithin,completionComplianceRate:percentage(completionWithin,purchaseToClients.length),completionDelayed,completionDelayRate:percentage(completionDelayed,purchaseToClients.length),problems,problemRate:percentage(problems,roots.length),
      avgWait:avg(waits),avgPurchaseToClient:avg(purchaseToClients),avgRoute:avg(routes),gross:financial.gross,refunds:financial.refundTotal,net:financial.net,
      costs:sum(costs.map(c=>c.value)),km:totalKmFromOdometers(odometers)
    };
  }
  function buildReportAnalytics(range) {
    const allRecords=scoped(state.deliveries);
    const deliveries=scoped(state.deliveries).filter(d=>inRange(d.date,range));
    const roots=deliveries.filter(isRootPurchase);
    const scheduleSummaries=roots.map(root=>scheduleSummary(root,allRecords)).filter(Boolean);
    const deliveryInsights=buildDeliveryInsights(range,allRecords);
    const movementForecast=buildMovementForecast(allRecords);
    const movementForecastRows=[['Data prevista','Dia da semana','Semana da previsão','Semana do mês','Estimativa pelo histórico','Programadas em aberto','Movimento previsto','Nível de confiança','Base histórica'],...movementForecast.rows.map(row=>[row.date,row.dayName,`Semana ${row.forecastWeek}`,`${row.monthWeek}ª semana`,row.historicalEstimate,row.scheduled,row.estimate,movementForecast.confidence,movementForecast.history.start?`${dateBR(movementForecast.history.start)} a ${dateBR(movementForecast.history.end)}`:'Sem histórico'])];
    const rootNet=root=>Math.max(0,Number(root?.fee||0)-Number(root?.refundAmount||0));
    const costs=scoped(state.costs).filter(c=>inRange(c.date,range));
    const cycles=scoped(state.cycles).filter(c=>inRange(c.date,range));
    const odometers=scoped(state.odometerLogs).filter(o=>inRange(o.date,range));
    const closures=scoped(state.dayClosures || []).filter(c=>inRange(c.date,range));
    const current=periodMetrics(range), previousRange=previousReportRange(range), previous=previousRange?periodMetrics(previousRange):null;
    const comparisonDefinitions=[
      ['Compras originais','purchases'],['Compras entregues no cliente','finalized'],['Sucesso na primeira tentativa %','firstAttemptRate'],['Cumprimento compra → saída %','departureComplianceRate'],['Saídas fora do padrão de 2h','delayed'],['Taxa de saída fora do padrão %','delayRate'],['Cumprimento compra → cliente %','completionComplianceRate'],['Entregas fora do padrão de 3h30','completionDelayed'],['Taxa de entrega fora do padrão %','completionDelayRate'],['Taxa de problemas %','problemRate'],['Compra → saída média min','avgWait'],['Compra → cliente média min','avgPurchaseToClient'],['Rota média min','avgRoute'],['Faturamento bruto','gross'],['Reembolsos','refunds'],['Faturamento líquido','net'],['Custos','costs'],['KM total','km']
    ];
    const comparisonRows=[['Indicador','Período atual',previousRange?`Período anterior (${previousRange.label})`:'Sem período anterior','Diferença','Variação %'],...comparisonDefinitions.map(([label,key])=>[label,current[key],previous?.[key]??'',previous?current[key]-previous[key]:'',previous?variationPercent(current[key],previous[key]):''])];

    const reportDates=unique([...deliveries.map(d=>d.date),...costs.map(c=>c.date),...cycles.map(c=>c.date),...odometers.map(o=>o.date)].filter(Boolean)).sort();
    const dailyRows=[['Data','Dia da semana','Compras','Registros','Compras entregues','Na loja','Em rota','Programadas abertas','Reagendadas abertas','Entregues após programação','Devolvidas','Retiradas','Canceladas','Saída > 2h','Entrega > 3h30','Sucesso 1ª tentativa %','Taxa saída fora do padrão %','Taxa entrega fora do padrão %','Faturamento bruto','Reembolsos','Faturamento líquido','Custos','Saldo','Ciclos','KM','Compra → saída média min','Loja → cliente média min','Compra → cliente média min','Rota média min','Clientes identificados','Telefones informados','Identificação completa %'],...reportDates.map(date=>{
      const dayDeliveries=deliveries.filter(d=>d.date===date),dayRoots=dayDeliveries.filter(isRootPurchase),daySchedules=dayRoots.map(root=>scheduleSummary(root,allRecords)).filter(Boolean),dayCosts=sum(costs.filter(c=>c.date===date).map(c=>c.value)),gross=sum(dayRoots.map(d=>d.fee)),refunds=sum(dayRoots.map(d=>d.refundAmount)),delayed=dayDeliveries.filter(d=>deliveryCalc(d).delayed).length,completionDelayed=dayDeliveries.filter(d=>deliveryCalc(d).completionDelayed).length,waits=dayDeliveries.map(d=>deliveryCalc(d).wait).filter(v=>v!==null),purchaseToClients=dayDeliveries.map(d=>deliveryCalc(d).purchaseToClient).filter(v=>v!==null),dateObj=reportDate(date),complete=dayRoots.filter(d=>d.coupon&&d.docNo&&d.cashierNo&&d.neighborhoodId&&d.purchaseTime).length,deliveredPurchases=dayRoots.filter(root=>rootWasFinalized(root,allRecords)).length;
      return [date,dateObj?['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'][dateObj.getDay()]:'',dayRoots.length,dayDeliveries.length,deliveredPurchases,dayRoots.filter(root=>purchaseOutcome(root,allRecords).key==='Na loja').length,dayRoots.filter(root=>purchaseOutcome(root,allRecords).key==='Em rota').length,daySchedules.filter(summary=>summary.open&&summary.kind==='Programada').length,daySchedules.filter(summary=>summary.open&&summary.kind==='Reagendada').length,daySchedules.filter(summary=>summary.delivered).length,dayRoots.filter(root=>purchaseOutcome(root,allRecords).key==='Devolvida').length,dayRoots.filter(root=>purchaseOutcome(root,allRecords).key==='Retirada na loja').length,dayRoots.filter(root=>purchaseOutcome(root,allRecords).key==='Cancelada').length,delayed,completionDelayed,percentage(dayRoots.filter(deliveredToCustomer).length,dayRoots.length),percentage(delayed,waits.length),percentage(completionDelayed,purchaseToClients.length),gross,refunds,gross-refunds,dayCosts,gross-refunds-dayCosts,cycles.filter(c=>c.date===date).length,totalKmFromOdometers(odometers.filter(o=>o.date===date)),avg(waits),avg(dayDeliveries.map(d=>deliveryCalc(d).toClient)),avg(purchaseToClients),avg(dayDeliveries.map(d=>deliveryCalc(d).route)),dayRoots.filter(d=>d.customerName||d.customerPhone).length,dayRoots.filter(d=>d.customerPhone).length,percentage(complete,dayRoots.length)];
    })];

    const deliveryDates=unique(deliveries.map(d=>d.date).filter(Boolean)).sort();
    const slaRows=[['Data','Registros com saída calculável','Saídas dentro de 2h','Saídas acima de 2h','Cumprimento saída %','Compra → saída média min','Entregas calculáveis','Entregas dentro de 3h30','Entregas acima de 3h30','Cumprimento entrega %','Compra → cliente média min'],...deliveryDates.map(date=>{
      const rows=deliveries.filter(d=>d.date===date),waits=rows.map(d=>deliveryCalc(d).wait).filter(v=>v!==null),totals=rows.map(d=>deliveryCalc(d).purchaseToClient).filter(v=>v!==null),departureOutside=rows.filter(d=>deliveryCalc(d).delayed).length,completionOutside=rows.filter(d=>deliveryCalc(d).completionDelayed).length;
      return [date,waits.length,waits.length-departureOutside,departureOutside,percentage(waits.length-departureOutside,waits.length),avg(waits),totals.length,totals.length-completionOutside,completionOutside,percentage(totals.length-completionOutside,totals.length),avg(totals)];
    })];

    const flowRows=[['Data','Compras originais','Registros','Com saída registrada','Aguardando saída','Finalizadas no cliente','Em rota','Programadas abertas','Taxa de finalização %'],...deliveryDates.map(date=>{
      const rows=deliveries.filter(d=>d.date===date),dayRoots=rows.filter(isRootPurchase),finalizedPurchases=dayRoots.filter(root=>rootWasFinalized(root,allRecords)).length;
      return [date,dayRoots.length,rows.length,dayRoots.filter(root=>chainForRoot(root,allRecords).some(d=>d.departureTime)).length,dayRoots.filter(root=>purchaseOutcome(root,allRecords).key==='Na loja').length,dayRoots.filter(root=>rootWasFinalized(root,allRecords)).length,dayRoots.filter(root=>purchaseOutcome(root,allRecords).key==='Em rota').length,dayRoots.filter(root=>purchaseOutcome(root,allRecords).record?.scheduledDate&&purchaseOutcome(root,allRecords).open).length,percentage(dayRoots.filter(root=>rootWasFinalized(root,allRecords)).length,dayRoots.length)];
    })];

    const reportMonths=unique([...deliveries.map(d=>String(d.date||'').slice(0,7)),...roots.map(d=>String(d.refundDate||'').slice(0,7)),...costs.map(c=>String(c.date||'').slice(0,7)),...cycles.map(c=>String(c.date||'').slice(0,7)),...odometers.map(o=>String(o.date||'').slice(0,7))].filter(value=>/^\d{4}-\d{2}$/.test(value))).sort();
    const monthlyRows=[['Mês','Compras','Registros','Compras entregues','Taxa de finalização %','Programadas/reagendadas abertas','Entregues após programação','Saídas dentro de 2h %','Entregas dentro de 3h30 %','Compra → saída média min','Compra → cliente média min','Faturamento bruto','Reembolsos','Faturamento líquido','Custos','Saldo','KM'],...reportMonths.map(month=>{
      const [year,monthNo]=month.split('-').map(Number),lastDay=new Date(year,monthNo,0).getDate(),monthRange={start:[range.start,`${month}-01`].sort().at(-1),end:[range.end,`${month}-${String(lastDay).padStart(2,'0')}`].sort()[0]},rows=deliveries.filter(d=>inRange(d.date,monthRange)),monthRoots=rows.filter(isRootPurchase),monthFinalized=monthRoots.filter(root=>rootWasFinalized(root,allRecords)).length,waits=rows.map(d=>deliveryCalc(d).wait).filter(v=>v!==null),totals=rows.map(d=>deliveryCalc(d).purchaseToClient).filter(v=>v!==null),monthFinancial=financialsForRange(monthRange),monthCosts=sum(costs.filter(c=>inRange(c.date,monthRange)).map(c=>c.value));
      const monthSchedules=monthRoots.map(root=>scheduleSummary(root,allRecords)).filter(Boolean);
      return [`${String(monthNo).padStart(2,'0')}/${year}`,monthRoots.length,rows.length,monthFinalized,percentage(monthFinalized,monthRoots.length),monthSchedules.filter(summary=>summary.open).length,monthSchedules.filter(summary=>summary.delivered).length,percentage(waits.filter(value=>value<=Number(state.settings.delayMinutes||120)).length,waits.length),percentage(totals.filter(value=>value<=Number(state.settings.completionLimitMinutes||210)).length,totals.length),avg(waits),avg(totals),monthFinancial.gross,monthFinancial.refundTotal,monthFinancial.net,monthCosts,monthFinancial.net-monthCosts,totalKmFromOdometers(odometers.filter(o=>inRange(o.date,monthRange)))];
    })];

    const feeGroups=groupItems(roots,root=>Number(root.fee||0).toFixed(2));
    const feeRows=[['Taxa cobrada','Compras','Percentual das compras','Faturamento bruto','Reembolsos','Faturamento líquido','Caixa mais frequente','Bairro mais frequente','Clientes identificados'],...[...feeGroups.entries()].map(([fee,rows])=>[Number(fee),rows.length,percentage(rows.length,roots.length),sum(rows.map(d=>d.fee)),sum(rows.map(d=>d.refundAmount)),sum(rows.map(rootNet)),mostCommon(rows.map(d=>d.cashierNo),'Não informado'),mostCommon(rows.map(d=>neighborhood(d.neighborhoodId)?.name)),rows.filter(d=>d.customerName||d.customerPhone).length]).sort((a,b)=>a[0]-b[0])];

    const methodologyRows=[['Indicador','Como é calculado','Finalidade'],
      ['Compras originais','Registros sem entrega anterior vinculada','Evita contar reagendamentos como nova venda'],
      ['Sucesso na primeira tentativa','Compras finalizadas na tentativa inicial ÷ compras originais','Medir entregas concluídas sem nova tentativa'],
      ['Saída fora do padrão','Compra até a saída acima do limite configurado (padrão: 120 min corridos)','Identificar demora antes da saída'],
      ['Entrega fora do padrão','Compra até a finalização no cliente acima do limite configurado (padrão: 210 min corridos)','Controlar o prazo total até a casa do cliente'],
      ['Taxa de saída fora do padrão','Saídas acima de 2h ÷ registros com compra e saída informadas','Comparar pontualidade da expedição'],
      ['Taxa de entrega fora do padrão','Entregas acima de 3h30 ÷ registros com compra e finalização informadas','Comparar pontualidade da entrega final'],
      ['Taxa de problemas','Compras com devolução, reagendamento, cancelamento ou motivo ÷ compras originais','Acompanhar falhas operacionais'],
      ['Compra → saída média','Média em tempo corrido entre hora da compra e saída','Medir agilidade da loja'],
      ['Até cliente','Média entre saída e finalização no cliente','Medir deslocamento até a entrega'],
      ['Compra → cliente média','Média em tempo corrido entre compra e finalização no cliente','Medir a experiência total do cliente'],
      ['Rota média','Média entre saída e retorno à loja','Medir duração completa das rotas'],
      ['Faturamento líquido','Taxas registradas menos reembolsos','Mostrar a receita efetiva das entregas'],
      ['Cliente recorrente','Mesmo telefone ou, sem telefone, mesmo nome em mais de uma compra','Identificar repetição de atendimento'],
      ['Nota de qualidade','100 menos a média das taxas de atraso e problemas','Comparar qualidade entre bairros, equipe, veículos e caixas'],
      ['Identificação completa','Nº do cupom, DOC, caixa, bairro e hora de entrada preenchidos','Medir qualidade dos cadastros'],
      ['Comparativo','Período selecionado contra período anterior com a mesma quantidade de dias','Mostrar evolução ou queda'],
      ['Data com mais entregas','Data exata do período do relatório com a maior quantidade de compras entregues no cliente','Mostrar o pico real em dia, mês e ano'],
      ['Dia da semana com maior média','Média diária das compras entregues em cada dia da semana, usando até os 365 dias mais recentes disponíveis','Identificar o dia da semana que normalmente concentra mais entregas'],
      ['Semana do mês com maior média','Média diária das entregas nos dias 1–7, 8–14, 15–21, 22–28 ou 29–fim do mês, usando até os 365 dias mais recentes disponíveis','Identificar em qual parte do mês a operação costuma ter maior volume'],
      ['Previsão de movimento','Combina 65% da média histórica do dia da semana com 35% da média da semana do mês; programações abertas funcionam como volume mínimo conhecido','Antecipar equipe, veículo e organização das saídas nas próximas 5 semanas'],
      ['Confiança da previsão','Alta com pelo menos 270 dias e 100 entregas; Média com 90 dias e 30 entregas; Inicial com 28 dias e 10 entregas; abaixo disso, Baixa','Deixar clara a quantidade de histórico disponível para projetar o movimento'],
      ['Situação consolidada da compra','Resultado de toda a cadeia ligada à compra original; uma finalização posterior prevalece sobre Programada ou Reagendada no histórico','Evitar contabilizar como pendente uma compra que já foi entregue'],
      ['Entregas agendadas no SLA','Compras com programação ou reagendamento ficam fora dos indicadores comuns de atraso de 2h e 3h30','Não classificar como atraso uma entrega combinada para outro dia ou horário'],
      ['Programações registradas','Todos os eventos de programação e reagendamento são mantidos como histórico','Preservar o que aconteceu sem confundir com pendência atual'],
      ['Previsão da agenda','Somente compras programadas ainda abertas, agrupadas pela data prevista','Antecipar a carga de trabalho real'],
      ['KM por entrega','KM diário dividido pelas entregas finalizadas','Avaliar eficiência da frota']
    ];

    const weekNames=['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
    const dayGroups=groupItems(roots,root=>{const date=reportDate(root.date);return date?date.getDay():-1;});
    const dayRows=[['Dia da semana','Compras','Finalizadas','Sucesso %','Atrasadas','Taxa de atraso %','Problemas','Faturamento líquido','Espera média min','Rota média min'],...[0,1,2,3,4,5,6].filter(day=>dayGroups.get(day)?.length).map(day=>{
      const rows=dayGroups.get(day),finalized=rows.filter(root=>rootWasFinalized(root,allRecords)).length,delayed=rows.filter(root=>rootWasDelayed(root,allRecords)).length,problems=rows.filter(root=>rootHadProblem(root,allRecords)).length;
      return [weekNames[day],rows.length,finalized,percentage(finalized,rows.length),delayed,percentage(delayed,rows.length),problems,sum(rows.map(rootNet)),avg(rows.map(d=>deliveryCalc(d).wait)),avg(rows.map(d=>deliveryCalc(d).route))];
    })];
    const hourGroups=groupItems(roots.filter(root=>{const hour=Number(String(root.purchaseTime||'').slice(0,2));return Number.isInteger(hour)&&hour>=0&&hour<=23;}),root=>Number(String(root.purchaseTime).slice(0,2)));
    const hourRows=[['Faixa de horário','Compras','Finalizadas','Sucesso %','Atrasadas','Taxa de atraso %','Faturamento líquido','Espera média min'],...[...hourGroups.entries()].sort((a,b)=>a[0]-b[0]).map(([hour,rows])=>{
      const finalized=rows.filter(root=>rootWasFinalized(root,allRecords)).length,delayed=rows.filter(root=>rootWasDelayed(root,allRecords)).length;
      return [`${String(hour).padStart(2,'0')}:00–${String(hour).padStart(2,'0')}:59`,rows.length,finalized,percentage(finalized,rows.length),delayed,percentage(delayed,rows.length),sum(rows.map(rootNet)),avg(rows.map(d=>deliveryCalc(d).wait))];
    })];

    const cashierGroups=groupItems(roots,root=>String(root.cashierNo || '').trim() || 'Não informado');
    const cashierRows=[['Nº Caixa','Compras','Finalizadas','Sucesso %','Atrasadas','Taxa de atraso %','DOCs duplicados','Clientes identificados','Faturamento bruto','Reembolsos','Faturamento líquido','Taxa média'],...[...cashierGroups.entries()].map(([cashier,rows])=>{
      const finalized=rows.filter(root=>rootWasFinalized(root,allRecords)).length,delayed=rows.filter(root=>rootWasDelayed(root,allRecords)).length;
      const duplicates=[...groupItems(rows.filter(root=>root.docNo),root=>`${root.date}|${root.docNo}`).values()].filter(group=>group.length>1).reduce((total,group)=>total+group.length,0);
      const gross=sum(rows.map(d=>d.fee)),refunds=sum(rows.map(d=>d.refundAmount));
      return [cashier,rows.length,finalized,percentage(finalized,rows.length),delayed,percentage(delayed,rows.length),duplicates,rows.filter(d=>d.customerName||d.customerPhone).length,gross,refunds,gross-refunds,avg(rows.map(d=>d.fee))];
    }).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))];

    const customerGroups=groupItems(roots.filter(normalizedCustomerKey),normalizedCustomerKey);
    const customerRows=[['Cliente','Telefone','Compras','Cliente recorrente','Primeira compra','Última compra','Bairros atendidos','Bairro mais frequente','Finalizadas','Problemas','Reagendamentos','Devoluções','Faturamento líquido'],...[...customerGroups.values()].map(rows=>{
      const sorted=rows.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))), name=rows.find(d=>d.customerName)?.customerName||'Não informado', phone=rows.find(d=>d.customerPhone)?.customerPhone||'';
      const related=rows.flatMap(root=>chainForRoot(root,allRecords));
      const neighborhoods=unique(rows.map(d=>neighborhood(d.neighborhoodId)?.name).filter(Boolean));
      return [name,phone,rows.length,rows.length>1?'SIM':'NÃO',sorted[0]?.date||'',sorted.at(-1)?.date||'',neighborhoods.length,mostCommon(rows.map(d=>neighborhood(d.neighborhoodId)?.name)),rows.filter(root=>rootWasFinalized(root,allRecords)).length,rows.filter(root=>rootHadProblem(root,allRecords)).length,related.filter(d=>d.scheduleKind==='Reagendada').length,related.filter(d=>d.status==='Devolvida').length,sum(rows.map(rootNet))];
    }).sort((a,b)=>b[2]-a[2]||String(a[0]).localeCompare(String(b[0])))];

    const occurrenceRecords=deliveries.filter(d=>recordHasProblem(d));
    const occurrenceGroups=groupItems(occurrenceRecords,d=>reason(d.reasonId)?.name || d.reasonText || d.status || 'Sem motivo informado');
    const occurrenceRows=[['Motivo ou ocorrência','Registros','Compras afetadas','Devoluções','Reagendamentos','Cancelamentos','Bairro mais frequente','Entregador mais frequente','Veículo mais frequente'],...[...occurrenceGroups.entries()].map(([label,rows])=>[label,rows.length,unique(rows.map(d=>d.rootId||d.id)).length,rows.filter(d=>d.status==='Devolvida').length,rows.filter(d=>d.scheduleKind==='Reagendada'||d.status==='Reagendada').length,rows.filter(d=>d.status==='Cancelada').length,mostCommon(rows.map(d=>neighborhood(d.neighborhoodId)?.name)),mostCommon(rows.map(d=>employee(d.driverId)?.name)),mostCommon(rows.map(d=>vehicle(d.vehicleId)?.name))]).sort((a,b)=>b[1]-a[1])];

    const departed=deliveries.filter(d=>d.departureTime);
    const qualityDefinitions=[
      ['Nº do cupom',roots,d=>d.coupon,'Obrigatório nos novos registros'],['Nº DOC',roots,d=>d.docNo,'Obrigatório a partir da V14.1'],['Nº Caixa',roots,d=>d.cashierNo,'Obrigatório a partir da V14.1'],['Nome do cliente',roots,d=>d.customerName,'Opcional'],['Telefone do cliente',roots,d=>d.customerPhone,'Opcional'],['Bairro',roots,d=>d.neighborhoodId,'Identificação operacional'],['Hora de entrada',roots,d=>d.purchaseTime,'Cálculo de espera'],['Entregador nas saídas',departed,d=>d.driverId,'Registros que já saíram'],['Veículo nas saídas',departed,d=>d.vehicleId,'Registros que já saíram'],['Ciclo nas saídas',departed,d=>d.cycleId,'Registros que já saíram']
    ];
    const qualityRows=[['Campo','Base analisada','Preenchidos','Ausentes','Completude %','Observação'],...qualityDefinitions.map(([label,base,test,note])=>{const filled=base.filter(test).length;return[label,base.length,filled,base.length-filled,percentage(filled,base.length),note];})];

    const inconsistencyRows=[['Tipo','Data','Compra/Nº do cupom','DOC','Caixa','Detalhe']];
    const couponDuplicates=groupItems(roots.filter(d=>d.coupon),d=>`${d.date}|${String(d.coupon).trim()}`);
    [...couponDuplicates.values()].filter(rows=>rows.length>1).forEach(rows=>inconsistencyRows.push(['Nº do cupom duplicado',rows[0].date,rows.map(d=>d.orderNo||d.coupon).join(', '),'','',`${rows.length} registros com o número de cupom ${rows[0].coupon}`]));
    const docDuplicates=groupItems(roots.filter(d=>d.docNo&&d.cashierNo),d=>`${d.date}|${String(d.cashierNo).trim()}|${String(d.docNo).trim()}`);
    [...docDuplicates.values()].filter(rows=>rows.length>1).forEach(rows=>inconsistencyRows.push(['DOC duplicado',rows[0].date,rows.map(d=>d.orderNo||d.coupon).join(', '),rows[0].docNo,rows[0].cashierNo,`${rows.length} registros com o mesmo DOC e caixa` ]));
    roots.forEach(root=>{
      const missing=[['Nº do cupom',root.coupon],['DOC',root.docNo],['Caixa',root.cashierNo],['Bairro',root.neighborhoodId],['Hora entrada',root.purchaseTime]].filter(([,value])=>!value).map(([label])=>label);
      if(missing.length)inconsistencyRows.push(['Campos obrigatórios ausentes',root.date,root.orderNo||root.coupon||'—',root.docNo||'',root.cashierNo||'',missing.join(', ')]);
    });
    deliveries.forEach(d=>{
      const purchase=timeToMinutes(d.purchaseTime),departure=timeToMinutes(d.departureTime),finish=timeToMinutes(d.finalizationTime),returned=timeToMinutes(d.returnTime),issues=[];
      if(purchase!==null&&departure!==null&&departure<purchase)issues.push('Saída anterior à compra');
      if(departure!==null&&finish!==null&&finish<departure)issues.push('Finalização anterior à saída');
      if(departure!==null&&returned!==null&&returned<departure)issues.push('Retorno anterior à saída');
      if(issues.length)inconsistencyRows.push(['Horários inconsistentes',d.date,d.orderNo||d.coupon||'—',d.docNo||'',d.cashierNo||'',issues.join(', ')]);
    });
    [...groupItems(roots,d=>d.date).entries()].forEach(([date,rows])=>{const gaps=sequenceGaps(rows.map(d=>d.orderNo));if(gaps.length)inconsistencyRows.push(['Lacuna na sequência de compras',date,'','','',`Números ausentes: ${gaps.join(', ')}`]);});
    if(inconsistencyRows.length===1)inconsistencyRows.push(['Nenhuma inconsistência encontrada','','','','','Os registros do período passaram pelas validações automáticas.']);

    const forecastGroups=groupItems(scheduleSummaries.filter(summary=>summary.open).map(summary=>summary.outcome.record),d=>d.scheduledDate || 'Sem data');
    const forecastRows=[['Data programada','Situação da agenda','Entregas','Reagendadas','Clientes com telefone','Bairros diferentes','Bairro mais frequente','Taxas vinculadas','Próxima ação mais frequente'],...[...forecastGroups.entries()].map(([date,rows])=>[date,date==='Sem data'?'SEM DATA':date<todayISO()?'AGENDA PENDENTE':date===todayISO()?'HOJE':'FUTURA',rows.length,rows.filter(d=>d.scheduleKind==='Reagendada').length,rows.filter(d=>d.customerPhone).length,unique(rows.map(d=>d.neighborhoodId).filter(Boolean)).length,mostCommon(rows.map(d=>neighborhood(d.neighborhoodId)?.name)),revenueAttributedTo(rows),mostCommon(rows.map(d=>d.nextAction),'Não informada')]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))];

    const rankingRows=[['Dimensão','Nome','Registros','Finalizadas','Sucesso %','Atrasadas','Taxa de atraso %','Problemas','Taxa de problemas %','Rota média min','Faturamento atribuído','Nota de qualidade']];
    const addRanking=(dimension,groups,labelFn)=>[...groups.entries()].forEach(([id,rows])=>{
      if(!rows.length)return;const finalized=rows.filter(deliveredToCustomer).length,delayed=rows.filter(d=>deliveryCalc(d).delayed).length,problems=rows.filter(recordHasProblem).length,delayRate=percentage(delayed,rows.length),problemRate=percentage(problems,rows.length),score=clamp(100-(delayRate+problemRate)/2,0,100);
      rankingRows.push([dimension,labelFn(id),rows.length,finalized,percentage(finalized,rows.length),delayed,delayRate,problems,problemRate,avg(rows.map(d=>deliveryCalc(d).route)),revenueAttributedTo(rows),score]);
    });
    addRanking('Bairro',groupItems(deliveries.filter(d=>d.neighborhoodId),d=>d.neighborhoodId),id=>neighborhood(id)?.name||'Bairro não encontrado');
    addRanking('Entregador',groupItems(deliveries.filter(d=>d.driverId),d=>d.driverId),id=>employee(id)?.name||'Entregador não encontrado');
    addRanking('Veículo',groupItems(deliveries.filter(d=>d.vehicleId),d=>d.vehicleId),id=>vehicle(id)?.name||'Veículo não encontrado');
    addRanking('Caixa PDV',groupItems(roots.filter(d=>d.cashierNo),d=>d.cashierNo),id=>`Caixa ${id}`);
    rankingRows.splice(1,rankingRows.length-1,...rankingRows.slice(1).sort((a,b)=>b[11]-a[11]||b[3]-a[3]));

    return {deliveries,roots,scheduleSummaries,deliveryInsights,movementForecast,movementForecastRows,costs,cycles,odometers,closures,current,previousRange,comparisonRows,dailyRows,slaRows,flowRows,monthlyRows,dayRows,hourRows,feeRows,methodologyRows,cashierRows,customerRows,occurrenceRows,qualityRows,inconsistencyRows,forecastRows,rankingRows};
  }

  /* Excel-compatible SpreadsheetML 2003 export. Works offline and supports multiple worksheets. */
  function exportExcelReport() {
    const r=reportRangeFromForm();
    if(!r.start || !r.end){toast('Informe o período do relatório.','warning');return;}
    const analytics=buildReportAnalytics(r);
    const {deliveries,roots,scheduleSummaries,deliveryInsights,movementForecast,movementForecastRows,costs,cycles,odometers,closures,current,comparisonRows,dailyRows,slaRows,flowRows,monthlyRows,dayRows,hourRows,feeRows,methodologyRows,cashierRows,customerRows,occurrenceRows,qualityRows,inconsistencyRows,forecastRows,rankingRows}=analytics;
    const allRecords=scoped(state.deliveries);
    const deliveredRoots=roots.filter(root=>rootWasFinalized(root,allRecords));
    const outcomeFor=root=>purchaseOutcome(root,allRecords);
    const totalCosts=current.costs;
    const fin={gross:current.gross,refundTotal:current.refunds,net:current.net};
    const km=current.km;
    const peakHour=hourRows.slice(1).sort((a,b)=>b[1]-a[1])[0];
    const reportPeakDate=deliveryInsights.reportPeak?.date||'';
    const reportPeakWeekday=reportPeakDate?['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'][reportDate(reportPeakDate).getDay()]:'';
    const topCashier=cashierRows.slice(1).filter(row=>row[0]!=='Não informado').sort((a,b)=>b[1]-a[1])[0];
    const recurringCustomers=customerRows.slice(1).filter(row=>row[3]==='SIM').length;
    const completeIdentification=roots.filter(d=>d.coupon&&d.docNo&&d.cashierNo&&d.neighborhoodId&&d.purchaseTime).length;
    const statusRows=[...groupItems(roots,root=>outcomeFor(root).key).entries()].map(([status,statusRoots])=>{
      const rows=statusRoots.flatMap(root=>chainForRoot(root,allRecords));
      return [status,statusRoots.length,percentage(statusRoots.length,roots.length),sum(statusRoots.map(netRevenueOfRoot)),avg(rows.map(d=>deliveryCalc(d).wait)),avg(rows.map(d=>deliveryCalc(d).toClient)),avg(rows.map(d=>deliveryCalc(d).purchaseToClient)),avg(rows.map(d=>deliveryCalc(d).route)),rows.filter(d=>deliveryCalc(d).delayed).length,rows.filter(d=>deliveryCalc(d).completionDelayed).length];
    }).sort((a,b)=>b[1]-a[1]);
    const sheets={
      RESUMO_EXECUTIVO:[
        ['Indicador','Valor'],
        ['Versão do sistema',APP_VERSION],
        ['Ambiente',modeLabel()],
        ['Período',`${dateBR(r.start)} a ${dateBR(r.end)}`],
        ['Período histórico usado nas médias',deliveryInsights.start?`${dateBR(deliveryInsights.start)} a ${dateBR(deliveryInsights.end)}`:'Sem dados'],
        ['Dias de calendário analisados nas médias',deliveryInsights.calendarDays],
        ['Compras entregues usadas nas médias',deliveryInsights.deliveredCount],
        ['Compras originais',roots.length],
        ['Registros de entrega e tentativas',deliveries.length],
        ['Compras entregues no cliente',deliveredRoots.length],
        ['Compras em rota',roots.filter(root=>outcomeFor(root).key==='Em rota').length],
        ['Compras na loja',roots.filter(root=>outcomeFor(root).key==='Na loja').length],
        ['Programadas ou reagendadas em aberto',scheduleSummaries.filter(summary=>summary.open).length],
        ['Programadas ou reagendadas em atendimento',scheduleSummaries.filter(summary=>summary.started&&summary.outcome.open).length],
        ['Entregues após programação ou reagendamento',scheduleSummaries.filter(summary=>summary.delivered).length],
        ['Devolvidas sem entrega posterior',roots.filter(root=>outcomeFor(root).key==='Devolvida').length],
        ['Retiradas na loja',roots.filter(root=>outcomeFor(root).key==='Retirada na loja').length],
        ['Canceladas',roots.filter(root=>outcomeFor(root).key==='Cancelada').length],
        ['Saídas fora do padrão de 2h',current.delayed],
        ['Cumprimento compra até saída %',current.departureComplianceRate],
        ['Taxa de saída fora do padrão %',current.delayRate],
        ['Entregas fora do padrão de 3h30',current.completionDelayed],
        ['Cumprimento compra até cliente %',current.completionComplianceRate],
        ['Taxa de entrega fora do padrão %',current.completionDelayRate],
        ['Sucesso na primeira tentativa %',current.firstAttemptRate],
        ['Taxa de problemas %',current.problemRate],
        ['Clientes com nome informado',roots.filter(d=>d.customerName).length],
        ['Clientes com telefone informado',roots.filter(d=>d.customerPhone).length],
        ['Clientes recorrentes identificados',recurringCustomers],
        ['Identificações obrigatórias completas',completeIdentification],
        ['Completude da identificação %',percentage(completeIdentification,roots.length)],
        ['Data com mais entregas no período',reportPeakDate?`${dateBR(reportPeakDate)} • ${reportPeakWeekday}`:'Sem dados'],
        ['Entregas na data de maior movimento',deliveryInsights.reportPeak?.count||0],
        ['Dia da semana com maior média em até 1 ano',deliveryInsights.peakWeekday?.label||'Sem dados'],
        ['Média de entregas no melhor dia da semana',deliveryInsights.peakWeekday?.average||0],
        ['Semana do mês com maior média em até 1 ano',deliveryInsights.peakWeekOfMonth?`${deliveryInsights.peakWeekOfMonth.label} • ${deliveryInsights.peakWeekOfMonth.detail}`:'Sem dados'],
        ['Média diária de entregas na melhor semana do mês',deliveryInsights.peakWeekOfMonth?.average||0],
        ['Horizonte da previsão de movimento',`${dateBR(movementForecast.forecastStart)} a ${dateBR(movementForecast.forecastEnd)}`],
        ['Confiança da previsão',movementForecast.confidence],
        ['Data prevista de maior movimento',movementForecast.peakDay?`${dateBR(movementForecast.peakDay.date)} • ${movementForecast.peakDay.dayName}`:'Sem previsão'],
        ['Entregas previstas no dia de pico',movementForecast.peakDay?.estimate||0],
        ['Semana prevista de maior movimento',movementForecast.peakWeek?`${dateBR(movementForecast.peakWeek.start)} a ${dateBR(movementForecast.peakWeek.end)}`:'Sem previsão'],
        ['Entregas previstas na semana de pico',movementForecast.peakWeek?.estimate||0],
        ['Dia da semana previsto como mais forte',movementForecast.peakWeekday?.label||'Sem previsão'],
        ['Média prevista no dia da semana mais forte',movementForecast.peakWeekday?.average||0],
        ['Programações abertas já consideradas',movementForecast.scheduledTotal],
        ['Horário com mais compras',peakHour?`${peakHour[0]} • ${peakHour[1]} compra(s)`:'Sem dados'],
        ['Caixa com mais compras',topCashier?`Caixa ${topCashier[0]} • ${topCashier[1]} compra(s)`:'Sem dados'],
        ['Faturamento bruto',fin.gross],
        ['Reembolsos de taxa',fin.refundTotal],
        ['Faturamento líquido',fin.net],
        ['Custos',totalCosts],
        ['Saldo operacional',fin.net-totalCosts],
        ['Custo por compra entregue',deliveredRoots.length?totalCosts/deliveredRoots.length:0],
        ['Compra até saída média em minutos',current.avgWait],
        ['Loja até cliente média em minutos',avg(deliveries.map(d=>deliveryCalc(d).toClient))],
        ['Compra até cliente média em minutos',current.avgPurchaseToClient],
        ['Rota média em minutos',avg(deliveries.map(d=>deliveryCalc(d).route))],
        ['KM total',km],
        ['KM médio por dia',unique(odometers.filter(o=>odometerCalc(o).complete).map(o=>o.date)).length?km/unique(odometers.filter(o=>odometerCalc(o).complete).map(o=>o.date)).length:0],
        ['KM por compra entregue',deliveredRoots.length?km/deliveredRoots.length:0],
        ['Ciclos',cycles.length],
        ['Entregas por ciclo',cycles.length?sum(cycles.map(c=>cycleCalc(c).deliveries))/cycles.length:0],
        ['KM médio por ciclo',cycles.length?km/cycles.length:0],
        ['Dias encerrados',closures.length]
      ],
      RESUMO_DIARIO:dailyRows,
      SLA_PRAZOS:slaRows,
      FLUXO_OPERACIONAL:flowRows,
      RESUMO_MENSAL:monthlyRows,
      COMPARATIVO:comparisonRows,
      DIAS_SEMANA:dayRows,
      HORARIOS_PICO:hourRows,
      TAXAS_PDV:feeRows,
      STATUS:[['Situação consolidada da compra','Quantidade de compras','Percentual das compras','Faturamento atribuído','Compra → saída média min','Loja → cliente média min','Compra → cliente média min','Rota média min','Saída > 2h','Entrega > 3h30'],...statusRows],
      RANKING_OPERACIONAL:rankingRows,
      METODOLOGIA:methodologyRows,
      ENTREGAS:[['ID','ID raiz','ID anterior','Tentativa','Data','Nº Compra','Nº do cupom','Nº DOC','Nº Caixa','Nome do cliente','Telefone','Bairro','Rua/Avenida','Número','Complemento','Referência','Prioridade','Posição no roteiro','Taxa registrada','Reembolso','Data reembolso','Receita líquida','Entregador','Veículo','Ciclo','Entrada','Saída','Finalização','Retorno Loja','Compra → Saída Min','Loja → Cliente Min','Compra → Cliente Finalizada Min','Tempo Total/Transcorrido Agora Min','Saldo do Prazo 3h30 Min','Rota Min','Aplicável ao SLA comum','Saída > 2h','Entrega > 3h30','Situação Atual do Prazo','Status deste registro','Situação consolidada da compra','Entregue em alguma tentativa','Data Programada','Hora Programada','Tipo Programação','Detalhes do agendamento','Voltou sem entrega','Motivo da volta','Detalhe da volta','Motivo padronizado','Motivo complementar','Próxima Ação','Observações','Criado em','Atualizado em'],...deliveries.map(d=>{const c=deliveryCalc(d),p=completionProgress(d),outcome=purchaseOutcome(d,allRecords),routeCycle=cycle(d.cycleId),routePosition=routeCycle?cycleRouteDeliveries(routeCycle).findIndex(item=>item.id===d.id)+1:'';return[d.id,d.rootId||d.id,d.parentId||'',d.attemptNo||1,d.date,d.orderNo,d.coupon,d.docNo||'',d.cashierNo||'',d.customerName||'',d.customerPhone||'',neighborhood(d.neighborhoodId)?.name||'',d.address||'',d.addressNumber||'',d.addressComplement||'',d.addressReference||'',d.priority?'SIM':'NÃO',routePosition||'',rootDelivery(d)?.fee||d.fee,rootDelivery(d)?.refundAmount||0,rootDelivery(d)?.refundDate||'',netRevenueOfRoot(d),employee(d.driverId)?.name||'',vehicle(d.vehicleId)?.name||'',cycle(d.cycleId)?.code||'',d.purchaseTime,d.departureTime,d.finalizationTime,d.returnTime,c.wait,c.toClient,c.purchaseToClient,p.elapsed,p.balance,c.route,c.slaExempt?'NÃO • ENTREGA AGENDADA':'SIM',c.delayed?'SIM':'NÃO',c.completionDelayed?'SIM':'NÃO',c.slaExempt?'AGENDADA • FORA DO INDICADOR COMUM':p.elapsed===null?'NÃO CALCULÁVEL':p.outside?'FORA DO PADRÃO':'DENTRO DO PADRÃO',d.status,outcome.label,outcome.delivered?'SIM':'NÃO',d.scheduledDate,d.scheduledTime||'',d.scheduleKind,d.scheduleNotes||'',d.returnedUndelivered?'SIM':'NÃO',reason(d.returnReasonId)?.name||'',d.returnReasonText||'',reason(d.reasonId)?.name||'',d.reasonText||'',d.nextAction,d.notes,d.createdAt,d.updatedAt]})],
      CONTATOS_CLIENTES:[['Data','Nº Compra','Nº do cupom','Nº DOC','Nº Caixa','Nome do cliente','Telefone','Bairro','Endereço completo','Referência','Prioridade','Situação consolidada','Última data programada','Último horário programado','Detalhes do agendamento','Próxima Ação','Observações'],...roots.map(d=>{const outcome=outcomeFor(d),summary=scheduleSummary(d,allRecords);return[d.date,d.orderNo,d.coupon,d.docNo||'',d.cashierNo||'',d.customerName||'',d.customerPhone||'',neighborhood(d.neighborhoodId)?.name||'',deliveryAddressLine(d),d.addressReference||'',d.priority?'SIM':'NÃO',outcome.label,summary?.latestEvent?.scheduledDate||'',summary?.latestEvent?.scheduledTime||'',summary?.latestEvent?.scheduleNotes||'',outcome.record?.nextAction||d.nextAction,outcome.record?.notes||d.notes]})],
      CLIENTES:customerRows,
      CAIXAS_PDV:cashierRows,
      OCORRENCIAS:occurrenceRows,
      QUALIDADE_DADOS:qualityRows,
      INCONSISTENCIAS:inconsistencyRows,
      PREVISAO_AGENDA:forecastRows,
      PREVISAO_MOVIMENTO:movementForecastRows,
      CUSTOS:[['Data','Hora','Veículo','Categoria','Descrição','Valor','KM Atual','Fornecedor','Comprovante','Responsável','Observações'],...costs.map(c=>[c.date,c.time,vehicle(c.vehicleId)?.name||'',category(c.categoryId)?.name||'',c.description,c.value,c.km,c.supplier,c.receiptNo,employee(c.responsibleId)?.name||'',c.notes])],
      CICLOS:[['Data','Ciclo','Tipo','Veículo','Entregador','Saída','Retorno','Entregas levadas','Entregas concluídas','Entregas que voltaram','Prioridades','Bairros','Ordem sugerida das NFs','KM Médio por Ciclo','Tempo Min','Receita'],...cycles.map(c=>{const x=cycleCalc(c),route=cycleRouteDeliveries(c);return[c.date,c.code,c.autoGenerated?'AUTOMÁTICO':'MANUAL',vehicle(c.vehicleId)?.name||'',employee(c.driverId)?.name||'',c.departureTime,c.returnTime,x.deliveries,x.delivered,x.returned,route.filter(d=>d.priority).length,unique(route.map(d=>neighborhood(d.neighborhoodId)?.name).filter(Boolean)).join(' → '),route.map(d=>d.docNo||d.coupon||d.orderNo||'—').join(' → '),x.km,x.minutes,x.revenue]})],
      ODOMETRO_DIARIO:[['Data','Veículo','KM Inicial','KM Final','KM Rodado','Ciclos','Entregas','Entregas por Ciclo','KM por Ciclo','KM por Entrega','Status'],...odometers.map(o=>{const s=vehicleDayStats(o.date,o.vehicleId),x=odometerCalc(o);return[o.date,vehicle(o.vehicleId)?.name||'',o.kmStart,o.kmEnd,x.km,s.cycles,s.deliveries,s.deliveriesPerCycle,s.kmPerCycle,s.kmPerDelivery,x.complete?'FECHADO':'ABERTO']})],
      VEICULOS:buildVehicleReportRows(deliveries,costs,cycles,odometers),
      COLABORADORES:buildEmployeeReportRows(deliveries),
      BAIRROS:buildNeighborhoodReportRows(deliveries),
      PROGRAMADAS:[['Origem da compra','Última data programada','Hora programada','Tipo consolidado','Detalhes do agendamento','Fora do indicador comum de atraso','Nº Compra','Nº do cupom','Nº DOC','Nº Caixa','Nome do cliente','Telefone','Bairro','Situação consolidada','Entregue no cliente','Data da entrega','Hora da entrega','Tentativa entregue','Programações registradas','Tentativas ligadas','Motivo mais recente','Próxima ação'],...scheduleSummaries.map(summary=>{const delivered=summary.delivered?summary.outcome.record:null,latest=summary.latestEvent;return[summary.root.date,latest.scheduledDate,latest.scheduledTime||'',summary.kind,latest.scheduleNotes||'','SIM',summary.root.orderNo,summary.root.coupon,summary.root.docNo||'',summary.root.cashierNo||'',summary.root.customerName||'',summary.root.customerPhone||'',neighborhood(summary.root.neighborhoodId)?.name||'',summary.situation,summary.delivered?'SIM':'NÃO',delivered?.date||'',delivered?.finalizationTime||'',delivered?.attemptNo||'',summary.events.length,summary.chain.length,reason(latest.reasonId)?.name||latest.reasonText||'',latest.nextAction||'']})],
      PENDENCIAS:[['Prioridade','Data','Tipo','Título','Detalhe','Meta'],...systemIssues({includeInfo:true}).filter(i=>inRange(i.date,r)||inRange(i.relatedDate,r)).map(i=>[i.severity==='critical'?'CRÍTICA':i.severity==='warning'?'ATENÇÃO':'INFORMATIVA',i.relatedDate||i.date,i.type,i.title,i.detail,i.meta||''])],
      FECHAMENTOS_DIA:[['Data','Encerrado em','Entregas no encerramento','Ciclos no encerramento','KM no encerramento','Avisos'],...closures.map(c=>[c.date,c.closedAt,c.snapshot?.deliveries||0,c.snapshot?.cycles||0,c.snapshot?.km||0,c.snapshot?.warnings||0])],
      HISTORICO:[['ID','ID raiz','ID anterior','Tentativa','Data','Nº Compra','Nº do cupom','Nº DOC','Nº Caixa','Cliente','Telefone','Status deste registro','Situação consolidada da compra','Entregue em alguma tentativa','Agendamento','Voltou sem entrega','Motivo da volta','Criado em','Atualizado em'],...deliveries.map(d=>{const outcome=purchaseOutcome(d,allRecords);return[d.id,d.rootId||d.id,d.parentId||'',d.attemptNo||1,d.date,d.orderNo,d.coupon,d.docNo||'',d.cashierNo||'',d.customerName||'',d.customerPhone||'',d.status,outcome.label,outcome.delivered?'SIM':'NÃO',d.scheduledDate?scheduledDateTimeLabel(d):'',d.returnedUndelivered?'SIM':'NÃO',reason(d.returnReasonId)?.name||d.returnReasonText||'',d.createdAt,d.updatedAt]})]
    };
    const xml=buildSpreadsheetML(sheets);
    downloadBlob(new Blob(['\ufeff'+xml],{type:'application/vnd.ms-excel;charset=utf-8'}),`Relatorio_Controle_Entregas_${r.label}.xls`);
    toast('Relatório Excel gerado.','success');
  }

  function buildVehicleReportRows(deliveries,costs,cycles,odometers=filteredOdometers()) {
    const header=['Veículo','Registros','Finalizadas','Sucesso %','Faturamento','Custos','Saldo','KM','Custo por Entrega','Custo por KM','Ciclos','Entregas por Ciclo','Rota média min','Atrasadas','Taxa atraso %','Problemas','Nota qualidade'];
    const rows=state.vehicles.map(v=>{const all=deliveries.filter(x=>x.vehicleId===v.id),d=all.filter(deliveredToCustomer),c=costs.filter(x=>x.vehicleId===v.id),cy=cycles.filter(x=>x.vehicleId===v.id),odo=odometers.filter(x=>x.vehicleId===v.id),km=totalKmFromOdometers(odo),cost=sum(c.map(x=>x.value)),rev=revenueAttributedTo(all),delayed=all.filter(x=>deliveryCalc(x).delayed).length,problems=all.filter(recordHasProblem).length,quality=clamp(100-(percentage(delayed,all.length)+percentage(problems,all.length))/2,0,100);return[v.name,all.length,d.length,percentage(d.length,all.length),rev,cost,rev-cost,km,d.length?cost/d.length:0,km?cost/km:0,cy.length,cy.length?all.filter(x=>x.cycleId).length/cy.length:0,avg(all.map(x=>deliveryCalc(x).route)),delayed,percentage(delayed,all.length),problems,quality]});
    return [header,...rows.filter(r=>r.slice(1).some(Number))];
  }
  function buildEmployeeReportRows(deliveries) {
    const header=['Colaborador','Função','Registros','Finalizadas','Sucesso %','Faturamento','Espera média min','Até cliente média min','Rota média min','Devoluções','Reagendamentos','Atrasadas','Taxa atraso %','Problemas','Nota qualidade'];
    const rows=state.employees.map(e=>{const d=deliveries.filter(x=>x.driverId===e.id),final=d.filter(deliveredToCustomer),delayed=d.filter(x=>deliveryCalc(x).delayed).length,problems=d.filter(recordHasProblem).length,quality=clamp(100-(percentage(delayed,d.length)+percentage(problems,d.length))/2,0,100);return[e.name,e.role,d.length,final.length,percentage(final.length,d.length),revenueAttributedTo(d),avg(d.map(x=>deliveryCalc(x).wait)),avg(d.map(x=>deliveryCalc(x).toClient)),avg(d.map(x=>deliveryCalc(x).route)),d.filter(x=>x.status==='Devolvida').length,d.filter(x=>x.scheduleKind==='Reagendada').length,delayed,percentage(delayed,d.length),problems,quality]});
    return [header,...rows.filter(r=>r.slice(2).some(Number))];
  }
  function buildNeighborhoodReportRows(deliveries) {
    const header=['Bairro','Registros','Compras entregues','Sucesso %','Faturamento','Espera média min','Rota média min','Endereço Errado','Programações registradas','Reagendamentos registrados','Programadas abertas','Reagendadas abertas','Entregues após programação','Devoluções','Atrasadas','Taxa atraso %','Taxa Devolução %','Taxa Problemas %','Nota qualidade'];
    return [header,...buildNeighborhoodRows(deliveries).map(r=>[r.name,r.totalRecords,r.deliveries,percentage(r.deliveries,r.totalPurchases),r.revenue,r.avgWait,r.avgRoute,r.wrongAddress,r.scheduled,r.rescheduled,r.scheduledOpen,r.rescheduledOpen,r.scheduledDelivered,r.devolutions,r.delayed,percentage(r.delayed,r.totalRecords),r.returnRate,r.problemRate,clamp(100-(percentage(r.delayed,r.totalRecords)+r.problemRate)/2,0,100)])];
  }

  function buildSpreadsheetML(sheets) {
    const xmlEsc=v=>String(v??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    const dataType=v=>typeof v==='number'&&Number.isFinite(v)?'Number':'String';
    const normalizedLabel=value=>String(value??'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const cellFormat=(headers,row,rowIndex,columnIndex,value)=>{
      if(rowIndex===0) return {style:'Header',value,type:'String'};
      if(dataType(value)!=='Number') return {style:'Default',value,type:'String'};
      const rawLabel=headers[0]==='Indicador'&&columnIndex===1?row[0]:headers[columnIndex];
      const label=normalizedLabel(rawLabel);
      if(/%|percentual/.test(label)) return {style:'Percent',value:Number(value)/100,type:'Number'};
      if(/r\$|faturamento|reembols|receita|custos?$|saldo|^valor$|taxa cobrada|taxa registrada|taxa media|taxas vinculadas|custo por/.test(label)) return {style:'Currency',value,type:'Number'};
      if(/saldo do prazo/.test(label)) return {style:'Minutes',value,type:'Number'};
      if(/\bmin\b|em minutos|tempo min/.test(label)) return {style:'Duration',value:Number(value)/1440,type:'Number'};
      if(/\bkm\b|quilometragem/.test(label)) return {style:'Km',value,type:'Number'};
      return {style:Number.isInteger(Number(value))?'Integer':'Number',value,type:'Number'};
    };
    const styles=`<Styles>
      <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDE5EA"/></Borders></Style>
      <Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Calibri" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#173B5B" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#F2B523"/></Borders></Style>
      <Style ss:ID="Integer"><Alignment ss:Vertical="Center"/><NumberFormat ss:Format="0"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDE5EA"/></Borders></Style>
      <Style ss:ID="Number"><Alignment ss:Vertical="Center"/><NumberFormat ss:Format="0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDE5EA"/></Borders></Style>
      <Style ss:ID="Currency"><Alignment ss:Vertical="Center"/><NumberFormat ss:Format="&quot;R$&quot; #,##0.00;[Red]-&quot;R$&quot; #,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDE5EA"/></Borders></Style>
      <Style ss:ID="Percent"><Alignment ss:Vertical="Center"/><NumberFormat ss:Format="0.0%"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDE5EA"/></Borders></Style>
      <Style ss:ID="Duration"><Alignment ss:Vertical="Center"/><NumberFormat ss:Format="[h]&quot;h &quot;mm&quot;min&quot;"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDE5EA"/></Borders></Style>
      <Style ss:ID="Minutes"><Alignment ss:Vertical="Center"/><NumberFormat ss:Format="0 &quot;min&quot;"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDE5EA"/></Borders></Style>
      <Style ss:ID="Km"><Alignment ss:Vertical="Center"/><NumberFormat ss:Format="0.00 &quot;km&quot;"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DDE5EA"/></Borders></Style>
    </Styles>`;
    const sheetXml=Object.entries(sheets).map(([name,rows])=>{
      const maxColumns=Math.max(...rows.map(row=>row.length),1);
      const headers=rows[0]||[];
      const columns=Array.from({length:maxColumns},(_,index)=>{
        const longest=Math.max(...rows.map(row=>String(row[index]??'').length),8);
        return `<Column ss:AutoFitWidth="0" ss:Width="${Math.min(Math.max(longest*5.6,58),210)}"/>`;
      }).join('');
      const body=rows.map((row,rowIndex)=>`<Row ss:AutoFitHeight="1">${row.map((value,columnIndex)=>{const formatted=cellFormat(headers,row,rowIndex,columnIndex,value);return `<Cell ss:StyleID="${formatted.style}"><Data ss:Type="${formatted.type}">${xmlEsc(formatted.value)}</Data></Cell>`;}).join('')}</Row>`).join('');
      const options='<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions>';
      const autoFilter=rows.length>1?`<AutoFilter x:Range="R1C1:R${rows.length}C${maxColumns}" xmlns="urn:schemas-microsoft-com:office:excel"/>`:'';
      return `<Worksheet ss:Name="${xmlEsc(name.slice(0,31))}"><Table>${columns}${body}</Table>${options}${autoFilter}</Worksheet>`;
    }).join('');
    return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${styles}${sheetXml}</Workbook>`;
  }

  function printReport() {
    const r=reportRangeFromForm();
    const analytics=buildReportAnalytics(r);
    const {deliveries,roots,scheduleSummaries,deliveryInsights,movementForecast,costs,odometers,current,comparisonRows,monthlyRows,dayRows,hourRows,customerRows,qualityRows,rankingRows}=analytics;
    const allRecords=scoped(state.deliveries);
    const deliveredRoots=roots.filter(root=>rootWasFinalized(root,allRecords));
    const outcomeFor=root=>purchaseOutcome(root,allRecords);
    const fin=financialsForRange(r);
    const nb=buildNeighborhoodRows(deliveries).slice(0,10);
    const peakHour=hourRows.slice(1).sort((a,b)=>b[1]-a[1])[0];
    const reportPeakDate=deliveryInsights.reportPeak?.date||'';
    const reportPeakWeekday=reportPeakDate?['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'][reportDate(reportPeakDate).getDay()]:'';
    const recurringCustomers=customerRows.slice(1).filter(row=>row[3]==='SIM').length;
    const completeIdentification=roots.filter(d=>d.coupon&&d.docNo&&d.cashierNo&&d.neighborhoodId&&d.purchaseTime).length;
    const statusPrintRows=[...groupItems(roots,root=>outcomeFor(root).key).entries()].map(([label,rows])=>({label,value:rows.length})).sort((a,b)=>b.value-a.value),statusMax=Math.max(...statusPrintRows.map(row=>row.value),1);
    const slaPrintRows=[{label:'Compra → saída',within:current.departureWithin,outside:current.delayed,total:current.departureCalculable,rate:current.departureComplianceRate,limit:fmtMinutes(Number(state.settings.delayMinutes||120))},{label:'Compra → cliente',within:current.completionWithin,outside:current.completionDelayed,total:current.completionCalculable,rate:current.completionComplianceRate,limit:fmtMinutes(Number(state.settings.completionLimitMinutes||210))}];
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Relatório completo</title><style>@page{size:landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#233743;padding:18px}h1{color:#173A5E;margin-bottom:4px}h2{color:#29495c;margin:24px 0 8px}p{margin-top:0}table{border-collapse:collapse;width:100%;margin-top:8px;page-break-inside:auto}tr{page-break-inside:avoid}th,td{border:1px solid #dfe7ec;padding:5px;font-size:9px;text-align:left;vertical-align:top}th{background:#173B5B;color:#fff}.cards{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.c{border:1px solid #dfe7ec;border-radius:8px;padding:9px}.c small{color:#71808c}.c strong{display:block;font-size:16px;margin-top:3px}.muted{color:#71808c}.visual-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;page-break-inside:avoid}.visual-card{border:1px solid #dfe7ec;border-radius:10px;padding:12px}.visual-card h3{margin:0 0 10px;color:#173B5B;font-size:13px}.sla-item{margin-bottom:12px}.sla-head{display:flex;justify-content:space-between;gap:10px;font-size:10px;margin-bottom:5px}.sla-head span{color:#617582}.bar{height:13px;background:#e8eef2;border-radius:99px;overflow:hidden;display:flex}.bar .ok{background:#3E9363}.bar .bad{background:#C9575C}.legend{font-size:8px;color:#617582;margin-top:4px}.status-print{display:grid;gap:7px}.status-print>div{display:grid;grid-template-columns:100px 1fr 34px;gap:7px;align-items:center;font-size:9px}.status-print .track{height:10px;background:#e8eef2;border-radius:99px;overflow:hidden}.status-print i{height:100%;display:block;background:#E9AA1B;border-radius:99px}@media print{button{display:none}}</style></head><body>
      <h1>Controle de Entregas • Relatório completo</h1><p>${dateBR(r.start)} a ${dateBR(r.end)} • ${esc(modeLabel())} • V${APP_VERSION}</p>
      <div class="cards">
        <div class="c"><small>Compras</small><strong>${roots.length}</strong></div><div class="c"><small>Entregues no cliente</small><strong>${deliveredRoots.length}</strong></div><div class="c"><small>Em rota</small><strong>${roots.filter(root=>outcomeFor(root).key==='Em rota').length}</strong></div><div class="c"><small>Programadas abertas</small><strong>${scheduleSummaries.filter(summary=>summary.open).length}</strong></div><div class="c"><small>Entregues após programação</small><strong>${scheduleSummaries.filter(summary=>summary.delivered).length}</strong></div><div class="c"><small>Saída &gt; 2h</small><strong>${current.delayed}</strong></div>
        <div class="c"><small>Faturamento bruto</small><strong>${money(fin.gross)}</strong></div><div class="c"><small>Reembolsos</small><strong>${money(fin.refundTotal)}</strong></div><div class="c"><small>Faturamento líquido</small><strong>${money(fin.net)}</strong></div><div class="c"><small>Custos</small><strong>${money(sum(costs.map(c=>c.value)))}</strong></div><div class="c"><small>KM total</small><strong>${number(totalKmFromOdometers(odometers),1)} km</strong></div>
        <div class="c"><small>Sucesso na 1ª tentativa</small><strong>${percent(current.firstAttemptRate)}</strong></div><div class="c"><small>Entrega &gt; 3h30</small><strong>${current.completionDelayed}</strong></div><div class="c"><small>Fora do padrão 3h30</small><strong>${percent(current.completionDelayRate)}</strong></div><div class="c"><small>Taxa de problemas</small><strong>${percent(current.problemRate)}</strong></div><div class="c"><small>Identificação completa</small><strong>${percent(percentage(completeIdentification,roots.length))}</strong></div><div class="c"><small>Clientes recorrentes</small><strong>${recurringCustomers}</strong></div>
      </div>
      <h2>Painel visual dos indicadores</h2><div class="visual-grid"><div class="visual-card"><h3>Cumprimento dos prazos</h3>${slaPrintRows.map(row=>`<div class="sla-item"><div class="sla-head"><strong>${row.label}</strong><span>${percent(row.rate)} dentro • limite ${row.limit}</span></div><div class="bar"><i class="ok" style="width:${percentage(row.within,row.total)}%"></i><i class="bad" style="width:${percentage(row.outside,row.total)}%"></i></div><div class="legend">${row.within} dentro do padrão • ${row.outside} fora • ${row.total} calculáveis</div></div>`).join('')}</div><div class="visual-card"><h3>Situação consolidada das compras</h3><div class="status-print">${statusPrintRows.map(row=>`<div><span>${esc(row.label)}</span><div class="track"><i style="width:${row.value/statusMax*100}%"></i></div><strong>${row.value}</strong></div>`).join('')}</div></div></div>
      <h2>Principais insights</h2><table><tr><th>Indicador</th><th>Resultado</th><th>Leitura operacional</th></tr><tr><td>Próximo dia previsto de maior movimento</td><td>${movementForecast.peakDay?`${dateBR(movementForecast.peakDay.date)} • ${esc(movementForecast.peakDay.dayName)}`:'Sem previsão'}</td><td>${movementForecast.peakDay?`Cerca de ${number(movementForecast.peakDay.estimate,1)} entrega(s) • confiança ${movementForecast.confidence}`:'Aguardando histórico ou programações'}</td></tr><tr><td>Próxima semana prevista de maior movimento</td><td>${movementForecast.peakWeek?`${dateBR(movementForecast.peakWeek.start)} a ${dateBR(movementForecast.peakWeek.end)}`:'Sem previsão'}</td><td>${movementForecast.peakWeek?`Cerca de ${number(movementForecast.peakWeek.estimate,1)} entrega(s) • ${movementForecast.peakWeek.scheduled} já programada(s)`:'Aguardando histórico ou programações'}</td></tr><tr><td>Dia da semana previsto como mais forte</td><td>${esc(movementForecast.peakWeekday?.label||'Sem previsão')}</td><td>${movementForecast.peakWeekday?`Média prevista de ${number(movementForecast.peakWeekday.average,1)} entrega(s) por dia nas próximas 5 semanas`:'Ainda não há base suficiente'}</td></tr><tr><td>Data com mais entregas</td><td>${reportPeakDate?`${dateBR(reportPeakDate)} • ${esc(reportPeakWeekday)}`:'Sem dados'}</td><td>${deliveryInsights.reportPeak?`${deliveryInsights.reportPeak.count} entrega(s) no período deste relatório`:'Ainda não há entrega finalizada no período'}</td></tr><tr><td>Dia da semana com maior média</td><td>${esc(deliveryInsights.peakWeekday?.label||'Sem dados')}</td><td>${deliveryInsights.peakWeekday?`Média de ${number(deliveryInsights.peakWeekday.average,1)} entrega(s) por ${deliveryInsights.peakWeekday.label.toLocaleLowerCase('pt-BR')}`:'Ainda não há base suficiente'}</td></tr><tr><td>Semana do mês com maior média</td><td>${deliveryInsights.peakWeekOfMonth?`${esc(deliveryInsights.peakWeekOfMonth.label)} • ${esc(deliveryInsights.peakWeekOfMonth.detail)}`:'Sem dados'}</td><td>${deliveryInsights.peakWeekOfMonth?`Média diária de ${number(deliveryInsights.peakWeekOfMonth.average,1)} entrega(s) nessa semana do mês`:'Ainda não há base suficiente'}</td></tr><tr><td>Base usada nas médias</td><td>${deliveryInsights.start?`${dateBR(deliveryInsights.start)} a ${dateBR(deliveryInsights.end)}`:'Sem dados'}</td><td>${deliveryInsights.start?`${deliveryInsights.deliveredCount} entrega(s) em ${deliveryInsights.calendarDays} dia(s) de calendário • limite de 1 ano`:'As médias aparecerão conforme os dados forem preenchidos'}</td></tr><tr><td>Horário de pico</td><td>${esc(peakHour?.[0]||'Sem dados')}</td><td>${peakHour?`${peakHour[1]} compra(s) nessa faixa`:'Ainda não há base suficiente'}</td></tr><tr><td>Compra → saída média</td><td>${fmtMinutes(current.avgWait)}</td><td>Padrão: até ${fmtMinutes(Number(state.settings.delayMinutes||120))}</td></tr><tr><td>Cumprimento compra → saída</td><td>${percent(current.departureComplianceRate)}</td><td>${current.departureWithin} dentro de ${current.departureCalculable} calculáveis</td></tr><tr><td>Compra → cliente média</td><td>${fmtMinutes(current.avgPurchaseToClient)}</td><td>Padrão: até ${fmtMinutes(Number(state.settings.completionLimitMinutes||210))}</td></tr><tr><td>Cumprimento compra → cliente</td><td>${percent(current.completionComplianceRate)}</td><td>${current.completionWithin} dentro de ${current.completionCalculable} calculáveis</td></tr><tr><td>Rota média</td><td>${fmtMinutes(current.avgRoute)}</td><td>Tempo entre saída e retorno à loja</td></tr></table>
      <h2>Previsão de movimento • próximas 5 semanas</h2><table><thead><tr><th>Semana</th><th>Período</th><th>Entregas previstas</th><th>Programadas já conhecidas</th><th>Média prevista por dia</th></tr></thead><tbody>${movementForecast.weeks.map(week=>`<tr><td>Semana ${week.week}</td><td>${dateBR(week.start)} a ${dateBR(week.end)}</td><td>${number(week.estimate,1)}</td><td>${week.scheduled}</td><td>${number(week.dailyAverage,1)}</td></tr>`).join('')}</tbody></table><p class="muted">Estimativa calculada com até 365 dias de histórico. As programações abertas funcionam como volume mínimo conhecido. Confiança atual: ${esc(movementForecast.confidence)}.</p>
      <h2>Comparação com o período anterior</h2><table><thead><tr>${comparisonRows[0].map(value=>`<th>${esc(value)}</th>`).join('')}</tr></thead><tbody>${comparisonRows.slice(1).map(row=>`<tr><td>${esc(row[0])}</td><td>${formattedReportValue(row[0],row[1])}</td><td>${formattedReportValue(row[0],row[2])}</td><td>${formattedReportValue(row[0],row[3])}</td><td>${typeof row[4]==='number'?percent(row[4]):esc(row[4]||'—')}</td></tr>`).join('')}</tbody></table>
      <h2>Resumo mensal</h2><table><thead><tr>${monthlyRows[0].map(value=>`<th>${esc(value)}</th>`).join('')}</tr></thead><tbody>${monthlyRows.slice(1).map(row=>`<tr>${row.map((value,index)=>`<td>${formattedReportValue(monthlyRows[0][index],value)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <h2>Ranking operacional</h2><table><thead><tr>${rankingRows[0].map(value=>`<th>${esc(value)}</th>`).join('')}</tr></thead><tbody>${rankingRows.slice(1,16).map(row=>`<tr>${row.map((value,index)=>`<td>${formattedReportValue(rankingRows[0][index],value)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <h2>Programações e reagendamentos conferidos</h2><table><thead><tr><th>Origem</th><th>Último agendamento</th><th>Tipo</th><th>Compra / cupom</th><th>Cliente</th><th>Situação consolidada</th><th>Entrega no cliente</th><th>Histórico ligado</th></tr></thead><tbody>${scheduleSummaries.length?scheduleSummaries.map(summary=>{const delivered=summary.delivered?summary.outcome.record:null;return`<tr><td>${dateBR(summary.root.date)}</td><td>${scheduledDateTimeLabel(summary.latestEvent)}<br><span class="muted">${esc(summary.latestEvent.scheduleNotes||'Sem detalhes adicionais')} • fora do indicador comum de atraso</span></td><td>${esc(summary.kind)}</td><td>Compra ${esc(summary.root.orderNo||'—')}<br><span class="muted">Cupom ${esc(summary.root.coupon||'—')}</span></td><td>${esc(summary.root.customerName||'—')}<br><span class="muted">${esc(summary.root.customerPhone||'—')}</span></td><td><strong>${esc(summary.situation)}</strong></td><td>${delivered?`${dateBR(delivered.date)} • ${esc(delivered.finalizationTime||'horário não informado')}<br><span class="muted">Tentativa ${delivered.attemptNo||1}</span>`:'—'}</td><td>${summary.events.length} programação(ões)<br><span class="muted">${summary.chain.length} tentativa(s)</span></td></tr>`}).join(''):'<tr><td colspan="8">Nenhuma programação registrada no período.</td></tr>'}</tbody></table>
      <h2>Entregas e identificação das compras</h2>
      <table><thead><tr><th>Data</th><th>Compra</th><th>Nº do cupom</th><th>DOC</th><th>Caixa</th><th>Cliente / telefone</th><th>Bairro / endereço</th><th>Status do registro / situação da compra</th><th>Entregador / veículo</th><th>Entrada / saída / finalização / retorno</th><th>Tempos e padrão</th><th>Taxa / reembolso</th><th>Programação / retorno</th></tr></thead><tbody>${deliveries.map(d=>{const calc=deliveryCalc(d),progress=completionProgress(d),outcome=outcomeFor(d);return `<tr><td>${dateBR(d.date)}</td><td>${esc(d.orderNo||'—')}</td><td>${esc(d.coupon||'—')}</td><td>${esc(d.docNo||'—')}</td><td>${esc(d.cashierNo||'—')}</td><td>${esc(d.customerName||'—')}<br><span class="muted">${esc(d.customerPhone||'—')}</span></td><td>${esc(neighborhood(d.neighborhoodId)?.name||'—')}<br><span class="muted">${esc(deliveryAddressLine(d,true)||'Endereço exato não informado')}</span></td><td>${d.priority?'<strong>★ PRIORIDADE</strong><br>':''}${esc(d.status||'—')}<br><strong>${esc(outcome.label)}</strong></td><td>${esc(employee(d.driverId)?.name||'—')}<br><span class="muted">${esc(vehicle(d.vehicleId)?.name||'—')}</span></td><td>${d.purchaseTime||'—'} / ${d.departureTime||'—'} / ${d.finalizationTime||'—'} / ${d.returnTime||'—'}</td><td>${calc.slaExempt?'Entrega agendada • fora do indicador comum de atraso':`Compra → saída: ${fmtMinutes(calc.wait)} (${calc.wait===null?'não calculável':calc.delayed?'fora':'OK'})<br>Compra → cliente: ${fmtMinutes(calc.purchaseToClient)} (${calc.purchaseToClient===null?'não calculável':calc.completionDelayed?'fora':'OK'})<br>Prazo agora: ${progress.balance===null?'não calculável':progress.balance>=0?`${fmtMinutes(progress.balance)} restantes`:`${fmtMinutes(Math.abs(progress.balance))} acima`}`}</td><td>${money(rootDelivery(d)?.fee||d.fee)} / ${money(rootDelivery(d)?.refundAmount||0)}</td><td>${d.scheduledDate?`${scheduledDateTimeLabel(d)} • ${esc(d.scheduleKind||'Programada')}<br><span class="muted">${esc(d.scheduleNotes||'')}</span>`:'—'}${d.returnedUndelivered?`<br><strong>Voltou sem entrega:</strong> ${esc(reason(d.returnReasonId)?.name||d.returnReasonText||'Motivo não informado')}`:''}</td></tr>`}).join('')}</tbody></table>
      <h2>Análise por bairro</h2><table><tr><th>Bairro</th><th>Compras entregues</th><th>Faturamento</th><th>Endereço errado</th><th>Programações registradas</th><th>Reagendamentos registrados</th><th>Programadas abertas</th><th>Reagendadas abertas</th><th>Entregues após programação</th><th>Devoluções</th><th>Saída &gt; 2h</th><th>Taxa de problemas</th></tr>${nb.map(row=>`<tr><td>${esc(row.name)}</td><td>${row.deliveries}</td><td>${money(row.revenue)}</td><td>${row.wrongAddress}</td><td>${row.scheduled}</td><td>${row.rescheduled}</td><td>${row.scheduledOpen}</td><td>${row.rescheduledOpen}</td><td>${row.scheduledDelivered}</td><td>${row.devolutions}</td><td>${row.delayed}</td><td>${percent(row.problemRate)}</td></tr>`).join('')}</table>
      <h2>Qualidade dos dados</h2><table><thead><tr>${qualityRows[0].map(value=>`<th>${esc(value)}</th>`).join('')}</tr></thead><tbody>${qualityRows.slice(1).map(row=>`<tr>${row.map((value,index)=>`<td>${formattedReportValue(qualityRows[0][index],value)}</td>`).join('')}</tr>`).join('')}</tbody></table>
      <p class="muted" style="margin-top:16px">O arquivo Excel contém 31 abas, incluindo previsão de movimento, previsão da agenda, SLA dos prazos, fluxo operacional, resumo mensal, metodologia, dados completos, comparação, rankings, qualidade, financeiro, custos, ciclos, KM, equipe, bairros, pendências e histórico.</p><script>window.onload=()=>window.print()<\/script></body></html>`;
    const w=window.open('','_blank');w.document.write(html);w.document.close();
  }

  function downloadBackup() {
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    downloadBlob(blob,`Backup_Controle_Entregas_${todayISO()}.json`);
    toast('Backup gerado.','success');
  }

  function downloadPreUpdateBackup() {
    if (!preUpdateBackup?.state) { toast('Nenhum backup anterior à atualização está disponível.','warning'); return; }
    const version=String(preUpdateBackup.fromVersion || 'anterior').replace(/[^0-9A-Za-z.-]/g,'_');
    const blob=new Blob([JSON.stringify(preUpdateBackup.state,null,2)],{type:'application/json'});
    downloadBlob(blob,`Backup_Antes_Atualizacao_V${version}_${todayISO()}.json`);
    toast('Backup anterior à atualização gerado.','success');
  }

  const BACKUP_ARRAY_KEYS = ['vehicles','neighborhoods','employees','costCategories','reasons','deliveries','cycles','routeTracks','odometerLogs','costs','audit','dayClosures','trash'];
  const BACKUP_ROOT_KEYS = new Set(['meta','settings',...BACKUP_ARRAY_KEYS]);
  const BACKUP_ID_KEYS = new Set(['id','rootId','parentId','vehicleId','neighborhoodId','employeeId','driverId','cycleId','categoryId','responsibleId','reasonId','trashId']);

  function sanitizeBackupTree(value, path='backup', depth=0) {
    if (depth > 18) throw new Error('O arquivo possui uma estrutura profunda demais.');
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`Número inválido em ${path}.`);
      return value;
    }
    if (typeof value === 'string') {
      if (value.length > 100000) throw new Error(`Texto excessivamente longo em ${path}.`);
      return value;
    }
    if (Array.isArray(value)) {
      if (value.length > 100000) throw new Error(`Quantidade excessiva de registros em ${path}.`);
      return value.map((item,index)=>sanitizeBackupTree(item,`${path}[${index}]`,depth+1));
    }
    if (!value || typeof value !== 'object') throw new Error(`Tipo de dado inválido em ${path}.`);
    const entries = Object.entries(value);
    if (entries.length > 500) throw new Error(`Quantidade excessiva de campos em ${path}.`);
    const clean = {};
    for (const [key,item] of entries) {
      if (['__proto__','prototype','constructor'].includes(key)) throw new Error(`Campo inseguro encontrado em ${path}.`);
      const cleanItem = sanitizeBackupTree(item,`${path}.${key}`,depth+1);
      if (BACKUP_ID_KEYS.has(key) && cleanItem !== '' && cleanItem !== null && cleanItem !== undefined) {
        if (typeof cleanItem !== 'string' || !/^[A-Za-z0-9_.:\/-]{1,180}$/.test(cleanItem)) throw new Error(`Identificador inválido em ${path}.${key}.`);
      }
      clean[key] = cleanItem;
    }
    return clean;
  }

  function backupSummary(data) {
    return {
      deliveries:data.deliveries?.length || 0,
      cycles:data.cycles?.length || 0,
      routes:data.routeTracks?.length || 0,
      odometers:data.odometerLogs?.length || 0,
      costs:data.costs?.length || 0,
      trash:data.trash?.length || 0,
      audit:data.audit?.length || 0
    };
  }

  function validateBackupData(rawData) {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) throw new Error('O arquivo não contém um backup reconhecido.');
    const clean = sanitizeBackupTree(rawData);
    const unknownKeys = Object.keys(clean).filter(key=>!BACKUP_ROOT_KEYS.has(key));
    if (unknownKeys.length) throw new Error(`O arquivo contém campos desconhecidos: ${unknownKeys.join(', ')}.`);
    if (!clean.meta || !clean.settings || !Array.isArray(clean.deliveries)) {
      throw new Error('O arquivo não possui a estrutura mínima de um backup do Controle de Entregas.');
    }
    for (const key of BACKUP_ARRAY_KEYS) {
      if (clean[key] !== undefined && !Array.isArray(clean[key])) throw new Error(`A seção ${key} está em formato inválido.`);
      if (Array.isArray(clean[key]) && clean[key].some(item=>!item || typeof item !== 'object' || Array.isArray(item))) {
        throw new Error(`A seção ${key} contém registros inválidos.`);
      }
    }
    if (clean.meta !== undefined && (!clean.meta || typeof clean.meta !== 'object' || Array.isArray(clean.meta))) throw new Error('Os metadados do backup são inválidos.');
    if (clean.settings !== undefined && (!clean.settings || typeof clean.settings !== 'object' || Array.isArray(clean.settings))) throw new Error('As configurações do backup são inválidas.');
    const backupVersion = String(clean.meta?.version || 'versão anterior');
    const backupMajor = Number(backupVersion.split('.')[0]);
    const currentMajor = Number(APP_VERSION.split('.')[0]);
    if (Number.isFinite(backupMajor) && backupMajor > currentMajor) throw new Error(`Este backup é da versão ${backupVersion}, mais nova que o aplicativo atual.`);
    return { state:migrateState(clean), version:backupVersion, originalSummary:backupSummary(clean) };
  }

  function backupSummaryCard(title, summary) {
    return `<article class="restore-preview-card"><strong>${esc(title)}</strong><dl>
      <div><dt>Entregas</dt><dd>${summary.deliveries}</dd></div>
      <div><dt>Ciclos</dt><dd>${summary.cycles}</dd></div>
      <div><dt>Rotas GPS</dt><dd>${summary.routes}</dd></div>
      <div><dt>KM diário</dt><dd>${summary.odometers}</dd></div>
      <div><dt>Custos</dt><dd>${summary.costs}</dd></div>
      <div><dt>Lixeira</dt><dd>${summary.trash}</dd></div>
      <div><dt>Histórico</dt><dd>${summary.audit}</dd></div>
    </dl></article>`;
  }

  function restoreBackup(file) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast('O backup excede o limite de 50 MB.','error');
      return;
    }
    const reader=new FileReader();
    reader.onerror=()=>toast('Não foi possível ler o arquivo de backup.','error');
    reader.onload=()=>{
      try {
        const validation=validateBackupData(JSON.parse(reader.result));
        const currentSummary=backupSummary(state);
        openModal('Confirmar restauração','Confira os dados antes de substituir a operação atual.',`
          <div class="restore-warning"><strong>Atenção: os dados atuais serão substituídos.</strong><p>Antes da troca, o sistema baixará automaticamente uma cópia de segurança dos dados que estão neste dispositivo.</p></div>
          <div class="restore-preview-grid">
            ${backupSummaryCard('Dados atuais',currentSummary)}
            ${backupSummaryCard('Dados do arquivo',validation.originalSummary)}
          </div>
          <div class="form-note">Arquivo: <strong>${esc(file.name || 'backup.json')}</strong><br>Versão identificada: <strong>${esc(validation.version)}</strong></div>
          <div class="form-actions"><button type="button" class="btn secondary" id="cancelRestoreBtn">Cancelar</button><button type="button" class="btn danger" id="confirmRestoreBtn">Substituir e restaurar</button></div>
        `,'SEGURANÇA DOS DADOS');
        $('#cancelRestoreBtn').addEventListener('click',closeModal);
        $('#confirmRestoreBtn').addEventListener('click',async()=>{
          const button=$('#confirmRestoreBtn');
          button.disabled=true;
          button.textContent='Restaurando...';
          const previousState=state;
          const previousJson=JSON.stringify(previousState,null,2);
          try {
            downloadBlob(new Blob([previousJson],{type:'application/json'}),`Backup_Antes_Restauracao_${todayISO()}.json`);
            state=validation.state;
            const autoCycleResult=autoIdentifyCyclesSync();
            await saveState(`Backup restaurado com segurança${autoCycleResult.cyclesCreated?` • ${autoCycleResult.cyclesCreated} ciclo(s) automático(s) identificado(s)`:''}`);
            refreshYearOptions();
            refreshWeekOptions();
            closeModal();
            render();
            toast(autoCycleResult.cyclesCreated?'Backup restaurado e ciclos automáticos identificados.':'Backup restaurado com sucesso.','success');
          } catch (err) {
            console.error(err);
            state=previousState;
            await idbSet(STATE_KEY,previousState).catch(console.error);
            button.disabled=false;
            button.textContent='Substituir e restaurar';
            toast('A restauração falhou e os dados anteriores foram mantidos.','error');
          }
        });
      } catch(err) {
        console.error(err);
        toast(err.message || 'Arquivo de backup inválido.','error');
      }
    };
    reader.readAsText(file);
  }
  function downloadBlob(blob,filename) { const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

  function toast(message,type='') {
    const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;$('#toastStack').appendChild(el);setTimeout(()=>el.remove(),3300);
  }

  window.App = { navigate, openDeliveryModal, openCycleModal, openCostModal, showTrace: coupon => showTraceResults({ coupon }) };
  initialize();
})();
