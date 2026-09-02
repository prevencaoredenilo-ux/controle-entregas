/**
 * db.js — camada de dados offline-first (IndexedDB)
 * Cada escrita relevante gera automaticamente uma linha em auditLog.
 * "environment" separa Operação Real de Treinamento sem duplicar cadastros.
 */
const DB_NAME = 'orbita-v2';
const DB_VERSION = 4;

const STORES = {
  deliveries: 'id',
  vehicles: 'id',
  drivers: 'id',
  collaborators: 'id',
  neighborhoods: 'id',
  costCategories: 'id',
  returnReasons: 'id',
  cycles: 'id',
  odometerLogs: 'id',
  costs: 'id',
  auditLog: 'id',
  counters: 'key',
  autoBackups: 'id',
  dayClosures: 'id',
};

let dbPromise = null;

// v3.6 — backup automático por alteração + backup periódico.
// O gatilho por escrita só é habilitado depois do seed inicial para evitar snapshots desnecessários no primeiro boot.
let writeThroughBackupEnabled = false;
let autoBackupQueue = Promise.resolve();

export function enableWriteThroughAutoBackup() { writeThroughBackupEnabled = true; }

function requestWriteThroughBackup(reason = 'alteracao') {
  if (!writeThroughBackupEnabled) return;
  autoBackupQueue = autoBackupQueue
    .then(() => new Promise((resolve) => setTimeout(resolve, 0)))
    .then(() => saveAutoBackup(reason))
    .catch(() => {});
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      Object.entries(STORES).forEach(([name, keyPath]) => {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath });
          if (name === 'deliveries') {
            store.createIndex('status', 'status');
            store.createIndex('environment', 'environment');
            store.createIndex('deletedAt', 'deletedAt');
            store.createIndex('cycleId', 'cycleId');
          }
          if (name === 'cycles') store.createIndex('status', 'status');
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function logAudit(entityTable, entityId, action, before, after) {
  const store = await tx('auditLog', 'readwrite');
  const entry = {
    id: uid('aud'),
    entityTable, entityId, action,
    operator: typeof localStorage !== 'undefined' ? (localStorage.getItem('orbita_operator') || '') : '',
    operatorRole: typeof localStorage !== 'undefined' ? (localStorage.getItem('orbita_operator_role') || '') : '',
    environment: after?.environment || before?.environment || (typeof localStorage !== 'undefined' ? (localStorage.getItem('orbita_env') || '') : ''),
    before: before ? JSON.parse(JSON.stringify(before)) : null,
    after: after ? JSON.parse(JSON.stringify(after)) : null,
    at: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const req = store.add(entry);
    req.onsuccess = () => resolve(entry);
    req.onerror = () => reject(req.error || new Error('Falha ao registrar auditoria'));
  });
}

function genericStore(name) {
  return {
    async all() {
      const store = await tx(name, 'readonly');
      return new Promise((res, rej) => {
        const r = store.getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    },
    async get(id) {
      const store = await tx(name, 'readonly');
      return new Promise((res, rej) => {
        const r = store.get(id);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => rej(r.error);
      });
    },
    async add(record, keyName = 'id') {
      const store = await tx(name, 'readwrite');
      const now = new Date().toISOString();
      const full = { [keyName]: record[keyName] || uid(name.slice(0, 3)), createdAt: now, updatedAt: now, ...record };
      return new Promise((res, rej) => {
        const r = store.add(full);
        r.onsuccess = async () => { try { await logAudit(name, full[keyName], 'create', null, full); } catch (err) { console.warn('Auditoria indisponível:', err); } requestWriteThroughBackup(`${name}:create`); res(full); };
        r.onerror = () => rej(r.error);
      });
    },
    async update(id, patch, keyName = 'id') {
      const store = await tx(name, 'readwrite');
      return new Promise((res, rej) => {
        const g = store.get(id);
        g.onsuccess = () => {
          const before = g.result;
          if (!before) return rej(new Error('Registro não encontrado'));
          const after = { ...before, ...patch, updatedAt: new Date().toISOString() };
          const p = store.put(after);
          p.onsuccess = async () => { try { await logAudit(name, id, 'update', before, after); } catch (err) { console.warn('Auditoria indisponível:', err); } requestWriteThroughBackup(`${name}:update`); res(after); };
          p.onerror = () => rej(p.error);
        };
        g.onerror = () => rej(g.error);
      });
    },
    async remove(id) {
      const store = await tx(name, 'readwrite');
      return new Promise((res, rej) => {
        const g = store.get(id);
        g.onsuccess = () => {
          const before = g.result;
          const d = store.delete(id);
          d.onsuccess = async () => { try { await logAudit(name, id, 'delete', before, null); } catch (err) { console.warn('Auditoria indisponível:', err); } requestWriteThroughBackup(`${name}:delete`); res(); };
          d.onerror = () => rej(d.error);
        };
        g.onerror = () => rej(g.error);
      });
    },
    async replaceAll(records) {
      if (!Array.isArray(records)) throw new Error(`Dados inválidos para ${name}`);
      const store = await tx(name, 'readwrite');
      const transaction = store.transaction;
      return new Promise((res, rej) => {
        transaction.oncomplete = () => res();
        transaction.onerror = () => rej(transaction.error || new Error(`Falha ao restaurar ${name}`));
        transaction.onabort = () => rej(transaction.error || new Error(`Restauração de ${name} cancelada`));
        const c = store.clear();
        c.onerror = () => { try { transaction.abort(); } catch {} };
        c.onsuccess = () => {
          for (const row of records) store.put(row);
        };
      });
    },
  };
}

/* ---------- deliveries: regras extras (soft delete, status history embutido) ---------- */
const deliveriesBase = genericStore('deliveries');

export const Deliveries = {
  ...deliveriesBase,
  async active(environment) {
    const rows = await deliveriesBase.all();
    return rows.filter((r) => !r.deletedAt && r.environment === environment);
  },
  async trashed(environment) {
    const rows = await deliveriesBase.all();
    return rows.filter((r) => !!r.deletedAt && r.environment === environment);
  },
  async changeStatus(id, newStatus, options = {}) {
    const { reasonId = null, note = '', ...operationalFields } = options;
    const before = await deliveriesBase.get(id);
    if (!before) throw new Error('Entrega não encontrada');
    const history = [...(before.statusHistory || [])];
    if (before.status !== newStatus) {
      history.push({
        from: before.status, to: newStatus, reasonId, note,
        operator: typeof localStorage !== 'undefined' ? (localStorage.getItem('orbita_operator') || '') : '',
        at: new Date().toISOString(),
      });
    }
    return deliveriesBase.update(id, { status: newStatus, statusHistory: history, ...operationalFields });
  },
  async reschedule(id, newScheduledAt, reason) {
    const before = await deliveriesBase.get(id);
    if (!before) throw new Error('Entrega não encontrada');
    const when = new Date(newScheduledAt);
    if (Number.isNaN(when.getTime())) throw new Error('Data de reagendamento inválida');
    const now = new Date().toISOString();
    const list = [...(before.reschedules || []), { from: before.scheduledAt || null, to: when.toISOString(), reason: reason || '', at: now }];
    const history = [...(before.statusHistory || [])];
    if (before.status !== 'programada') history.push({ from: before.status, to: 'programada', note: `Reagendada${reason ? ` · ${reason}` : ''}`, operator: typeof localStorage !== 'undefined' ? (localStorage.getItem('orbita_operator') || '') : '', at: now });
    return deliveriesBase.update(id, {
      scheduledAt: when.toISOString(), reschedules: list, type: 'agendada', status: 'programada', statusHistory: history,
      cycleId: null, vehicleId: null, driverId: null, leftStoreAt: null, clientArrivalAt: null, deliveredAt: null,
    });
  },
  async softDelete(id) { return deliveriesBase.update(id, { deletedAt: new Date().toISOString() }); },
  async restore(id) { return deliveriesBase.update(id, { deletedAt: null }); },
};

export const Vehicles = genericStore('vehicles');
export const Drivers = genericStore('drivers');
export const Collaborators = genericStore('collaborators');
export const Neighborhoods = genericStore('neighborhoods');
export const CostCategories = genericStore('costCategories');
export const ReturnReasons = genericStore('returnReasons');
export const Cycles = genericStore('cycles');
export const OdometerLogs = genericStore('odometerLogs');
export const Costs = genericStore('costs');
export const DayClosures = genericStore('dayClosures');

export const AuditLog = {
  async all() {
    const store = await tx('auditLog', 'readonly');
    return new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result.sort((a, b) => b.at.localeCompare(a.at)));
      r.onerror = () => rej(r.error);
    });
  },
};

/* ---------- contadores diários (número de compra contínuo / chegada diário) ---------- */
export const Counters = {
  async next(environment, kind, options = {}) {
    const store = await tx('counters', 'readwrite');
    const rawDate = options.date;
    const dateOnly = typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
    const baseDate = rawDate ? new Date(rawDate) : new Date();
    const day = dateOnly || [baseDate.getFullYear(), String(baseDate.getMonth() + 1).padStart(2, '0'), String(baseDate.getDate()).padStart(2, '0')].join('-');
    const daily = options.daily ?? (kind === 'chegada');
    const scope = options.scope ? `:${options.scope}` : '';
    const key = daily ? `${environment}:${kind}${scope}:${day}` : `${environment}:${kind}${scope}`;
    return new Promise((res, rej) => {
      const g = store.get(key);
      g.onsuccess = () => {
        const minimum = Number(options.minimum) || 0;
        const current = Math.max(g.result?.value || 0, minimum);
        const value = current + 1;
        const p = store.put({ key, value });
        p.onsuccess = () => res(value);
        p.onerror = () => rej(p.error);
      };
      g.onerror = () => rej(g.error);
    });
  },
};

/* ---------- backup completo (todas as entidades) ---------- */
export async function exportAll() {
  const [deliveries, vehicles, drivers, collaborators, neighborhoods, costCategories, returnReasons, cycles, odometerLogs, costs, dayClosures] = await Promise.all([
    Deliveries.all(), Vehicles.all(), Drivers.all(), Collaborators.all(), Neighborhoods.all(), CostCategories.all(),
    ReturnReasons.all(), Cycles.all(), OdometerLogs.all(), Costs.all(), DayClosures.all(),
  ]);
  return { version: 3, exportedAt: new Date().toISOString(), deliveries, vehicles, drivers, collaborators, neighborhoods, costCategories, returnReasons, cycles, odometerLogs, costs, dayClosures };
}

function validateBackupPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Estrutura de backup inválida');
  const required = ['deliveries','vehicles','drivers','collaborators','neighborhoods','costCategories','returnReasons','cycles','odometerLogs','costs','dayClosures'];
  const present = required.filter((key) => Object.prototype.hasOwnProperty.call(data, key));
  if (!present.length) throw new Error('O arquivo não contém dados reconhecidos do Órbita');
  for (const key of present) if (!Array.isArray(data[key])) throw new Error(`Campo inválido no backup: ${key}`);
  return true;
}

export async function importAll(data) {
  validateBackupPayload(data);
  // Restauração atômica: ou todas as coleções presentes no arquivo entram, ou nenhuma entra.
  // AuditLog, contadores e histórico de autoBackups não são tocados por restauração de dados operacionais.
  const storeMap = {
    deliveries: 'deliveries', vehicles: 'vehicles', drivers: 'drivers', collaborators: 'collaborators',
    neighborhoods: 'neighborhoods', costCategories: 'costCategories', returnReasons: 'returnReasons',
    cycles: 'cycles', odometerLogs: 'odometerLogs', costs: 'costs', dayClosures: 'dayClosures',
  };
  const keys = Object.keys(storeMap).filter((key) => Array.isArray(data[key]));
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(keys.map((key) => storeMap[key]), 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Falha ao restaurar backup'));
    transaction.onabort = () => reject(transaction.error || new Error('Restauração cancelada'));
    for (const key of keys) {
      const store = transaction.objectStore(storeMap[key]);
      store.clear();
      for (const row of data[key]) store.put(row);
    }
  });
  try {
    await logAudit('system', 'backup-restore', 'restore', null, {
      backupVersion: data.version ?? null,
      exportedAt: data.exportedAt ?? null,
      collections: keys,
    });
  } catch (err) { console.warn('Não foi possível auditar a restauração:', err); }
  requestWriteThroughBackup('importacao-completa');
}

/* ---------- backup automático preservado (v6.1 não remove backups anteriores) ---------- */
export async function saveAutoBackup(reason = 'periodico') {
  const snapshot = await exportAll();
  const store = await tx('autoBackups', 'readwrite');
  const entry = { id: uid('bkp'), at: new Date().toISOString(), reason, data: snapshot };
  return new Promise((resolve, reject) => {
    const req = store.add(entry);
    req.onsuccess = () => {
      // v6.1: backups existentes nunca são apagados automaticamente.
      resolve(entry);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listAutoBackups() {
  const store = await tx('autoBackups', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.at.localeCompare(a.at)));
    req.onerror = () => reject(req.error);
  });
}

export async function restoreAutoBackup(id) {
  const store = await tx('autoBackups', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = async () => {
      if (!req.result) return reject(new Error('Backup não encontrado'));
      try {
        await saveAutoBackup('seguranca-antes-restauracao');
        await importAll(req.result.data);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/* ---------- seed inicial (bairros/motivos/categorias padrão) ---------- */
export async function ensureSeed() {
  const reasons = await ReturnReasons.all();
  const defaults = ['Cliente ausente', 'Endereço não localizado', 'Telefone sem resposta', 'Cliente recusou', 'Cliente pediu outro dia', 'Problema com mercadoria', 'Pagamento não realizado', 'Problema no veículo', 'Outros'];
  for (const label of defaults) {
    if (!reasons.some((item) => item.label?.trim().toLowerCase() === label.toLowerCase())) await ReturnReasons.add({ label, active: true });
  }
  const cats = await CostCategories.all();
  if (!cats.length) {
    const defaults = ['Combustível', 'Manutenção', 'Alimentação', 'Pedágio', 'Outros'];
    for (const name of defaults) await CostCategories.add({ name, active: true });
  }
}
