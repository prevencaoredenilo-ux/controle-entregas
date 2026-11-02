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
let writeThroughBackupTimer = null;
let pendingWriteThroughReason = null;

export function enableWriteThroughAutoBackup() { writeThroughBackupEnabled = true; }

// Escritas próximas são agrupadas em um único snapshot do estado mais recente.
// Isso evita uma fila de backups completos quando uma operação atualiza várias entregas.
function requestWriteThroughBackup(reason = 'alteracao') {
  if (!writeThroughBackupEnabled) return;
  pendingWriteThroughReason = reason;
  clearTimeout(writeThroughBackupTimer);
  writeThroughBackupTimer = setTimeout(() => {
    const nextReason = pendingWriteThroughReason || 'alteracao';
    pendingWriteThroughReason = null;
    writeThroughBackupTimer = null;
    enqueueAutoBackup(nextReason);
  }, 350);
}

function enqueueAutoBackup(reason = 'periodico') {
  autoBackupQueue = autoBackupQueue
    .catch(() => {})
    .then(() => createAutoBackup(reason))
    .catch((error) => {
      console.warn('Não foi possível concluir o backup automático.', error);
      return null;
    });
  return autoBackupQueue;
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
        r.onsuccess = async () => { await logAudit(name, full[keyName], 'create', null, full); requestWriteThroughBackup(`${name}:create`); res(full); };
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
          p.onsuccess = async () => { await logAudit(name, id, 'update', before, after); requestWriteThroughBackup(`${name}:update`); res(after); };
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
          d.onsuccess = async () => { await logAudit(name, id, 'delete', before, null); requestWriteThroughBackup(`${name}:delete`); res(); };
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
const odometerLogsBase = genericStore('odometerLogs');
function odometerLocalDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function odometerAuditEntry(entityId, action, before, after, at) {
  return {
    id: uid('aud'), entityTable: 'odometerLogs', entityId, action,
    operator: typeof localStorage !== 'undefined' ? (localStorage.getItem('orbita_operator') || '') : '',
    operatorRole: typeof localStorage !== 'undefined' ? (localStorage.getItem('orbita_operator_role') || '') : '',
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
    at,
  };
}
export const OdometerLogs = {
  ...odometerLogsBase,
  // Registros excluídos continuam no banco/backup, mas ficam fora da operação e dos relatórios.
  async active(environment = null) {
    const rows = await odometerLogsBase.all();
    return rows.filter((row) => !row.deletedAt && (environment == null || row.environment === environment));
  },
  async trashed(environment = null) {
    const rows = await odometerLogsBase.all();
    return rows.filter((row) => !!row.deletedAt && (environment == null || row.environment === environment));
  },
  // Exclusão lógica e auditada. Não apaga o expediente nem permite quebrar ciclos históricos.
  async softDelete(id, reason) {
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) throw new Error('Informe o motivo da exclusão.');
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['odometerLogs', 'cycles', 'auditLog'], 'readwrite');
      const kmStore = transaction.objectStore('odometerLogs');
      const cycleStore = transaction.objectStore('cycles');
      const auditStore = transaction.objectStore('auditLog');
      const kmRequest = kmStore.get(id);
      const cyclesRequest = cycleStore.getAll();
      let pending = 2;
      let before = null;
      let cycles = [];
      let customError = null;
      let result = null;
      const finish = () => {
        pending -= 1;
        if (pending > 0) return;
        if (!before) {
          customError = new Error('Registro de quilometragem não encontrado.');
          transaction.abort();
          return;
        }
        if (before.deletedAt) {
          customError = new Error('Este registro já está na lixeira.');
          transaction.abort();
          return;
        }
        const linkedCycles = cycles.filter((cycle) => cycle.environment === before.environment && cycle.odometerLogId === id);
        const legacyCycles = cycles.filter((cycle) => cycle.environment === before.environment && !cycle.odometerLogId && String(cycle.vehicleId || '') === String(before.vehicleId || '') && odometerLocalDateKey(cycle.startedAt) === before.shiftDate);
        if (linkedCycles.length || legacyCycles.length) {
          const count = linkedCycles.length + legacyCycles.length;
          customError = new Error(`Não é possível excluir: este expediente possui ${count} ciclo(s) vinculado(s). Para corrigir o veículo, use “Editar KM inicial/final”.`);
          transaction.abort();
          return;
        }
        const now = new Date().toISOString();
        const operator = typeof localStorage !== 'undefined' ? (localStorage.getItem('orbita_operator') || '') : '';
        const after = {
          ...before,
          deletedAt: now,
          deletedBy: operator,
          deleteReason: cleanReason,
          deletionHistory: [...(before.deletionHistory || []), { action: 'delete', reason: cleanReason, by: operator, at: now }],
          updatedAt: now,
        };
        kmStore.put(after);
        auditStore.add(odometerAuditEntry(id, 'soft_delete', before, after, now));
        result = after;
      };
      kmRequest.onsuccess = () => { before = kmRequest.result || null; finish(); };
      cyclesRequest.onsuccess = () => { cycles = cyclesRequest.result || []; finish(); };
      kmRequest.onerror = cyclesRequest.onerror = (event) => {
        customError = event.target?.error || new Error('Não foi possível conferir os ciclos vinculados.');
        try { transaction.abort(); } catch (_) {}
      };
      transaction.oncomplete = () => { requestWriteThroughBackup('odometerLogs:soft-delete'); resolve(result); };
      transaction.onerror = () => reject(customError || transaction.error || new Error('Falha ao excluir o registro de quilometragem.'));
      transaction.onabort = () => reject(customError || transaction.error || new Error('Exclusão cancelada.'));
    });
  },
  // Restauração mantém o mesmo ID e impede duplicidade de veículo/data.
  async restore(id, reason = 'Restauração de registro de quilometragem') {
    const cleanReason = String(reason || '').trim();
    if (!cleanReason) throw new Error('Informe o motivo da restauração.');
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['odometerLogs', 'auditLog'], 'readwrite');
      const kmStore = transaction.objectStore('odometerLogs');
      const auditStore = transaction.objectStore('auditLog');
      const kmRequest = kmStore.get(id);
      const allRequest = kmStore.getAll();
      let pending = 2;
      let before = null;
      let allLogs = [];
      let customError = null;
      let result = null;
      const finish = () => {
        pending -= 1;
        if (pending > 0) return;
        if (!before || !before.deletedAt) {
          customError = new Error('Este registro não está na lixeira.');
          transaction.abort();
          return;
        }
        const duplicate = allLogs.find((row) => row.id !== id && !row.deletedAt && row.environment === before.environment && row.shiftDate === before.shiftDate && String(row.vehicleId || '') === String(before.vehicleId || ''));
        if (duplicate) {
          customError = new Error('Não é possível restaurar: já existe um registro ativo para este veículo nesta data.');
          transaction.abort();
          return;
        }
        const now = new Date().toISOString();
        const operator = typeof localStorage !== 'undefined' ? (localStorage.getItem('orbita_operator') || '') : '';
        const after = {
          ...before,
          deletedAt: null,
          deletedBy: null,
          restorationHistory: [...(before.restorationHistory || []), { fromDeletedAt: before.deletedAt, reason: cleanReason, by: operator, at: now }],
          restoredAt: now,
          restoredBy: operator,
          restoreReason: cleanReason,
          updatedAt: now,
        };
        kmStore.put(after);
        auditStore.add(odometerAuditEntry(id, 'restore', before, after, now));
        result = after;
      };
      kmRequest.onsuccess = () => { before = kmRequest.result || null; finish(); };
      allRequest.onsuccess = () => { allLogs = allRequest.result || []; finish(); };
      kmRequest.onerror = allRequest.onerror = (event) => {
        customError = event.target?.error || new Error('Não foi possível consultar os registros.');
        try { transaction.abort(); } catch (_) {}
      };
      transaction.oncomplete = () => { requestWriteThroughBackup('odometerLogs:restore'); resolve(result); };
      transaction.onerror = () => reject(customError || transaction.error || new Error('Falha ao restaurar o registro de quilometragem.'));
      transaction.onabort = () => reject(customError || transaction.error || new Error('Restauração cancelada.'));
    });
  },
  // Correção do expediente + vínculos operacionais em uma única transação IndexedDB.
  // Evita que o KM mude de veículo enquanto ciclos/entregas vinculados permaneçam no veículo antigo.
  async updateWithRelatedRecords(id, patch, options = {}) {
    const {
      environment = '', oldVehicleId = null, newVehicleId = null,
      cascadeVehicle = false, vehicleCorrectionMeta = {},
    } = options;
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['odometerLogs', 'cycles', 'deliveries', 'auditLog'], 'readwrite');
      const kmStore = transaction.objectStore('odometerLogs');
      const cycleStore = transaction.objectStore('cycles');
      const deliveryStore = transaction.objectStore('deliveries');
      const auditStore = transaction.objectStore('auditLog');
      const kmRequest = kmStore.get(id);
      const cyclesRequest = cycleStore.getAll();
      const deliveriesRequest = deliveryStore.getAll();
      let pending = 3;
      let beforeLog = null;
      let allCycles = [];
      let allDeliveries = [];
      let customError = null;
      const result = { log: null, cyclesUpdated: 0, deliveriesUpdated: 0 };

      const addAudit = (entityTable, entityId, before, after, at) => {
        auditStore.add({
          id: uid('aud'), entityTable, entityId, action: 'update',
          operator: typeof localStorage !== 'undefined' ? (localStorage.getItem('orbita_operator') || '') : '',
          operatorRole: typeof localStorage !== 'undefined' ? (localStorage.getItem('orbita_operator_role') || '') : '',
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(after)),
          at,
        });
      };

      const applyChanges = () => {
        pending -= 1;
        if (pending > 0) return;
        if (!beforeLog || beforeLog.deletedAt) {
          customError = new Error('Registro de quilometragem não encontrado ou já excluído.');
          transaction.abort();
          return;
        }

        const now = new Date().toISOString();
        const afterLog = { ...beforeLog, ...patch, updatedAt: now };
        kmStore.put(afterLog);
        addAudit('odometerLogs', id, beforeLog, afterLog, now);
        result.log = afterLog;

        if (cascadeVehicle && String(oldVehicleId ?? '') !== String(newVehicleId ?? '')) {
          const linkedCycles = allCycles.filter((cycle) => cycle.environment === environment && cycle.odometerLogId === id && !cycle.deletedAt);
          for (const cycle of linkedCycles) {
            if (String(cycle.vehicleId ?? '') !== String(newVehicleId ?? '')) {
              const cycleCorrection = {
                from: cycle.vehicleId, fromLabel: vehicleCorrectionMeta.fromLabel || '',
                to: newVehicleId, toLabel: vehicleCorrectionMeta.toLabel || '',
                reason: vehicleCorrectionMeta.reason || '', by: vehicleCorrectionMeta.by || '',
                at: vehicleCorrectionMeta.at || now, odometerLogId: id,
              };
              const afterCycle = {
                ...cycle, vehicleId: newVehicleId,
                vehicleCorrections: [...(cycle.vehicleCorrections || []), cycleCorrection],
                updatedAt: now,
              };
              cycleStore.put(afterCycle);
              addAudit('cycles', cycle.id, cycle, afterCycle, now);
              result.cyclesUpdated += 1;
            }

            for (const item of allDeliveries) {
              if (item.environment !== environment || item.cycleId !== cycle.id || String(item.vehicleId ?? '') !== String(oldVehicleId ?? '')) continue;
              const deliveryCorrection = {
                from: oldVehicleId, fromLabel: vehicleCorrectionMeta.fromLabel || '',
                to: newVehicleId, toLabel: vehicleCorrectionMeta.toLabel || '',
                reason: vehicleCorrectionMeta.reason || '', by: vehicleCorrectionMeta.by || '',
                at: vehicleCorrectionMeta.at || now, odometerLogId: id, cycleId: cycle.id,
              };
              const afterDelivery = {
                ...item, vehicleId: newVehicleId,
                vehicleCorrections: [...(item.vehicleCorrections || []), deliveryCorrection],
                updatedAt: now,
              };
              deliveryStore.put(afterDelivery);
              addAudit('deliveries', item.id, item, afterDelivery, now);
              result.deliveriesUpdated += 1;
            }
          }
        }
      };

      kmRequest.onsuccess = () => { beforeLog = kmRequest.result || null; applyChanges(); };
      cyclesRequest.onsuccess = () => { allCycles = cyclesRequest.result || []; applyChanges(); };
      deliveriesRequest.onsuccess = () => { allDeliveries = deliveriesRequest.result || []; applyChanges(); };
      kmRequest.onerror = cyclesRequest.onerror = deliveriesRequest.onerror = (event) => {
        customError = event.target?.error || new Error('Não foi possível ler os registros relacionados.');
        try { transaction.abort(); } catch (_) {}
      };
      transaction.oncomplete = () => {
        requestWriteThroughBackup(cascadeVehicle ? 'odometerLogs:vehicle-correction' : 'odometerLogs:update');
        resolve(result);
      };
      transaction.onerror = () => reject(customError || transaction.error || new Error('Falha ao corrigir quilometragem.'));
      transaction.onabort = () => reject(customError || transaction.error || new Error('Correção cancelada.'));
    });
  },
};
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
    const baseDate = options.date ? new Date(options.date) : new Date();
    const day = new Date(baseDate.getTime() - baseDate.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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
  await DayClosures.replaceAll(data.dayClosures || []);
  requestWriteThroughBackup('importacao-completa');
}

/* ---------- backup automático (leitura leve e sem alterar backups antigos) ---------- */
function backupIdTimestamp(id) {
  const parts = String(id || '').split('_');
  return Number.parseInt(parts[2] || '', 36) || 0;
}

async function createAutoBackup(reason = 'periodico') {
  const snapshot = await exportAll();
  const store = await tx('autoBackups', 'readwrite');
  // Prefixo próprio: a retenção nova só administra backups criados por esta rotina.
  // Backups anteriores à v5.17 são mantidos intactos e nunca são removidos por esta limpeza.
  const entry = { id: uid('bkp_safe'), at: new Date().toISOString(), reason, retentionGroup: 'orbita-safe-v1', data: snapshot };
  return new Promise((resolve, reject) => {
    const req = store.add(entry);
    req.onsuccess = async () => {
      try {
        // getAllKeys traz apenas identificadores, não carrega os snapshots completos para a memória.
        const keysStore = await tx('autoBackups', 'readonly');
        const keysReq = keysStore.getAllKeys();
        keysReq.onsuccess = async () => {
          try {
            const managedKeys = keysReq.result
              .filter((key) => String(key).startsWith('bkp_safe_'))
              .sort((a, b) => backupIdTimestamp(a) - backupIdTimestamp(b));
            const excess = managedKeys.slice(0, Math.max(0, managedKeys.length - 50));
            if (excess.length) {
              const delStore = await tx('autoBackups', 'readwrite');
              excess.forEach((key) => delStore.delete(key));
            }
          } catch (error) {
            console.warn('Não foi possível limitar os novos backups automáticos.', error);
          }
          resolve(entry);
        };
        keysReq.onerror = () => resolve(entry);
      } catch {
        // O snapshot já foi salvo; uma falha na limpeza não invalida o backup.
        resolve(entry);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export function saveAutoBackup(reason = 'periodico') {
  return enqueueAutoBackup(reason);
}

// A tela de configurações precisa só de metadados. Não mantém os 50 snapshots completos na RAM.
export async function listAutoBackups() {
  const store = await tx('autoBackups', 'readonly');
  return new Promise((resolve, reject) => {
    const rows = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        rows.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
        resolve(rows);
        return;
      }
      const value = cursor.value;
      rows.push({ id: value.id, at: value.at, reason: value.reason, retentionGroup: value.retentionGroup || null });
      cursor.continue();
    };
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
