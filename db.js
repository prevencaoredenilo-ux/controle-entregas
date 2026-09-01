/**
 * db.js — camada de dados offline-first (IndexedDB)
 * Cada escrita relevante gera automaticamente uma linha em auditLog.
 * "environment" separa Operação Real de Treinamento sem duplicar cadastros.
 */
const DB_NAME = 'orbita-v2';
const DB_VERSION = 3;

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
};

let dbPromise = null;

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
    before: before ? JSON.parse(JSON.stringify(before)) : null,
    after: after ? JSON.parse(JSON.stringify(after)) : null,
    at: new Date().toISOString(),
  };
  store.add(entry);
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
        r.onsuccess = async () => { await logAudit(name, full[keyName], 'create', null, full); res(full); };
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
          p.onsuccess = async () => { await logAudit(name, id, 'update', before, after); res(after); };
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
          d.onsuccess = async () => { await logAudit(name, id, 'delete', before, null); res(); };
          d.onerror = () => rej(d.error);
        };
      });
    },
    async replaceAll(records) {
      const store = await tx(name, 'readwrite');
      return new Promise((res, rej) => {
        const c = store.clear();
        c.onsuccess = () => { records.forEach((r) => store.put(r)); res(); };
        c.onerror = () => rej(c.error);
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
    const history = before.statusHistory || [];
    history.push({ from: before.status, to: newStatus, reasonId, note, at: new Date().toISOString() });
    return deliveriesBase.update(id, { status: newStatus, statusHistory: history, ...operationalFields });
  },
  async reschedule(id, newScheduledAt, reason) {
    const before = await deliveriesBase.get(id);
    const list = before.reschedules || [];
    list.push({ from: before.scheduledAt || null, to: newScheduledAt, reason, at: new Date().toISOString() });
    return deliveriesBase.update(id, { scheduledAt: newScheduledAt, reschedules: list, type: 'agendada' });
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
  async next(environment, kind) {
    const store = await tx('counters', 'readwrite');
    const today = new Date().toISOString().slice(0, 10);
    const key = kind === 'chegada' ? `${environment}:${kind}:${today}` : `${environment}:${kind}`;
    return new Promise((res, rej) => {
      const g = store.get(key);
      g.onsuccess = () => {
        const current = g.result?.value || 0;
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
  const [deliveries, vehicles, drivers, collaborators, neighborhoods, costCategories, returnReasons, cycles, odometerLogs, costs] = await Promise.all([
    Deliveries.all(), Vehicles.all(), Drivers.all(), Collaborators.all(), Neighborhoods.all(), CostCategories.all(),
    ReturnReasons.all(), Cycles.all(), OdometerLogs.all(), Costs.all(),
  ]);
  return { version: 2, exportedAt: new Date().toISOString(), deliveries, vehicles, drivers, collaborators, neighborhoods, costCategories, returnReasons, cycles, odometerLogs, costs };
}

export async function importAll(data) {
  await Deliveries.replaceAll(data.deliveries || []);
  await Vehicles.replaceAll(data.vehicles || []);
  await Drivers.replaceAll(data.drivers || []);
  await Collaborators.replaceAll(data.collaborators || []);
  await Neighborhoods.replaceAll(data.neighborhoods || []);
  await CostCategories.replaceAll(data.costCategories || []);
  await ReturnReasons.replaceAll(data.returnReasons || []);
  await Cycles.replaceAll(data.cycles || []);
  await OdometerLogs.replaceAll(data.odometerLogs || []);
  await Costs.replaceAll(data.costs || []);
}

/* ---------- backup automático (rolling, guarda os últimos 5) ---------- */
export async function saveAutoBackup() {
  const snapshot = await exportAll();
  const store = await tx('autoBackups', 'readwrite');
  const entry = { id: uid('bkp'), at: new Date().toISOString(), data: snapshot };
  return new Promise((resolve, reject) => {
    const req = store.add(entry);
    req.onsuccess = async () => {
      const all = await listAutoBackups();
      const excess = all.slice(5);
      const delStore = await tx('autoBackups', 'readwrite');
      excess.forEach((b) => delStore.delete(b.id));
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
      await importAll(req.result.data);
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/* ---------- seed inicial (bairros/motivos/categorias padrão) ---------- */
export async function ensureSeed() {
  const reasons = await ReturnReasons.all();
  if (!reasons.length) {
    const defaults = ['Cliente ausente', 'Endereço errado', 'Cliente recusou', 'Cliente pediu outro dia', 'Produto incorreto', 'Produto avariado', 'Problema no veículo', 'Outros'];
    for (const label of defaults) await ReturnReasons.add({ label, active: true });
  }
  const cats = await CostCategories.all();
  if (!cats.length) {
    const defaults = ['Combustível', 'Manutenção', 'Alimentação', 'Pedágio', 'Outros'];
    for (const name of defaults) await CostCategories.add({ name, active: true });
  }
}
