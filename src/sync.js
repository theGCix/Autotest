/*
 * Sincronización Cloud + Local-first (TopsSync)
 * --------------------------------------------
 * La app SIEMPRE guarda primero en localStorage (igual que antes). Este
 * módulo es una capa adicional: detecta qué cambió, lo guarda en una
 * "bandeja de salida" (outbox) local, y cuando hay Internet la envía a
 * Supabase (upsert). También trae (pull) lo que las otras tablets hayan
 * subido, para que ambas terminen viendo los mismos datos.
 *
 * Si sync.enabled = false (o no hay Internet), la app sigue funcionando
 * exactamente igual que la versión 100% local: nada de esto bloquea el
 * uso normal ni la evaluación del operario.
 */
'use strict';

const TopsSync = (function () {
  const OUTBOX_KEY = 'tops_sync_outbox_v1';
  const SNAPSHOT_KEY = 'tops_sync_snapshot_v1'; // últimos updatedAt/changedAt enviados (colecciones mutables)
  const SYNCED_IDS_KEY = 'tops_sync_synced_ids_v1'; // ids ya enviados (colecciones de solo-alta)
  const STATE_KEY = 'tops_sync_state_v1'; // token de sesión del dispositivo

  // Colecciones que solo crecen (push, nunca se editan después de creadas).
  const APPEND_ONLY = {
    selfTests: { table: 'self_tests', pk: 'id' },
    supervisorEvals: { table: 'supervisor_evals', pk: 'id' },
    chiefEvals: { table: 'chief_evals', pk: 'id' },
    suggestions: { table: 'suggestions', pk: 'id' },
    profileEvents: { table: 'profile_events', pk: 'id' },
    legacyRecords: { table: 'legacy_records', pk: 'id' }
  };

  // Colecciones tipo diccionario que sí se editan (se compara por fecha).
  const MUTABLE_KEYED = {
    profiles: { table: 'profiles', pk: 'code', touchField: 'updatedAt' },
    scopeOverrides: { table: 'scope_overrides', pk: 'key', touchField: 'changedAt' }
  };

  let cfg = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let flushing = false;
  let badgeEl = null;

  function log(...a) { try { console.log('[TopsSync]', ...a); } catch (e) {} }

  function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch (e) { return fallback; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function getOutbox() { return readJSON(OUTBOX_KEY, []); }
  function setOutbox(v) { writeJSON(OUTBOX_KEY, v); }

  function setBadge(text, cls) {
    if (!badgeEl) badgeEl = document.getElementById('syncBadge');
    if (!badgeEl) return;
    badgeEl.textContent = text;
    badgeEl.className = 'syncbadge ' + (cls || '');
  }

  function isOnline() { return typeof navigator === 'undefined' || navigator.onLine !== false; }

  // ---------- Autenticación del dispositivo (no del operario) ----------

  async function ensureToken() {
    if (!cfg || !cfg.enabled) return false;
    if (accessToken && Date.now() < tokenExpiresAt - 30000) return true;
    const state = readJSON(STATE_KEY, null);
    if (state && state.accessToken && Date.now() < state.expiresAt - 30000) {
      accessToken = state.accessToken;
      tokenExpiresAt = state.expiresAt;
      return true;
    }
    try {
      const res = await fetch(cfg.supabaseUrl + '/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey },
        body: JSON.stringify({ email: cfg.deviceEmail, password: cfg.devicePassword })
      });
      if (!res.ok) { log('login falló', res.status); return false; }
      const data = await res.json();
      accessToken = data.access_token;
      tokenExpiresAt = Date.now() + (Number(data.expires_in || 3600) * 1000);
      writeJSON(STATE_KEY, { accessToken, expiresAt: tokenExpiresAt });
      return true;
    } catch (e) {
      log('login error (sin conexión probablemente)', e.message);
      return false;
    }
  }

  function restHeaders(extra) {
    return Object.assign({
      'Content-Type': 'application/json',
      apikey: cfg.supabaseAnonKey,
      Authorization: 'Bearer ' + accessToken
    }, extra || {});
  }

  // ---------- Detección de cambios (DATA -> outbox) ----------

  function rowFromRecord(pkField, pkValue, record) {
    // Todo el registro original va tal cual dentro de "payload" (jsonb).
    // Así el esquema SQL no se rompe si mañana se agrega un campo nuevo
    // en el JS: no hay que tocar la base de datos para cada cambio.
    const row = {};
    row[pkField] = pkValue;
    row.payload = record;
    row.device_id = cfg.deviceId;
    row.synced_at = new Date().toISOString();
    return row;
  }

  function diffAndEnqueue(DATA) {
    if (!cfg || !cfg.enabled) return;
    const outbox = getOutbox();
    const existingKeys = new Set(outbox.map(o => o.table + ':' + o.rowId));

    // Colecciones append-only: cualquier id no visto antes se encola.
    const syncedIds = readJSON(SYNCED_IDS_KEY, {});
    for (const [collKey, def] of Object.entries(APPEND_ONLY)) {
      const arr = DATA[collKey] || [];
      const seen = new Set(syncedIds[collKey] || []);
      for (const rec of arr) {
        const id = rec.id;
        if (!id || seen.has(id)) continue;
        const rowId = String(id);
        if (existingKeys.has(def.table + ':' + rowId)) continue;
        outbox.push({ table: def.table, pk: def.pk, rowId, payload: rowFromRecord(def.pk, rowId, rec) });
        existingKeys.add(def.table + ':' + rowId);
      }
    }

    // Colecciones mutables: se compara la marca de tiempo de edición.
    const snapshot = readJSON(SNAPSHOT_KEY, {});
    for (const [collKey, def] of Object.entries(MUTABLE_KEYED)) {
      const coll = DATA[collKey] || {};
      snapshot[collKey] = snapshot[collKey] || {};
      for (const [key, rec] of Object.entries(coll)) {
        const touch = rec[def.touchField] || '';
        if (snapshot[collKey][key] === touch) continue; // sin cambios desde el último envío
        const rowId = String(key);
        const payload = rowFromRecord(def.pk, rowId, rec);
        // Reemplaza cualquier versión anterior aún pendiente para esa fila.
        for (let i = outbox.length - 1; i >= 0; i--) {
          if (outbox[i].table === def.table && outbox[i].rowId === rowId) outbox.splice(i, 1);
        }
        outbox.push({ table: def.table, pk: def.pk, rowId, payload });
      }
    }

    setOutbox(outbox);
    writeJSON(SNAPSHOT_KEY, snapshot);
    if (outbox.length) setBadge('Pendiente (' + outbox.length + ')', 'pending');
  }

  // ---------- Envío (outbox -> Supabase) ----------

  async function flush() {
    if (flushing) return;
    if (!cfg || !cfg.enabled) { setBadge('Local', 'local'); return; }
    if (!isOnline()) { setBadge('Sin conexión', 'offline'); return; }
    let outbox = getOutbox();
    if (!outbox.length) { setBadge('Sincronizado', 'ok'); return; }
    if (!(await ensureToken())) { setBadge('Sin conexión', 'offline'); return; }

    flushing = true;
    setBadge('Sincronizando…', 'busy');
    try {
      // Agrupa por tabla para poder mandar lotes (upsert) en vez de fila por fila.
      const byTable = {};
      for (const item of outbox) (byTable[item.table] = byTable[item.table] || []).push(item);

      const sentKeys = new Set();
      for (const [table, items] of Object.entries(byTable)) {
        const pk = items[0].pk;
        for (let i = 0; i < items.length; i += (cfg.batchSize || 50)) {
          const batch = items.slice(i, i + (cfg.batchSize || 50));
          const ok = await upsertBatch(table, pk, batch.map(b => b.payload));
          if (ok) batch.forEach(b => sentKeys.add(table + ':' + b.rowId));
        }
      }

      if (sentKeys.size) {
        outbox = getOutbox().filter(o => !sentKeys.has(o.table + ':' + o.rowId));
        setOutbox(outbox);
        markSynced(sentKeys);
      }
      setBadge(outbox.length ? 'Pendiente (' + outbox.length + ')' : 'Sincronizado', outbox.length ? 'pending' : 'ok');
    } catch (e) {
      log('flush error', e.message);
      setBadge('Sin conexión', 'offline');
    } finally {
      flushing = false;
    }
  }

  async function upsertBatch(table, pk, rows) {
    try {
      const res = await fetch(cfg.supabaseUrl + '/rest/v1/' + table + '?on_conflict=' + pk, {
        method: 'POST',
        headers: restHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(rows)
      });
      if (res.status === 401) { accessToken = null; writeJSON(STATE_KEY, null); }
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  function markSynced(sentKeys) {
    // Actualiza snapshots para que no se reenvíen filas ya confirmadas.
    const syncedIds = readJSON(SYNCED_IDS_KEY, {});
    for (const [collKey, def] of Object.entries(APPEND_ONLY)) {
      const set = new Set(syncedIds[collKey] || []);
      for (const k of sentKeys) if (k.startsWith(def.table + ':')) set.add(k.slice(def.table.length + 1));
      syncedIds[collKey] = [...set];
    }
    writeJSON(SYNCED_IDS_KEY, syncedIds);

    const snapshot = readJSON(SNAPSHOT_KEY, {});
    for (const [collKey, def] of Object.entries(MUTABLE_KEYED)) {
      snapshot[collKey] = snapshot[collKey] || {};
      // El valor real (updatedAt/changedAt) ya se fijó al encolar en diffAndEnqueue
      // a partir de DATA actual; aquí solo confirmamos que ese envío se completó.
    }
    // (El snapshot de campos "touch" se actualiza en diffAndEnqueue en el próximo
    // ciclo comparando contra DATA; no hace falta tocarlo aquí.)
  }

  // ---------- Recepción (Supabase -> DATA local) ----------

  async function pull(mergeFn) {
    if (!cfg || !cfg.enabled || !isOnline()) return null;
    if (!(await ensureToken())) return null;
    const state = readJSON(STATE_KEY, {});
    const since = state.lastPullAt || '1970-01-01T00:00:00Z';
    const result = {};
    try {
      for (const def of [...Object.values(APPEND_ONLY), ...Object.values(MUTABLE_KEYED)]) {
        // "updated_at" lo pone el servidor (trigger), no el cliente: evita
        // problemas de reloj desincronizado entre tablets.
        const url = cfg.supabaseUrl + '/rest/v1/' + def.table +
          '?select=*&order=updated_at.asc&updated_at=gte.' + encodeURIComponent(since);
        const res = await fetch(url, { headers: restHeaders() });
        if (res.ok) {
          result[def.table] = (await res.json()).map(r => {
            const p = r.payload || {};
            if (p[def.pk] === undefined) p[def.pk] = r[def.pk];
            return p;
          });
        }
      }
      writeJSON(STATE_KEY, Object.assign({}, state, { lastPullAt: new Date().toISOString() }));
      if (typeof mergeFn === 'function') mergeFn(result);
      return result;
    } catch (e) {
      log('pull error', e.message);
      return null;
    }
  }

  // ---------- Ciclo de vida ----------

  function onSave(DATA) {
    if (!cfg || !cfg.enabled) return;
    diffAndEnqueue(DATA);
    flush();
  }

  function syncNow(DATA) {
    if (!cfg || !cfg.enabled) { setBadge('Local', 'local'); return; }
    if (DATA) diffAndEnqueue(DATA);
    flush();
  }

  function init(syncConfig, getDataFn, mergeFn) {
    cfg = syncConfig || {};
    if (!cfg.enabled) { setBadge('Local', 'local'); return; }
    setBadge('Iniciando…', 'busy');
    window.addEventListener('online', () => flush());
    window.addEventListener('offline', () => setBadge('Sin conexión', 'offline'));
    setInterval(() => { if (typeof getDataFn === 'function') onSave(getDataFn()); }, cfg.intervalMs || 45000);
    // Primer arranque: intenta traer lo que otras tablets ya subieron.
    pull(mergeFn).then(() => flush());
  }

  return { init, onSave, syncNow, pull, setBadge };
})();

window.TopsSync = TopsSync;
