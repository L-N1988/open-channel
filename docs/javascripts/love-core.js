/* Shared, side-effect-free helpers. Also used by the Node regression tests. */
(function (root) {
  const tables = ['todos', 'memories', 'events', 'journals', 'trips', 'trip_items'];
  const fields = {
    todos: ['category', 'title', 'status', 'planned_date', 'note'],
    memories: ['type', 'title', 'location', 'memory_date', 'note', 'file_path', 'journal_id', 'mood', 'tags', 'latitude', 'longitude', 'media'],
    events: ['event_type', 'title', 'event_date', 'end_date', 'note', 'recurrence'],
    journals: ['title', 'note', 'cover_color'],
    trips: ['title', 'start_date', 'end_date', 'note'],
    trip_items: ['trip_id', 'title', 'item_date', 'item_time', 'position', 'location', 'latitude', 'longitude', 'note']
  };
  function dateISO(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function matchesDate(row, date) {
    const start = row.event_date || row.item_date;
    if (!start) return false;
    if (row.recurrence === 'yearly') {
      // Feb 29 anniversaries are observed on Feb 28 in non-leap years.
      let monthDay = start.slice(5);
      const year = Number(date.slice(0, 4));
      if (monthDay === '02-29' && new Date(year, 1, 29).getMonth() !== 1) monthDay = '02-28';
      return date >= start && date.slice(5) === monthDay;
    }
    return start <= date && date <= (row.end_date || start);
  }
  function upcoming(row, today = dateISO()) {
    if (row.recurrence !== 'yearly') return row.event_date >= today ? row.event_date : null;
    const startYear = Math.max(Number(today.slice(0, 4)), Number(row.event_date.slice(0, 4)));
    for (let year = startYear; year <= startYear + 1; year++) {
      let day = row.event_date.slice(5);
      if (day === '02-29' && new Date(year, 1, 29).getMonth() !== 1) day = '02-28';
      const candidate = `${year}-${day}`;
      if (candidate >= today) return candidate;
    }
    return null;
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
  }
  function coords(row) {
    return row.latitude !== null && row.latitude !== '' && row.latitude !== undefined &&
      row.longitude !== null && row.longitude !== '' && row.longitude !== undefined &&
      Number.isFinite(Number(row.latitude)) && Math.abs(Number(row.latitude)) <= 90 &&
      Number.isFinite(Number(row.longitude)) && Math.abs(Number(row.longitude)) <= 180;
  }
  function sameRevision(a, b) {
    if (!a || !b) return !a && !b;
    const precision = value => (value.match(/\.(\d+)/)?.[1] || '').padEnd(6, '0').slice(3);
    return Date.parse(a) === Date.parse(b) && precision(a) === precision(b);
  }
  function payload(table, row) {
    if (!fields[table]) throw new Error('Unknown table');
    const result = { id: row.id, updated_at: row.updated_at };
    for (const key of fields[table]) {
      if (row[key] !== undefined) result[key] = row[key] === '' ? null : row[key];
    }
    if (result.media) result.media = result.media.map(({ path, type, name }) => ({ path, type, name }));
    return result;
  }
  function filterMemories(rows, filters) {
    const query = (filters.query || '').trim().toLocaleLowerCase();
    return rows.filter(row => (!filters.type || row.type === filters.type) &&
      (!filters.journal || row.journal_id === filters.journal) &&
      (!filters.from || (row.memory_date || '') >= filters.from) &&
      (!filters.to || (row.memory_date || '') <= filters.to) &&
      (!query || [row.title, row.note, row.location, ...(row.tags || [])].join(' ').toLocaleLowerCase().includes(query)))
      .sort((a, b) => (b.memory_date || b.created_at || '').localeCompare(a.memory_date || a.created_at || ''));
  }
  const api = { tables, fields, dateISO, matchesDate, upcoming, daysBetween, coords, sameRevision, payload, filterMemories };
  root.LoveCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
