/* IndexedDB drafts, user-scoped cloud cache, and revision-aware foreground sync. */
(function () {
  const core = window.LoveCore;
  const config = window.LOVE_RECORD_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const client = configured && window.supabase ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;
  const empty = () => Object.fromEntries(core.tables.map(table => [table, []]));
  const state = { data: empty(), session: null, pending: [], conflicts: [], error: '', syncing: false, ready: false };
  let dbPromise, scope = 'local', realtime, refreshTimer, operation = Promise.resolve();
  const listeners = new Set();
  const broadcast = 'BroadcastChannel' in window ? new BroadcastChannel('love-record-v2') : null;
  function notify() { state.conflicts = state.pending.filter(item => item.conflict); listeners.forEach(fn => fn(state)); }
  function database() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('love-record-v2', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('无法打开本地存储，请检查浏览器存储权限。'));
    });
    return dbPromise;
  }
  async function kv(action, key, value) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', action === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('kv');
      const request = action === 'get' ? store.get(key) : action === 'put' ? store.put(value, key) : store.delete(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('存储空间不足，未保存。'));
    });
  }
  function serial(fn) {
    const execute = () => navigator.locks ? navigator.locks.request('love-record-v2', fn) : fn();
    const run = operation.then(execute, execute);
    operation = run.catch(() => {});
    return run;
  }
  async function persist() {
    await kv('put', `snapshot:${scope}`, { data: state.data, pending: state.pending });
    broadcast?.postMessage({ scope });
  }
  async function restore() {
    let saved = await kv('get', `snapshot:${scope}`);
    if (!saved && scope === 'local') {
      const data = empty();
      // Copy old drafts without deleting their original storage.
      for (const table of core.tables) {
        try { data[table] = JSON.parse(localStorage.getItem(`love-record.${table}`) || '[]'); } catch { data[table] = []; }
      }
      saved = { data, pending: [] };
      await kv('put', 'snapshot:local', saved);
    }
    state.data = { ...empty(), ...(saved?.data || {}) };
    state.pending = saved?.pending || [];
    state.conflicts = state.pending.filter(item => item.conflict);
  }
  function writable() {
    if (configured && !client) throw new Error('云端连接库未加载。请联网重试，现有草稿不会改变。');
    if (configured && !state.session) throw new Error('请先登录。');
    if (!configured && config.enableLocalDraftMode === false) throw new Error('本地记录已关闭，请配置同步。');
  }
  function uuid() { return crypto.randomUUID(); }
  async function save(table, values, files = []) {
    return serial(async () => {
      writable();
      await restore();
      if (!core.tables.includes(table)) throw new Error('未知记录类型');
      const previous = state.data[table].find(row => row.id === values.id);
      const row = { ...previous, ...values, id: values.id || uuid(), created_at: previous?.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
      for (const file of files) {
        if (file.size > 100 * 1024 * 1024) throw new Error('单个文件不能超过 100 MB。');
        if (!/^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|webm))$/.test(file.type)) throw new Error('支持 JPG、PNG、WebP、GIF、MP4、MOV 和 WebM。');
      }
      if (files.length) {
        row.media = [];
        for (const file of files) {
          const blobId = uuid();
          await kv('put', `blob:${scope}:${blobId}`, file);
          row.media.push({ blobId, name: file.name, type: file.type, path: null });
        }
        row.file_path = null;
        delete row.file_data_url;
      }
      const oldData = state.data, oldPending = state.pending;
      state.data = { ...state.data, [table]: [row, ...state.data[table].filter(item => item.id !== row.id)] };
      if (configured) {
        const queued = state.pending.find(item => item.table === table && item.id === row.id);
        state.pending = [...state.pending.filter(item => !(item.table === table && item.id === row.id)), {
          table, id: row.id, kind: 'save', row, base: queued ? queued.base : previous?.updated_at || null, conflict: queued?.conflict || false
        }];
      }
      try { await persist(); } catch (error) { state.data = oldData; state.pending = oldPending; throw error; }
      notify();
      return row;
    });
  }
  async function remove(table, id) {
    return serial(async () => {
      writable();
      await restore();
      const previous = state.data[table].find(row => row.id === id);
      if (!previous) return;
      if (table === 'journals' && state.data.memories.some(row => row.journal_id === id)) throw new Error('请先移走这本时光集中的回忆，再删除。');
      if (table === 'trips' && state.data.trip_items.some(row => row.trip_id === id)) throw new Error('请先删除每日安排，再删除旅行。');
      const oldData = state.data, oldPending = state.pending;
      state.data = { ...state.data, [table]: state.data[table].filter(row => row.id !== id) };
      if (configured) {
        const queued = state.pending.find(item => item.table === table && item.id === id);
        state.pending = state.pending.filter(item => !(item.table === table && item.id === id));
        if (!queued || queued.base) state.pending.push({ table, id, kind: 'delete', base: queued ? queued.base : previous.updated_at });
      }
      try { await persist(); } catch (error) { state.data = oldData; state.pending = oldPending; throw error; }
      notify();
    });
  }
  async function cloudRow(table, id) {
    const result = await client.from(table).select('*').eq('id', id).maybeSingle();
    if (result.error) throw result.error;
    return result.data;
  }
  async function push(item) {
    if (item.conflict) return false;
    const remote = await cloudRow(item.table, item.id);
    // Retried request already succeeded before the connection disappeared.
    if (item.kind === 'save' && remote && core.sameRevision(remote.updated_at, item.row.updated_at)) return true;
    if (item.kind === 'delete' && !remote) return true;
    if (!core.sameRevision(remote?.updated_at, item.base)) {
      item.conflict = true; item.remote = remote;
      return false;
    }
    if (item.kind === 'delete') {
      const result = await client.from(item.table).delete().eq('id', item.id).eq('updated_at', item.base).select();
      if (result.error) throw result.error;
      if (!result.data.length) { item.conflict = true; item.remote = await cloudRow(item.table, item.id); return false; }
      return true;
    }
    if (item.row.media) {
      for (const media of item.row.media) {
        if (media.path && media.blobId) await kv('put', `media-path:${scope}:${media.path}`, media.blobId);
        if (media.path || !media.blobId) continue;
        const blob = await kv('get', `blob:${scope}:${media.blobId}`);
        if (!blob) throw new Error('找不到待上传文件，请重新选择。');
        const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' })[media.type];
        const path = `${state.session.user.id}/${item.id}/${media.blobId}.${extension}`;
        const result = await client.storage.from(config.mediaBucket || 'love-media').upload(path, blob, { upsert: true, contentType: media.type });
        if (result.error) throw result.error;
        media.path = path;
        await kv('put', `media-path:${scope}:${path}`, media.blobId);
        await persist();
      }
    }
    const data = core.payload(item.table, item.row);
    const query = remote ? client.from(item.table).update(data).eq('id', item.id).eq('updated_at', item.base) : client.from(item.table).insert(data);
    const result = await query.select();
    if (result.error) throw result.error;
    if (!result.data.length) { item.conflict = true; item.remote = await cloudRow(item.table, item.id); return false; }
    return true;
  }
  async function sync() {
    return serial(async () => {
      if (!client || !state.session || !navigator.onLine) { notify(); return; }
      await restore();
      state.syncing = true; state.error = ''; notify();
      try {
        // Parents are pushed before children, regardless of when drafts were edited.
        const order = ['journals', 'trips', 'todos', 'events', 'memories', 'trip_items'];
        const queue = state.pending.slice().sort((a, b) => {
          const aa = order.indexOf(a.table), bb = order.indexOf(b.table);
          return a.kind === 'delete' && b.kind === 'delete' ? bb - aa : a.kind === 'delete' ? 1 : b.kind === 'delete' ? -1 : aa - bb;
        });
        for (const item of queue) {
          if (await push(item)) state.pending = state.pending.filter(other => other !== item);
          await persist();
        }
        const results = await Promise.all(core.tables.map(table => client.from(table).select('*').order('created_at', { ascending: false })));
        for (const result of results) if (result.error) throw result.error;
        const data = empty();
        core.tables.forEach((table, index) => { data[table] = results[index].data || []; });
        for (const item of state.pending) {
          data[item.table] = data[item.table].filter(row => row.id !== item.id);
          if (item.kind === 'save') data[item.table].unshift(item.row);
        }
        state.data = data;
        await persist();
      } catch (error) {
        state.error = `${error.message || error}（草稿已保留，可稍后重试）`;
      } finally {
        state.conflicts = state.pending.filter(item => item.conflict);
        state.syncing = false; notify();
      }
    });
  }
  async function resolve(table, id, choice) {
    await serial(async () => {
      writable();
      await restore();
      const item = state.pending.find(row => row.table === table && row.id === id && row.conflict);
      if (!item) return;
      if (choice === 'remote') {
        state.pending = state.pending.filter(row => row !== item);
        state.data[table] = state.data[table].filter(row => row.id !== id);
        if (item.remote) state.data[table].unshift(item.remote);
      } else {
        item.base = item.remote?.updated_at || null;
        item.conflict = false;
        if (item.kind === 'save') item.row.updated_at = new Date().toISOString();
      }
      await persist();
    });
    await sync();
  }
  async function setSession(session) {
    return serial(async () => {
      const next = configured ? session ? `cloud:${session.user.id}` : 'locked' : 'local';
      const changed = next !== scope || !state.ready;
      state.session = session;
      if (changed) {
        scope = next; state.error = ''; state.data = empty(); state.pending = []; state.conflicts = [];
        if (scope !== 'locked') await restore();
        state.ready = true;
        if (realtime) { client.removeChannel(realtime); realtime = null; }
        if (session && client) {
          realtime = client.channel(`love-record:${session.user.id}`);
          for (const table of core.tables) realtime.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
            clearTimeout(refreshTimer); refreshTimer = setTimeout(() => sync(), 300);
          });
          realtime.subscribe();
        }
      }
      notify();
    });
  }
  async function init() {
    try {
      if (configured && !client) throw new Error('同步库未加载，请联网重试。');
      if (client) {
        const result = await client.auth.getSession();
        if (result.error) throw result.error;
        await setSession(result.data.session);
        client.auth.onAuthStateChange((event, session) => {
          // Leave the Auth callback before using any Supabase methods.
          setTimeout(async () => { await setSession(session); await sync(); }, 0);
        });
      } else await setSession(null);
      await sync();
    } catch (error) { state.error = error.message; state.ready = true; notify(); }
  }
  async function mediaBlob(id) { return kv('get', `blob:${scope}:${id}`); }
  async function mediaURL(media) {
    const blobId = media.blobId || (media.path ? await kv('get', `media-path:${scope}:${media.path}`) : null);
    if (blobId) {
      const blob = await mediaBlob(blobId);
      if (blob) return URL.createObjectURL(blob);
    }
    if (media.path && client && state.session && navigator.onLine) {
      const result = await client.storage.from(config.mediaBucket || 'love-media').createSignedUrl(media.path, config.signedUrlSeconds || 3600);
      if (result.error) throw result.error;
      return result.data.signedUrl;
    }
    return '';
  }
  async function exportLocal() {
    if (configured) throw new Error('请在本地模式导出草稿。');
    const copy = structuredClone(state.data);
    for (const row of copy.memories) for (const media of row.media || []) {
      if (!media.blobId) continue;
      const blob = await mediaBlob(media.blobId);
      if (blob) media.dataURL = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
      });
      delete media.blobId;
    }
    return JSON.stringify({ version: 2, exported_at: new Date().toISOString(), data: copy }, null, 2);
  }
  async function importLocal(text) {
    return serial(async () => {
      writable();
      if (configured) throw new Error('请在本地模式恢复备份。');
      await restore();
      let backup;
      try { backup = JSON.parse(text); } catch { throw new Error('备份不是有效的 JSON。'); }
      if (backup.version !== 2 || !backup.data || typeof backup.data !== 'object') throw new Error('不支持的备份格式。');
      const data = structuredClone(state.data), blobs = [];
      for (const table of core.tables) {
        if (!Array.isArray(backup.data[table])) throw new Error(`备份缺少 ${table} 记录。`);
        const ids = new Set();
        for (const source of backup.data[table]) {
          if (!source || typeof source.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(source.id) || ids.has(source.id) || typeof source.title !== 'string' || !source.title.trim()) throw new Error('备份包含无效或重复的记录。');
          ids.add(source.id);
          const row = { id: source.id, title: source.title, created_at: source.created_at || new Date().toISOString(), updated_at: source.updated_at || new Date().toISOString() };
          for (const field of core.fields[table]) if (source[field] !== undefined) row[field] = source[field];
          if (table === 'memories') {
            if (row.tags && (!Array.isArray(row.tags) || row.tags.some(tag => typeof tag !== 'string'))) throw new Error('备份的标签格式无效。');
            if (row.media && !Array.isArray(row.media)) throw new Error('备份的附件格式无效。');
            row.media = (row.media || []).map(media => {
              if (!media || typeof media.type !== 'string') throw new Error('备份的媒体格式无效。');
              if (media.dataURL) {
                const match = /^data:(image\/(?:jpeg|png|webp|gif)|video\/(?:mp4|quicktime|webm));base64,([A-Za-z0-9+/=\s]+)$/.exec(media.dataURL);
                if (!match || match[1] !== media.type) throw new Error('备份含有不支持的媒体。');
                const decoded = atob(match[2]);
                if (decoded.length > 100 * 1024 * 1024) throw new Error('备份附件超过 100 MB。');
                const blobId = uuid(), bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
                blobs.push([`blob:${scope}:${blobId}`, new Blob([bytes], { type: media.type })]);
                return { blobId, name: String(media.name || '附件'), type: media.type, path: null };
              }
              return { path: media.path || null, name: String(media.name || '附件'), type: media.type };
            });
            // Preserve media from legacy localStorage exports.
            if (source.file_data_url && /^data:(image|video)\//.test(source.file_data_url)) row.file_data_url = source.file_data_url;
          }
          for (const key of ['memory_date', 'event_date', 'end_date', 'start_date', 'item_date', 'planned_date']) {
            if (row[key] && (typeof row[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row[key]))) throw new Error('备份的日期格式无效。');
          }
          if ((row.latitude != null || row.longitude != null) && !core.coords(row)) throw new Error('备份坐标无效。');
          data[table] = [row, ...data[table].filter(item => item.id !== row.id)];
        }
      }
      for (const row of data.memories) if (row.journal_id && !data.journals.some(journal => journal.id === row.journal_id)) throw new Error('备份引用了不存在的时光集。');
      for (const row of data.trip_items) if (!data.trips.some(trip => trip.id === row.trip_id && row.item_date >= trip.start_date && row.item_date <= trip.end_date)) throw new Error('备份的旅行安排无效。');
      const db = await database();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite'), entries = tx.objectStore('kv');
        blobs.forEach(([key, value]) => entries.put(value, key));
        entries.put({ data, pending: [] }, 'snapshot:local');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      state.data = data; broadcast?.postMessage({ scope }); notify();
    });
  }
  if (broadcast) broadcast.onmessage = event => {
    if (state.ready && event.data.scope === scope && scope !== 'locked') serial(async () => { await restore(); notify(); }).catch(error => { state.error = error.message; notify(); });
  };
  window.addEventListener('online', () => sync());
  window.addEventListener('offline', notify);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  window.LoveStore = {
    state, client, configured, save, remove, sync, resolve, mediaURL, exportLocal, importLocal,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    ready: init()
  };
})();
