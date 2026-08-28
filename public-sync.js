/* ================================================================
   NILO ENTREGAS • V32.1
   Sincronização + backup automático reforçado
   - Cada gravação local do estado entra na fila de sincronização.
   - O Supabase mantém histórico por trigger a cada INSERT/UPDATE/DELETE.
   - Bloqueia recebimento remoto que reduziria os dados de forma perigosa.
   - Mantém fila offline e envia quando a internet voltar.
   - Sem usuário e sem senha.
   ================================================================ */
(() => {
  'use strict';

  const DB_NAME = 'controle_entregas_nx';
  const DB_VERSION = 1;
  const STORE_NAME = 'app_state';
  const STATE_KEY = 'main';

  const SUPABASE_URL = 'https://vwwkzenvcxedxiuopsgv.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Vh9zdSxCUH0fMJOjf_G6Sw_UMU0t0to';
  const WORKSPACE_CODE = 'nilo-entregas';
  const TABLE = 'delivery_public_state';

  const CLIENT_ID = (() => {
    try {
      const key = 'nilo_public_sync_client_id';
      const found = localStorage.getItem(key);
      if (found) return found;
      const value = `public_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random()}`}`;
      localStorage.setItem(key, value);
      return value;
    } catch {
      return `public_${Date.now()}_${Math.random()}`;
    }
  })();

  let db = null;
  let client = null;
  let channel = null;
  let lastLocalFingerprint = '';
  let applyingRemote = false;
  let initialized = false;
  let realtimeStatus = 'CONNECTING';
  let syncBusy = false;
  let lastRemoteFingerprint = '';
  let saveHookInstalled = false;
  let flushRunning = false;
  const snapshotQueue = [];
  const queuedFingerprints = new Set();

  function fingerprint(value) {
    try { return JSON.stringify(value || null); }
    catch { return ''; }
  }

  function operationalCount(s) {
    if (!s || typeof s !== 'object') return 0;
    return ['deliveries','cycles','routeTracks','odometerLogs','costs','audit','dayClosures','trash']
      .reduce((n, k) => n + (Array.isArray(s[k]) ? s[k].length : 0), 0);
  }

  function collectionCount(s, key) {
    return Array.isArray(s?.[key]) ? s[key].length : 0;
  }

  function isUsableState(s) {
    return Boolean(s && typeof s === 'object' && (
      s.meta || s.settings || Array.isArray(s.deliveries)
    ));
  }

  function isDangerousRegression(incoming, current) {
    if (!isUsableState(incoming) || !isUsableState(current)) return false;

    const curDeliveries = collectionCount(current, 'deliveries');
    const inDeliveries = collectionCount(incoming, 'deliveries');
    const curCycles = collectionCount(current, 'cycles');
    const inCycles = collectionCount(incoming, 'cycles');
    const curOps = operationalCount(current);
    const inOps = operationalCount(incoming);

    // Regra crítica: nunca trocar uma base real por uma base vazia.
    if (curDeliveries >= 5 && inDeliveries === 0) return true;
    if (curCycles >= 3 && inCycles === 0 && curDeliveries > 0) return true;

    // Proteção contra redução muito brusca por sincronização corrompida/default.
    if (curOps >= 30 && inOps < curOps * 0.55 && (curOps - inOps) >= 20) return true;
    if (curDeliveries >= 20 && inDeliveries < curDeliveries * 0.55 && (curDeliveries - inDeliveries) >= 10) return true;

    return false;
  }

  function keepDirectAccess() {
    const shell = document.getElementById('appShell');
    if (shell && shell.getAttribute('aria-hidden') === 'true') shell.removeAttribute('aria-hidden');
    const account = document.getElementById('syncAccountBtn');
    if (account && !account.hidden) account.hidden = true;
  }

  function setConnectionUI(ok, text = '') {
    const dot = document.getElementById('connectionDot');
    const title = document.getElementById('connectionTitle');
    const subtitle = document.getElementById('connectionSubtitle');

    if (dot) {
      dot.classList.toggle('online', Boolean(ok));
      dot.classList.toggle('offline', !ok);
    }
    if (title) title.textContent = ok ? 'Backup automático ativo' : 'Trabalhando offline';
    if (subtitle) subtitle.textContent = ok
      ? (text || 'Dados sincronizados e protegidos no servidor')
      : 'As alterações ficam neste aparelho e serão enviadas quando a internet voltar';
  }

  function openDB() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const result = req.result;
        if (!result.objectStoreNames.contains(STORE_NAME)) result.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => { db = req.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  async function readLocal() {
    await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function writeLocal(value) {
    await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, STATE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function fetchRemote() {
    if (!client || !navigator.onLine) return null;
    const { data, error } = await client
      .from(TABLE)
      .select('workspace_code,payload,updated_at,updated_by')
      .eq('workspace_code', WORKSPACE_CODE)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function pushSnapshot(local) {
    if (!client || !navigator.onLine || applyingRemote || !isUsableState(local)) return false;
    while (syncBusy) await new Promise(r => setTimeout(r, 35));
    syncBusy = true;
    try {
      // Uma leitura remota antes do envio evita que um aparelho com estado vazio
      // substitua uma base real mesmo antes da proteção do banco agir.
      const remote = await fetchRemote().catch(() => null);
      if (remote?.payload && isDangerousRegression(local, remote.payload)) {
        console.warn('[NILO V32] envio bloqueado: estado local aparenta perda brusca de dados');
        setConnectionUI(true, 'Proteção contra perda de dados acionada');
        return false;
      }

      const body = {
        workspace_code: WORKSPACE_CODE,
        payload: local,
        updated_at: new Date().toISOString(),
        updated_by: CLIENT_ID
      };
      const { error } = await client
        .from(TABLE)
        .upsert(body, { onConflict: 'workspace_code' });
      if (error) throw error;
      lastLocalFingerprint = fingerprint(local);
      setConnectionUI(true, 'Alteração salva + ponto de recuperação criado');
      return true;
    } finally {
      syncBusy = false;
    }
  }

  function enqueueSnapshot(value) {
    if (applyingRemote || !isUsableState(value)) return;
    const fp = fingerprint(value);
    if (!fp || fp === lastLocalFingerprint || queuedFingerprints.has(fp)) return;
    snapshotQueue.push({ value, fp });
    queuedFingerprints.add(fp);
    flushQueue();
  }

  async function flushQueue() {
    if (flushRunning || !navigator.onLine || !client) return;
    flushRunning = true;
    try {
      while (snapshotQueue.length && navigator.onLine) {
        const item = snapshotQueue[0];
        try {
          const sent = await pushSnapshot(item.value);
          if (!sent) {
            // Se foi bloqueado por proteção, não fica repetindo indefinidamente.
            snapshotQueue.shift();
            queuedFingerprints.delete(item.fp);
            continue;
          }
          snapshotQueue.shift();
          queuedFingerprints.delete(item.fp);
        } catch (err) {
          console.warn('[NILO V32] backup automático pendente', err);
          setConnectionUI(false);
          break;
        }
      }
    } finally {
      flushRunning = false;
    }
  }

  function installIndexedDBSaveHook() {
    if (saveHookInstalled || !window.IDBObjectStore?.prototype?.put) return;
    saveHookInstalled = true;

    const proto = IDBObjectStore.prototype;
    if (proto.__niloV32OriginalPut) return;
    const originalPut = proto.put;

    try {
      Object.defineProperty(proto, '__niloV32OriginalPut', {
        value: originalPut,
        configurable: false,
        enumerable: false,
        writable: false
      });
    } catch {}

    proto.put = function(value, key) {
      const request = originalPut.apply(this, arguments);
      try {
        const targetStore = this.name === STORE_NAME;
        const targetKey = key === STATE_KEY;
        if (targetStore && targetKey) {
          request.addEventListener('success', () => {
            if (!applyingRemote) {
              // Guardamos uma cópia do snapshot naquele exato salvamento.
              // O envio é independente da próxima alteração do app.
              try { enqueueSnapshot(typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))); }
              catch { enqueueSnapshot(value); }
            }
          }, { once: true });
        }
      } catch (err) {
        console.warn('[NILO V32] hook de backup local pendente', err);
      }
      return request;
    };
  }

  async function applyRemote(remoteState) {
    if (!isUsableState(remoteState)) return false;

    const remoteFp = fingerprint(remoteState);
    if (!remoteFp || remoteFp === lastRemoteFingerprint) return false;

    const current = await readLocal();
    const currentFp = fingerprint(current);

    if (currentFp === remoteFp) {
      lastLocalFingerprint = currentFp;
      lastRemoteFingerprint = remoteFp;
      return false;
    }

    if (isDangerousRegression(remoteState, current)) {
      console.warn('[NILO V32] atualização remota rejeitada: reduziria dados de forma perigosa');
      setConnectionUI(true, 'Proteção contra perda de dados acionada');
      // O estado local é mantido e volta para a fila de envio.
      if (isUsableState(current)) enqueueSnapshot(current);
      return false;
    }

    applyingRemote = true;
    try {
      await writeLocal(remoteState);
      lastLocalFingerprint = remoteFp;
      lastRemoteFingerprint = remoteFp;
      setConnectionUI(true, 'Atualização segura recebida de outro dispositivo');
    } finally {
      applyingRemote = false;
    }

    try { sessionStorage.setItem('nilo_v32_remote_fp', remoteFp.slice(0, 180)); } catch {}
    setTimeout(() => location.reload(), 450);
    return true;
  }

  async function initialReconcile() {
    const local = await readLocal();
    lastLocalFingerprint = fingerprint(local);

    const remote = await fetchRemote();
    const remoteState = remote?.payload;
    const remoteHasData = isUsableState(remoteState) && Object.keys(remoteState || {}).length > 0;
    const localHasData = isUsableState(local);

    if (!remoteHasData && localHasData) {
      enqueueSnapshot(local);
      return;
    }
    if (remoteHasData && !localHasData) {
      await applyRemote(remoteState);
      return;
    }
    if (!remoteHasData && !localHasData) return;

    const localFp = fingerprint(local);
    const remoteFp = fingerprint(remoteState);
    if (localFp === remoteFp) {
      lastRemoteFingerprint = remoteFp;
      setConnectionUI(true, 'Dados atualizados e protegidos');
      return;
    }

    if (isDangerousRegression(local, remoteState)) {
      await applyRemote(remoteState);
      return;
    }
    if (isDangerousRegression(remoteState, local)) {
      enqueueSnapshot(local);
      return;
    }

    const localOps = operationalCount(local);
    const remoteOps = operationalCount(remoteState);

    if (localOps === 0 && remoteOps > 0) {
      await applyRemote(remoteState);
      return;
    }
    if (remoteOps === 0 && localOps > 0) {
      enqueueSnapshot(local);
      return;
    }

    const localTime = Date.parse(local?.meta?.updatedAt || local?.meta?.createdAt || 0) || 0;
    const remoteTime = Date.parse(remote?.updated_at || 0) || 0;

    if (remoteTime > localTime + 1500) await applyRemote(remoteState);
    else enqueueSnapshot(local);
  }

  function startLocalWatch() {
    // Fallback: mesmo que algum código grave fora do hook, o watcher captura.
    setInterval(async () => {
      try {
        keepDirectAccess();
        if (!navigator.onLine) {
          setConnectionUI(false);
          return;
        }
        if (applyingRemote) return;

        const local = await readLocal();
        if (!isUsableState(local)) return;
        const fp = fingerprint(local);
        if (fp && fp !== lastLocalFingerprint && !queuedFingerprints.has(fp)) enqueueSnapshot(local);
        else if (realtimeStatus === 'SUBSCRIBED') setConnectionUI(true);

        flushQueue();
      } catch (err) {
        console.warn('[NILO V32] sincronização local pendente', err);
      }
    }, 1500);
  }

  function startRealtime() {
    if (!client || channel) return;
    channel = client
      .channel(`nilo-public-v32-${CLIENT_ID}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE,
          filter: `workspace_code=eq.${WORKSPACE_CODE}`
        },
        async payload => {
          try {
            const row = payload.new || payload.old;
            if (!row || row.workspace_code !== WORKSPACE_CODE) return;
            if (row.updated_by === CLIENT_ID) return;
            if (!isUsableState(row.payload)) return;
            await applyRemote(row.payload);
          } catch (err) {
            console.warn('[NILO V32] atualização remota pendente', err);
          }
        }
      )
      .subscribe(status => {
        realtimeStatus = status;
        if (status === 'SUBSCRIBED') {
          setConnectionUI(true, 'Conectado • backup automático ativo');
          flushQueue();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnectionUI(false);
        }
      });
  }

  async function reconnect() {
    if (!navigator.onLine || !client) {
      setConnectionUI(false);
      return;
    }
    try {
      await initialReconcile();
      startRealtime();
      flushQueue();
    } catch (err) {
      console.warn('[NILO V32] reconexão pendente', err);
      setConnectionUI(false);
    }
  }

  async function init() {
    if (initialized) return;
    initialized = true;

    keepDirectAccess();
    installIndexedDBSaveHook();

    if (!window.supabase?.createClient) {
      setConnectionUI(false);
      return;
    }

    client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );

    await openDB();
    await reconnect();
    startLocalWatch();

    window.addEventListener('online', () => { reconnect(); flushQueue(); });
    window.addEventListener('offline', () => setConnectionUI(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushQueue();
    });
    window.addEventListener('pagehide', () => flushQueue());

    setInterval(keepDirectAccess, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 700), { once: true });
  } else {
    setTimeout(init, 700);
  }
})();

/* NILO V32.1 • sincronização e backup somente. A identidade visual é carregada pelo index.html. */
