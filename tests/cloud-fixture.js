/* A deterministic, local Supabase protocol fixture for browser regression tests. */
(() => {
  const coreTables = ['todos', 'memories', 'events', 'journals', 'trips', 'trip_items'];
  const cloud = { data: Object.fromEntries(coreTables.map(table => [table, []])), callbacks: [], mutations: 0 };
  cloud.data = JSON.parse(localStorage.getItem('__fixtureCloud') || 'null') || cloud.data;
  let session = { user: { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com' } };
  class Query {
    constructor(table) { this.table = table; this.operation = 'read'; this.filters = []; }
    select() { return this; }
    order() { return this; }
    eq(field, value) { this.filters.push([field, value]); return this; }
    maybeSingle() { this.single = true; return this; }
    insert(data) { this.operation = 'insert'; this.input = data; return this; }
    update(data) { this.operation = 'update'; this.input = data; return this; }
    delete() { this.operation = 'delete'; return this; }
    then(resolve, reject) {
      return Promise.resolve().then(() => {
        if (!navigator.onLine) return { error: { message: 'Network offline' }, data: null };
        const rows = cloud.data[this.table];
        const match = row => this.filters.every(([field, value]) => field === 'updated_at' ? Date.parse(row[field]) === Date.parse(value) : row[field] === value);
        let data;
        if (this.operation === 'insert') {
          if (rows.some(row => row.id === this.input.id)) return { error: { message: 'Duplicate id' }, data: null };
          const row = { created_at: new Date().toISOString(), ...structuredClone(this.input) };
          rows.push(row); data = [row]; cloud.mutations++;
        } else if (this.operation === 'update') {
          data = rows.filter(match).map(row => Object.assign(row, structuredClone(this.input))); cloud.mutations++;
        } else if (this.operation === 'delete') {
          data = rows.filter(match); cloud.data[this.table] = rows.filter(row => !match(row)); cloud.mutations++;
        } else data = rows.filter(match);
        localStorage.setItem('__fixtureCloud', JSON.stringify(cloud.data));
        return { data: structuredClone(this.single ? data[0] || null : data), error: null };
      }).then(resolve, reject);
    }
  }
  const client = {
    from(table) { return new Query(table); },
    auth: {
      async getSession() { return { data: { session }, error: null }; },
      onAuthStateChange(callback) { cloud.callbacks.push(callback); return { data: {} }; },
      async signInWithPassword() { session = { user: { id: '11111111-1111-4111-8111-111111111111', email: 'test@example.com' } }; cloud.callbacks.forEach(fn => fn('SIGNED_IN', session)); return { error: null }; },
      async signOut() { session = null; cloud.callbacks.forEach(fn => fn('SIGNED_OUT', null)); return { error: null }; }
    },
    channel() { return { on() { return this; }, subscribe() { return this; } }; },
    removeChannel() {},
    storage: { from() { return { async upload() { return { error: null }; }, async createSignedUrl() { return { error: null, data: { signedUrl: 'https://example.com/private.jpg' } }; } }; } }
  };
  window.supabase = { createClient() { return client; } };
  window.__cloud = cloud;
})();
