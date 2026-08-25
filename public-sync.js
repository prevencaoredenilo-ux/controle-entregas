/* ================================================================
   NILO ENTREGAS • V15.1
   Sincronização pública em tempo real, sem usuário e sem senha.
   Mantém o app V14.8 intacto e sincroniza o estado salvo no IndexedDB.
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
  let pushTimer = null;
  let initialized = false;
  let realtimeStatus = 'CONNECTING';

  function fingerprint(value) {
    try { return JSON.stringify(value || null); }
    catch { return String(Date.now()); }
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

  function openDB() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const result = req.result;
        if (!result.objectStoreNames.contains(STORE_NAME)) result.createObjectStore(STORE_NAME);
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

  function suppressPasswordScreen() {
    const screen = document.getElementById('cloudAuthScreen');
    if (screen) {
      screen.classList.add('hidden');
      screen.setAttribute('aria-hidden', 'true');
    }
    const shell = document.getElementById('appShell');
    if (shell) shell.removeAttribute('aria-hidden');
    const account = document.getElementById('syncAccountBtn');
    if (account) account.hidden = true;
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
    if (!client || !navigator.onLine || applyingRemote || !isUsableState(local)) return;
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
  }

  async function applyRemote(remoteState) {
    if (!isUsableState(remoteState)) return false;

    const current = await readLocal();
    if (fingerprint(current) === fingerprint(remoteState)) {
      lastLocalFingerprint = fingerprint(current);
      return false;
    }

    applyingRemote = true;
    try {
      await writeLocal(remoteState);
      lastLocalFingerprint = fingerprint(remoteState);
      try {
        sessionStorage.setItem('nilo_public_sync_remote_reload', String(Date.now()));
      } catch {}
      setConnectionUI(true, 'Atualização recebida de outro dispositivo');
    } finally {
      applyingRemote = false;
    }

    // O app V14.8 mantém o estado também em memória. O reload curto faz
    // a nova versão do IndexedDB aparecer em todas as telas sem alterar app.js.
    setTimeout(() => location.reload(), 180);
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

    const same = fingerprint(local) === fingerprint(remoteState);
    if (same) {
      setConnectionUI(true, 'Dados atualizados neste dispositivo');
      return;
    }

    // Um aparelho novo normalmente só possui o estado padrão.
    const localOps = operationalCount(local);
    const remoteOps = operationalCount(remoteState);
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

  function scheduleLocalWatch() {
    setInterval(async () => {
      try {
        suppressPasswordScreen();

        if (!navigator.onLine) {
          setConnectionUI(false);
          return;
        }

        const local = await readLocal();
        const fp = fingerprint(local);
        if (!applyingRemote && isUsableState(local) && fp !== lastLocalFingerprint) {
          clearTimeout(pushTimer);
          pushTimer = setTimeout(() => {
            pushLocal(local).catch(err => {
              console.warn('[NILO public sync] envio pendente', err);
              setConnectionUI(false);
            });
          }, 350);
        } else if (realtimeStatus === 'SUBSCRIBED') {
          setConnectionUI(true);
        }
      } catch (err) {
        console.warn('[NILO public sync] leitura local', err);
      }
    }, 1200);
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
            console.warn('[NILO public sync] atualização remota', err);
          }
        }
      )
      .subscribe(status => {
        realtimeStatus = status;
        if (status === 'SUBSCRIBED') setConnectionUI(true, 'Conectado ao banco em tempo real');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setConnectionUI(false);
      });
  }

  async function reconnect() {
    try {
      if (!navigator.onLine) {
        setConnectionUI(false);
        return;
      }
      if (!client) return;
      await initialReconcile();
      startRealtime();
    } catch (err) {
      console.warn('[NILO public sync] reconexão', err);
      setConnectionUI(false);
    }
  }

  async function init() {
    if (initialized) return;
    initialized = true;

    suppressPasswordScreen();
    const screen = document.getElementById('cloudAuthScreen');
    if (screen) {
      new MutationObserver(suppressPasswordScreen).observe(screen, {
        attributes: true,
        attributeFilter: ['class', 'aria-hidden']
      });
    }

    setInterval(suppressPasswordScreen, 800);

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
    scheduleLocalWatch();

    window.addEventListener('online', reconnect);
    window.addEventListener('offline', () => setConnectionUI(false));
  }

  // app.js inicializa o IndexedDB antes de abrir a tela. Um pequeno atraso
  // evita competir com o boot original e mantém todas as funções atuais.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 700));
  } else {
    setTimeout(init, 700);
  }
})();
