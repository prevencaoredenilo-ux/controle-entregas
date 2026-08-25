/* ================================================================
   NILO ENTREGAS • V15.2
   Correção de travamento + sincronização pública em tempo real.
   Sem usuário e sem senha.
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

  function fingerprint(value) {
    try { return JSON.stringify(value || null); }
    catch { return ''; }
  }

  function operationalCount(s) {
    if (!s || typeof s !== 'object') return 0;
    return ['deliveries','cycles','routeTracks','odometerLogs','costs','audit','dayClosures','trash']
      .reduce((n, k) => n + (Array.isArray(s[k]) ? s[k].length : 0), 0);
  }

  function isUsableState(s) {
    return Boolean(s && typeof s === 'object' && (
      s.meta || s.settings || Array.isArray(s.deliveries)
    ));
  }

  function keepDirectAccess() {
    // O CSS V15.1 já esconde a tela de login.
    // Aqui só garantimos que o aplicativo permaneça utilizável,
    // sem observar/mutar o mesmo elemento em loop.
    const shell = document.getElementById('appShell');
    if (shell && shell.getAttribute('aria-hidden') === 'true') {
      shell.removeAttribute('aria-hidden');
    }
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
    if (title) title.textContent = ok ? 'Sincronizado em tempo real' : 'Trabalhando offline';
    if (subtitle) subtitle.textContent = ok
      ? (text || 'Dados disponíveis no celular e computador')
      : 'Os dados deste aparelho serão enviados quando a internet voltar';
  }

  function openDB() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const result = req.result;
        if (!result.objectStoreNames.contains(STORE_NAME)) {
          result.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => {
        db = req.result;
        resolve(db);
      };
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

  async function pushLocal(local) {
    if (!client || !navigator.onLine || applyingRemote || !isUsableState(local) || syncBusy) return;
    syncBusy = true;
    try {
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
      setConnectionUI(true, 'Última alteração enviada agora');
    } finally {
      syncBusy = false;
    }
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

    applyingRemote = true;
    try {
      await writeLocal(remoteState);
      lastLocalFingerprint = remoteFp;
      lastRemoteFingerprint = remoteFp;
      setConnectionUI(true, 'Atualização recebida de outro dispositivo');
    } finally {
      applyingRemote = false;
    }

    // O app principal mantém uma cópia do estado em memória.
    // Um único recarregamento aplica os dados recebidos às telas.
    try {
      sessionStorage.setItem('nilo_v152_remote_fp', remoteFp.slice(0, 180));
    } catch {}
    setTimeout(() => location.reload(), 300);
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
      await pushLocal(local);
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
      setConnectionUI(true, 'Dados atualizados neste dispositivo');
      return;
    }

    const localOps = operationalCount(local);
    const remoteOps = operationalCount(remoteState);

    // Em aparelho novo, o estado padrão não deve apagar o banco compartilhado.
    if (localOps === 0 && remoteOps > 0) {
      await applyRemote(remoteState);
      return;
    }
    if (remoteOps === 0 && localOps > 0) {
      await pushLocal(local);
      return;
    }

    const localTime = Date.parse(local?.meta?.updatedAt || local?.meta?.createdAt || 0) || 0;
    const remoteTime = Date.parse(remote?.updated_at || 0) || 0;

    if (remoteTime > localTime + 1500) {
      await applyRemote(remoteState);
    } else {
      await pushLocal(local);
    }
  }

  function startLocalWatch() {
    // Intervalo mais leve que a V15.1 para evitar custo desnecessário.
    setInterval(async () => {
      try {
        keepDirectAccess();

        if (!navigator.onLine) {
          setConnectionUI(false);
          return;
        }
        if (applyingRemote || syncBusy) return;

        const local = await readLocal();
        if (!isUsableState(local)) return;

        const fp = fingerprint(local);
        if (fp && fp !== lastLocalFingerprint) {
          await pushLocal(local);
        } else if (realtimeStatus === 'SUBSCRIBED') {
          setConnectionUI(true);
        }
      } catch (err) {
        console.warn('[NILO V15.2] sincronização local pendente', err);
      }
    }, 2500);
  }

  function startRealtime() {
    if (!client || channel) return;

    channel = client
      .channel(`nilo-public-${CLIENT_ID}`)
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
            console.warn('[NILO V15.2] atualização remota pendente', err);
          }
        }
      )
      .subscribe(status => {
        realtimeStatus = status;
        if (status === 'SUBSCRIBED') {
          setConnectionUI(true, 'Conectado ao banco em tempo real');
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
    } catch (err) {
      console.warn('[NILO V15.2] reconexão pendente', err);
      setConnectionUI(false);
    }
  }

  async function init() {
    if (initialized) return;
    initialized = true;

    keepDirectAccess();

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

    window.addEventListener('online', reconnect);
    window.addEventListener('offline', () => setConnectionUI(false));

    // Sem MutationObserver: esta é a correção principal do travamento V15.1.
    setInterval(keepDirectAccess, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 900), { once: true });
  } else {
    setTimeout(init, 900);
  }
})();
