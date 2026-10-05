(function () {
  const core = window.LoveCore, store = window.LoveStore, icon = window.LoveIcon;
  const labels = { movie: '电影', restaurant: '餐厅', city: '城市', ritual: '小仪式', planned: '计划中', done: '已完成', photo: '照片', video: '视频', moment: '瞬间', essay: '随笔', anniversary: '纪念日', festival: '节日', birthday: '生日', trip: '出游计划' };
  const moods = { happy: '开心', calm: '平静', excited: '期待', tired: '疲惫', sad: '低落' };
  const base = new URL('../', document.querySelector('script[src*="javascripts/love-record.js"]').src);
  const link = (path = '') => new URL(path, base).href;
  let root, page, generation = 0, calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1), selectedDay = core.dateISO(), map, objectURLs = [], installPrompt;
  let filters = { query: '', type: '', journal: '', from: '', to: '' };
  let selectedTrip = '', composer = 'memory', renderedIdentity, discoveryTab = 'journals', featuredId = '';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const fmt = value => value ? escape(value.replace(/-/g, '.')) : '未设置日期';
  const empty = text => `<div class="empty-state"><p>${escape(text)}</p><a class="soft-button" href="${link('record/')}">＋ 留下一条记录</a></div>`;
  const options = (values, selected = '') => Object.entries(values).map(([value, label]) => `<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>${escape(label)}</option>`).join('');
  const button = (action, text, extra = '') => `<button type="button" data-action="${action}" ${extra}>${text}</button>`;
  function notify(message, error = false) {
    const target = document.querySelector('[data-app-message]');
    if (!target) return;
    target.textContent = message; target.classList.toggle('is-error', error); target.hidden = !message;
    target.setAttribute('role', error ? 'alert' : 'status');
  }
  function status() {
    const state = store.state;
    if (!state.ready) return '正在打开时光档案…';
    if (!store.configured) return '本地记录 · 保存在当前浏览器';
    if (!state.session) return '登录后打开共享档案';
    if (state.syncing) return '正在同步…';
    if (state.pending.length) return `${navigator.onLine ? '待同步' : '离线草稿'} · ${state.pending.length} 条${state.conflicts.length ? ` · ${state.conflicts.length} 个冲突` : ''}`;
    return navigator.onLine ? '已同步 · 两个人的档案' : '离线 · 显示最近同步的记录';
  }
  function cleanup() {
    if (map) { map.remove(); map = null; }
    objectURLs.forEach(url => URL.revokeObjectURL(url)); objectURLs = [];
  }
  function navigation() {
    const items = [['', '首页', 'home'], ['journals/', '发现', 'book'], ['trips/', '旅行', 'plane'], ['settings/', '我的', 'user']];
    const nav = document.querySelector('[data-app-nav]');
    if (nav) nav.innerHTML = items.map(([path, title, symbol]) => `<a href="${link(path)}" ${((path === 'journals/' && ['journals', 'memories', 'photos', 'videos', 'insights', 'map', 'calendar', 'todos'].includes(document.querySelector('[data-app-page]')?.dataset.appPage)) || new URL(link(path)).pathname === location.pathname || (!path && location.pathname.endsWith('/index.html'))) ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${title}</span></a>`).join('');
    const capture = document.querySelector('[data-capture-link]');
    if (capture) { capture.href = link('record/'); capture.innerHTML = icon('plus'); }
  }
  function mount() {
    cleanup(); generation++;
    root = document.querySelector('[data-app-page]'); page = root?.dataset.appPage;
    navigation();
    if (!root) return;
    renderedIdentity = store.state.session?.user.id || 'none';
    root.innerHTML = `<div class="app-status"><span data-status></span>${button('sync', icon('refresh') + '<span>刷新同步</span>')}</div><p class="app-message" data-app-message role="status" hidden></p><section data-conflicts></section><div data-page-body></div>`;
    root.append(root.querySelector('.app-status'));
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('reset', event => {
      const form = event.target;
      queueMicrotask(() => {
        if (!form.isConnected) return;
        if (form.elements.id) form.elements.id.value = '';
        const title = form.querySelector('h2');
        if (title && form.closest('[data-composer]')) title.textContent = `新增${{ memory: '回忆', todo: '代办', event: '日期', journal: '时光集', trip: '旅行', trip_item: '每日安排' }[composer]}`;
        const attachments = form.querySelector('[data-existing-media]');
        if (attachments) attachments.textContent = '';
      });
    });
    const body = root.querySelector('[data-page-body]');
    if (page === 'record') {
      composer = new URLSearchParams(location.search).get('kind') || 'memory';
      if (!['memory', 'todo', 'event', 'journal', 'trip', 'trip_item'].includes(composer)) composer = 'memory';
      body.innerHTML = `<div data-auth></div><div class="composer-tabs" role="group" aria-label="记录类型">${[['memory', '瞬间 / 随笔'], ['todo', '代办'], ['event', '重要日期'], ['journal', '时光集'], ['trip', '旅行'], ['trip_item', '每日安排']].map(([kind, title]) => button('compose', title, `data-kind="${kind}"`)).join('')}</div><div data-composer></div><h2>管理记录</h2><div data-manage></div>`;
      renderComposer();
    } else if (page === 'memories') {
      filters.journal = new URLSearchParams(location.search).get('journal') || '';
      body.innerHTML = `<div class="app-toolbar" data-filters><label>搜索<input name="query" type="search" placeholder="标题、文字、地点或标签" /></label><label>类型<select name="type"><option value="">全部类型</option>${options({ moment: '瞬间', essay: '随笔', photo: '照片', video: '视频' })}</select></label><label>时光集<select name="journal" data-journal-filter></select></label><label>从<input name="from" type="date" /></label><label>到<input name="to" type="date" /></label></div><p data-result-count></p><div class="timeline" data-timeline></div>`;
      Object.entries(filters).forEach(([key, value]) => { const field = body.querySelector(`[name="${key}"]`); if (field) field.value = value; });
    } else if (page === 'trips') {
      selectedTrip = new URLSearchParams(location.search).get('trip') || '';
      body.innerHTML = `<div class="app-toolbar"><a class="soft-button" href="${link('record/?kind=trip')}">＋ 新旅行</a><label>选择旅行<select data-trip-select></select></label></div><div data-trips></div>`;
    } else if (page === 'calendar') body.innerHTML = '<div data-calendar></div>';
    else if (page === 'map') body.innerHTML = '<div data-map-view></div>';
    else if (page === 'settings') body.innerHTML = `<div data-auth></div><div class="app-card"><h2>随身携带这本档案</h2><p>添加到主屏幕；访问过的页面可以离线打开。本地记录与离线草稿保存在这个浏览器。</p>${button('install', '安装 / 添加到主屏幕')}<p data-install-help></p><h3>本地草稿备份</h3><p>导出包含本地照片和视频的 JSON 备份；恢复会合并记录，相同编号使用备份内容。</p>${button('export', '导出本地备份')}<label class="backup-label">恢复备份<input type="file" accept="application/json,.json" data-import /></label><p>本地草稿不会自动并入云端账号；两种档案分开保存。</p><a href="${link('supabase-setup/')}">管理员同步设置</a></div>`;
    else if (page === 'journals') {
      body.innerHTML = `<p class="page-intro">翻翻你的小本，继续把新的印记收进来</p><div class="discovery-tabs" role="group" aria-label="发现视图">${button('discover', '我的小本', 'data-tab="journals"')}${button('discover', '功能中心', 'data-tab="features"')}</div><div data-generic-view></div>`;
    } else body.innerHTML = `<div data-generic-view></div>`;
    render();
  }
  function field(name, title, type = 'text', extra = '') { return `<label>${title}<input name="${name}" type="${type}" ${extra} /></label>`; }
  function textarea(name, title) { return `<label>${title}<textarea name="${name}" rows="4"></textarea></label>`; }
  function select(name, title, values, extra = '') { return `<label>${title}<select name="${name}" ${extra}>${options(values)}</select></label>`; }
  function geoFields() { return `<div class="field-pair">${field('latitude', '纬度', 'number', 'step="any" min="-90" max="90"')}${field('longitude', '经度', 'number', 'step="any" min="-180" max="180"')}</div>${button('locate', '使用当前位置')}<small>仅在点击后请求定位权限。</small>`; }
  function renderComposer() {
    const target = root?.querySelector('[data-composer]');
    if (!target) return;
    const names = { memory: '回忆', todo: '代办', event: '日期', journal: '时光集', trip: '旅行', trip_item: '每日安排' };
    let content = field('title', '标题', 'text', 'required maxlength="200"');
    if (composer === 'memory') content += select('type', '记录方式', { moment: '瞬间', essay: '随笔', photo: '照片', video: '视频' }) + field('memory_date', '记录日期', 'date', `required value="${core.dateISO()}"`) + `<label>照片 / 视频（可多选；编辑时新文件替换原附件）<input type="file" name="files" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm" /></label>` + `<div data-existing-media></div>` + `<label>时光集<select name="journal_id" data-journal-options></select></label>` + select('mood', '心情', { '': '暂不选择', ...moods }) + field('tags', '标签（用逗号分隔）') + field('location', '地点') + geoFields() + textarea('note', '回忆文字');
    if (composer === 'todo') content += select('category', '分类', { movie: '电影', restaurant: '餐厅', city: '城市', ritual: '小仪式' }) + field('planned_date', '计划日期', 'date') + select('status', '状态', { planned: '计划中', done: '已完成' }) + textarea('note', '备注');
    if (composer === 'event') content += select('event_type', '日期类型', { anniversary: '纪念日', birthday: '生日', festival: '节日', trip: '出游计划' }) + field('event_date', '开始日期', 'date', 'required') + field('end_date', '结束日期', 'date') + select('recurrence', '重复', { none: '不重复', yearly: '每年（单日纪念日）' }) + textarea('note', '备注');
    if (composer === 'journal') content += select('cover_color', '封面颜色', { rose: '玫瑰', blue: '晴空', sage: '青绿', lilac: '淡紫' }) + textarea('note', '这本时光集的故事');
    if (composer === 'trip') content += field('start_date', '出发日期', 'date', 'required') + field('end_date', '结束日期', 'date', 'required') + textarea('note', '旅行笔记');
    if (composer === 'trip_item') content += `<label>所属旅行<select name="trip_id" data-trip-options required></select></label>` + field('item_date', '日期', 'date', 'required') + field('item_time', '时间', 'time') + field('position', '当天排序', 'number', 'min="0" value="0" required') + field('location', '地点') + geoFields() + textarea('note', '安排 / 交通 / 预订');
    target.innerHTML = `<form class="record-form app-composer" data-form="${composer}"><input type="hidden" name="id" /><h2>新增${names[composer]}</h2>${content}<div class="form-actions"><button type="submit">保存${names[composer]}</button><button type="reset">取消编辑 / 清空</button></div></form>`;
    root.querySelectorAll('[data-action="compose"]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.kind === composer)));
    populateSelects();
    const params = new URLSearchParams(location.search);
    if (params.get('trip') && composer === 'trip_item') target.querySelector('[name="trip_id"]').value = params.get('trip');
  }
  function populateSelects() {
    if (!root) return;
    const data = store.state.data;
    for (const target of root.querySelectorAll('[data-journal-options], [data-journal-filter]')) {
      const current = target.hasAttribute('data-journal-filter') ? filters.journal : target.value;
      target.innerHTML = `<option value="">${target.hasAttribute('data-journal-filter') ? '全部时光集' : '未归入时光集'}</option>${options(Object.fromEntries(data.journals.map(row => [row.id, row.title])), current)}`;
    }
    for (const target of root.querySelectorAll('[data-trip-options], [data-trip-select]')) {
      const current = target.hasAttribute('data-trip-select') ? selectedTrip : target.value;
      target.innerHTML = `<option value="">${target.hasAttribute('data-trip-select') ? '全部旅行' : '请选择旅行'}</option>${options(Object.fromEntries(data.trips.map(row => [row.id, row.title])), current)}`;
    }
  }
  function renderAuth() {
    const target = root?.querySelector('[data-auth]');
    if (!target) return;
    const identity = store.configured ? store.state.session?.user.id || 'logged-out' : 'local';
    if (target.dataset.identity === identity) return;
    target.dataset.identity = identity;
    target.innerHTML = !store.configured ? '<div class="app-card"><p>当前使用本地档案，无需登录。配置同步后，两个人可以共享记录。</p></div>' : store.state.session ? `<div class="app-card"><p>已登录：${escape(store.state.session.user.email)}</p>${button('logout', '退出账号')}</div>` : `<form class="record-form" data-form="auth"><h2>打开共享档案</h2>${field('email', '邮箱', 'email', 'required autocomplete="email"')}${field('password', '密码', 'password', 'required autocomplete="current-password"')}<button type="submit">登录</button><p>请使用管理员已创建的账号。</p></form>`;
  }
  function actionLinks(table, row) {
    return `<div class="manage-actions">${table === 'todos' ? button('toggle', row.status === 'done' ? '恢复' : '完成', `data-id="${escape(row.id)}"`) : ''}${button('edit', '编辑', `data-table="${table}" data-id="${escape(row.id)}"`)}${button('delete', '删除', `data-table="${table}" data-id="${escape(row.id)}"`)}</div>`;
  }
  function renderConflicts() {
    const target = root.querySelector('[data-conflicts]');
    target.innerHTML = store.state.conflicts.map(item => `<article class="app-card conflict-card"><h3>这条记录在另一台设备上发生了变化</h3><p>本地：${escape(item.row?.title || '删除记录')}</p><p>云端：${escape(item.remote?.title || '已删除')}</p><details><summary>比较内容</summary><pre>${escape(JSON.stringify({ local: item.row || null, remote: item.remote || null }, null, 2))}</pre></details>${button('resolve', '使用云端版本', `data-table="${item.table}" data-id="${item.id}" data-choice="remote"`)}${button('resolve', '保留我的修改', `data-table="${item.table}" data-id="${item.id}" data-choice="local"`)}</article>`).join('');
  }
  async function cards(rows, token, manage = false) {
    const result = [];
    for (const row of rows) {
      let attachments = row.media || [];
      if (!attachments.length && (row.file_path || row.file_data_url || row.file_url)) attachments = [{ path: row.file_path, dataURL: row.file_data_url, url: row.file_url, type: row.type === 'video' ? 'video/mp4' : 'image/jpeg' }];
      const media = [];
      for (const attachment of attachments) {
        let url = '';
        try { url = attachment.dataURL || attachment.url || await store.mediaURL(attachment); } catch { /* A record remains readable if its attachment cannot load. */ }
        if (token !== generation) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return ''; }
        if (url.startsWith('blob:')) objectURLs.push(url);
        if (!/^(https?:\/\/|blob:|data:(image|video)\/)/i.test(url)) url = '';
        if (url) media.push(attachment.type?.startsWith('video') ? `<video src="${escape(url)}" controls playsinline preload="metadata" aria-label="${escape(row.title)}"></video>` : `<img src="${escape(url)}" alt="${escape(row.title)}" loading="lazy" />`);
        else media.push('<p class="attachment-placeholder">附件暂不可用，请联网后查看。</p>');
      }
      const journal = store.state.data.journals.find(item => item.id === row.journal_id);
      result.push(`<article class="app-card memory-entry"><div class="entry-meta"><time>${fmt(row.memory_date)}</time><span>${escape(labels[row.type] || '回忆')}${moods[row.mood] ? ` · ${moods[row.mood]}` : ''}</span></div><h2>${escape(row.title)}</h2><div class="entry-media">${media.join('')}</div><p class="entry-note">${escape(row.note)}</p><p>${escape(row.location)}${journal ? ` · ${escape(journal.title)}` : ''}</p><div class="memory-pills">${(row.tags || []).map(tag => `<span>${escape(tag)}</span>`).join('')}</div>${manage ? actionLinks('memories', row) : `<a href="${link(`record/?kind=memory&edit=${encodeURIComponent(row.id)}`)}">编辑回忆</a>`}</article>`);
    }
    return result.join('') || empty('还没有匹配的回忆。');
  }
  function calendarHTML() {
    const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth(), first = new Date(year, month, 1), days = new Date(year, month + 1, 0).getDate();
    const all = [...store.state.data.events, ...store.state.data.trip_items.map(row => ({ ...row, event_date: row.item_date, event_type: 'trip' }))];
    const cells = Array.from({ length: (first.getDay() + 6) % 7 }, () => '<span aria-hidden="true"></span>');
    for (let day = 1; day <= days; day++) {
      const date = core.dateISO(new Date(year, month, day));
      const events = all.filter(row => core.matchesDate(row, date));
      const memories = store.state.data.memories.filter(row => row.memory_date === date);
      cells.push(`<button type="button" data-action="day" data-date="${date}" aria-pressed="${selectedDay === date}" aria-label="${date}，${events.length} 个安排，${memories.length} 条回忆" class="calendar-day ${date === core.dateISO() ? 'is-today' : ''} ${events.length || memories.length ? 'has-events' : ''}"><span>${day}</span><small>${events.length || memories.length ? `${events.length + memories.length} 条` : ''}</small></button>`);
    }
    const events = all.filter(row => core.matchesDate(row, selectedDay));
    const memories = store.state.data.memories.filter(row => row.memory_date === selectedDay);
    return `<div class="calendar-layout"><section class="app-card"><div class="month-head">${button('month', '←', 'data-delta="-1" aria-label="上个月"')}<h2>${year} 年 ${month + 1} 月</h2>${button('month', '→', 'data-delta="1" aria-label="下个月"')}</div>${button('today', '回到今天')}<div class="calendar-grid"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span>${cells.join('')}</div></section><section class="app-card"><h2>${fmt(selectedDay)}</h2>${events.map(row => `<article class="day-entry"><h3>${escape(row.title)}</h3><p>${escape(row.note || '')}${row.recurrence === 'yearly' ? ' · 每年纪念' : ''}</p></article>`).join('')}${memories.map(row => `<article class="day-entry"><a href="${link(`record/?kind=memory&edit=${row.id}`)}">${escape(row.title)}</a><p>${escape(row.note)}</p></article>`).join('')}${!events.length && !memories.length ? '<p>给这一天留一点故事。</p>' : ''}<a href="${link('record/?kind=event')}">＋ 添加重要日期</a></section></div>`;
  }
  function sectionTitle(title, symbol, url = '', action = '') {
    return `<div class="section-title"><h2>${symbol ? icon(symbol) : ''}${title}</h2>${url ? `<a href="${url}">查看全部 ${icon('arrow')}</a>` : action}</div>`;
  }
  function memoryAttachments(row) {
    if (row.media?.length) return row.media;
    return row.file_path || row.file_data_url || row.file_url ? [{ path: row.file_path, dataURL: row.file_data_url, url: row.file_url, type: row.type === 'video' ? 'video/mp4' : 'image/jpeg' }] : [];
  }
  async function coverURL(row, token) {
    const media = row && memoryAttachments(row).find(item => item.type?.startsWith('image/'));
    if (!media) return '';
    let url = '';
    try { url = media.dataURL || media.url || await store.mediaURL(media); } catch { return ''; }
    if (token !== generation) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return ''; }
    if (!/^(https?:\/\/|blob:|data:image\/)/i.test(url)) return '';
    if (url.startsWith('blob:')) objectURLs.push(url);
    return url;
  }
  async function journalCards(rows, token, manage = false) {
    const markup = [];
    for (const row of rows) {
      const memories = core.filterMemories(store.state.data.memories.filter(item => item.journal_id === row.id), {});
      const photo = memories.find(item => memoryAttachments(item).some(media => media.type?.startsWith('image/')));
      const url = await coverURL(photo, token);
      const color = ['rose', 'blue', 'sage', 'lilac'].includes(row.cover_color) ? row.cover_color : 'rose';
      markup.push(`<article class="journal-cover cover-${color}"><a class="journal-link" href="${link(`memories/?journal=${row.id}`)}"><div class="journal-art">${url ? `<img src="${escape(url)}" alt="${escape(row.title)}的封面" loading="lazy" />` : `<div class="journal-drawing">${icon('book')}<span class="journal-lines"></span></div>`}<span class="journal-badge">${memories.some(item => item.type === 'essay') ? '随笔' : '瞬间'}</span></div><div class="journal-caption"><h3>${escape(row.title)}</h3><p>${memories.length} 个瞬间</p></div></a>${manage ? actionLinks('journals', row) : ''}</article>`);
    }
    return markup.join('');
  }
  async function journalsHTML(token) {
    return `<div class="journal-grid">${await journalCards(store.state.data.journals, token, true) || empty('给那些想记住的日子，建一本小本。')}</div><a class="new-journal-link" href="${link('record/?kind=journal')}">${icon('plus')}新建小本</a>`;
  }
  function featuresHTML() {
    const data = store.state.data;
    const photos = data.memories.reduce((total, row) => total + memoryAttachments(row).filter(media => media.type?.startsWith('image/')).length, 0);
    const days = new Set(data.memories.map(row => row.memory_date).filter(Boolean)).size;
    const tags = new Set(data.memories.flatMap(row => row.tags || [])).size;
    const locations = [...data.memories, ...data.trip_items].filter(core.coords).length;
    const tiles = [
      ['calendar', 'blue', '时序回看', '按时间翻看回忆', 'memories/'],
      ['tags', 'violet', '标签云', `${tags} 个标签`, 'insights/'],
      ['shuffle', 'pink', '随机回看', '打开一个惊喜', '', 'random-memory'],
      ['map', 'green', '地点地图', `${locations} 个地点`, 'map/'],
      ['smile', 'blue', '心情统计', '看看生活的颜色', 'insights/'],
      ['calendar', 'gold', '纪念日历', '记得每一个重要日子', 'calendar/'],
      ['photo', 'pink', '照片墙', '留住镜头里的温柔', 'photos/'],
      ['check', 'green', '一起想做的事', '把期待慢慢实现', 'todos/']
    ];
    return `${sectionTitle('数据统计', 'chart')}<div class="feature-stats">${[[data.memories.length, '总回忆', 'pink'], [photos, '照片', 'blue'], [days, '记录天', 'gold']].map(([count, title, color]) => `<div class="feature-stat tone-${color}"><strong>${count}</strong><span>${title}</span></div>`).join('')}</div>${sectionTitle('快捷功能', 'star')}<div class="feature-grid">${tiles.map(([symbol, color, title, note, path, action]) => `<${action ? 'button type="button" data-action="'+ action +'"' : 'a href="'+ link(path) +'"'} class="feature-tile"><span class="icon-bubble tone-${color}">${icon(symbol)}</span><strong>${title}</strong><span>${note}</span></${action ? 'button' : 'a'}>`).join('')}</div>`;
  }
  function tripsHTML() {
    const trips = store.state.data.trips.filter(row => !selectedTrip || row.id === selectedTrip);
    return trips.map(trip => {
      const items = store.state.data.trip_items.filter(row => row.trip_id === trip.id).sort((a, b) => a.item_date.localeCompare(b.item_date) || (a.item_time || '').localeCompare(b.item_time || '') || a.position - b.position);
      let previousDay = '';
      return `<article class="app-card"><p class="eyebrow">${fmt(trip.start_date)} — ${fmt(trip.end_date)}</p><h2>${escape(trip.title)}</h2><p class="entry-note">${escape(trip.note)}</p>${actionLinks('trips', trip)}<div class="app-toolbar"><a href="${link(`record/?kind=trip_item&trip=${trip.id}`)}">＋ 每日安排</a>${button('ics', '导出日历', `data-id="${trip.id}"`)}<a href="${link(`map/?trip=${trip.id}`)}">查看地点地图</a></div><div class="itinerary">${items.map(item => {
        const heading = previousDay !== item.item_date ? `<h3>${fmt(item.item_date)}</h3>` : ''; previousDay = item.item_date;
        return `${heading}<article class="itinerary-item"><time>${escape(item.item_time?.slice(0, 5) || '当天')}</time><div><h4>${escape(item.title)}</h4><p>${escape(item.location)}</p><p class="entry-note">${escape(item.note)}</p>${actionLinks('trip_items', item)}</div></article>`;
      }).join('') || '<p>旅行从一个小计划开始。添加每日安排吧。</p>'}</div></article>`;
    }).join('') || empty('还没有旅行计划。');
  }
  function insightsHTML() {
    const rows = store.state.data.memories, tags = {}, moodCounts = {};
    rows.forEach(row => { if (moods[row.mood]) moodCounts[row.mood] = (moodCounts[row.mood] || 0) + 1; (row.tags || []).forEach(tag => { tags[tag] = (tags[tag] || 0) + 1; }); });
    const today = core.dateISO();
    const onThisDay = rows.filter(row => row.memory_date?.slice(5) === today.slice(5) && row.memory_date < today);
    const monthly = {};
    rows.filter(row => moods[row.mood] && row.memory_date).forEach(row => { const key = row.memory_date.slice(0, 7); monthly[key] ||= {}; monthly[key][row.mood] = (monthly[key][row.mood] || 0) + 1; });
    return `<div class="insight-grid"><section class="app-card"><h2>心情分布</h2>${Object.entries(moods).map(([key, title]) => `<div class="mood-bar"><span>${title}</span><meter min="0" max="${Math.max(rows.length, 1)}" value="${moodCounts[key] || 0}">${moodCounts[key] || 0}</meter><strong>${moodCounts[key] || 0}</strong></div>`).join('')}<p>只统计主动选择了心情的记录。</p></section><section class="app-card"><h2>经常记起的事</h2><div class="tag-cloud">${Object.entries(tags).sort((a, b) => b[1] - a[1]).map(([tag, count]) => `<a style="font-size:${Math.min(1.6, 0.8 + count * 0.1)}rem" href="${link(`memories/?q=${encodeURIComponent(tag)}`)}">${escape(tag)} <small>${count}</small></a>`).join('') || '<p>为回忆添加标签，看看你们的共同兴趣。</p>'}</div></section></div><section class="app-card"><h2>心情随时间</h2><div class="table-scroll"><table><thead><tr><th>月份</th>${Object.values(moods).map(title => `<th>${title}</th>`).join('')}</tr></thead><tbody>${Object.keys(monthly).sort().map(month => `<tr><td>${month}</td>${Object.keys(moods).map(key => `<td>${monthly[month][key] || 0}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${!Object.keys(monthly).length ? '<p>记录几次心情，这里就会出现每月变化。</p>' : ''}</section><section class="app-card"><h2>那年今日</h2>${onThisDay.map(row => `<p><time>${fmt(row.memory_date)}</time> · ${escape(row.title)}</p>`).join('') || '<p>往年的这一天还没有记录，未来会有更多故事。</p>'}</section>`;
  }
  async function renderMap(token) {
    const target = root.querySelector('[data-map-view]');
    const trip = new URLSearchParams(location.search).get('trip');
    const rows = (trip ? store.state.data.trip_items.filter(row => row.trip_id === trip).sort((a, b) => a.item_date.localeCompare(b.item_date) || (a.item_time || '').localeCompare(b.item_time || '') || a.position - b.position) : [...store.state.data.memories, ...store.state.data.trip_items]).filter(core.coords);
    target.innerHTML = `<div class="app-card"><h2>${trip ? '旅行地点' : '我们的足迹'}</h2><p>${rows.length} 个带坐标的地点${trip ? ' · 连线表示行程顺序，不是导航路线' : ''}</p><div class="footprint-map" data-map aria-label="回忆地点地图"></div><ul>${rows.map(row => `<li>${escape(row.title)} · ${escape(row.location || '')} (${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)})</li>`).join('')}</ul>${!rows.length ? '<p>记录时点击“使用当前位置”，或手动填写经纬度。</p>' : ''}<small>地图底图需要联网，离线时仍可查看地点列表。</small></div>`;
    if (!window.L || token !== generation) { target.querySelector('[data-map]').textContent = '地图组件暂不可用，地点列表仍可查看。'; return; }
    const container = target.querySelector('[data-map]');
    map = L.map(container, { zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false }).setView([30.2741, 120.1551], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    const points = [];
    rows.forEach(row => {
      const point = [Number(row.latitude), Number(row.longitude)]; points.push(point);
      const popup = document.createElement('div'); popup.textContent = `${row.title} · ${row.location || ''}`;
      L.circleMarker(point, { color: '#678ec9', fillColor: '#f06795', fillOpacity: 0.8, radius: 8 }).addTo(map).bindPopup(popup);
    });
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 14 });
    if (trip && points.length > 1) L.polyline(points, { color: '#678ec9', dashArray: '6 6' }).addTo(map);
  }
  async function render() {
    if (!root || !root.isConnected) return;
    if (renderedIdentity !== (store.state.session?.user.id || 'none')) { mount(); return; }
    const token = ++generation;
    cleanup();
    root.querySelector('[data-status]').textContent = status();
    renderConflicts(); renderAuth(); populateSelects();
    if (store.state.error) notify(store.state.error, true);
    const body = root.querySelector('[data-page-body]');
    if (!store.state.ready) return;
    const locked = store.configured && !store.state.session;
    if (locked && !['record', 'settings'].includes(page)) { body.innerHTML = `<div class="empty-state"><h2>这本档案只属于你们</h2><a class="soft-button" href="${link('record/')}">登录后查看</a></div>`; return; }
    if (page === 'record') {
      root.querySelector('[data-manage]').innerHTML = core.tables.map(table => `<section><h3>${({ memories: '回忆', todos: '代办', events: '日期', journals: '时光集', trips: '旅行', trip_items: '每日安排' })[table]}</h3>${store.state.data[table].map(row => `<article class="manage-item"><div><strong>${escape(row.title)}</strong><p>${fmt(row.memory_date || row.event_date || row.start_date || row.item_date || row.planned_date)}</p></div>${actionLinks(table, row)}</article>`).join('') || '<p>还没有记录。</p>'}</section>`).join('');
      const editId = new URLSearchParams(location.search).get('edit');
      const form = root.querySelector('[data-composer] form');
      if (editId && !form.elements.id.value && !form.dataset.editLoaded) {
        form.dataset.editLoaded = 'true';
        editRow(new URLSearchParams(location.search).get('table') || 'memories', editId);
        const url = new URL(location.href); url.searchParams.delete('edit'); url.searchParams.delete('table');
        history.replaceState(history.state, '', url);
      }
    }
    if (page === 'memories') {
      const rows = core.filterMemories(store.state.data.memories, filters);
      root.querySelector('[data-result-count]').textContent = `${rows.length} 条回忆`;
      const markup = await cards(rows, token);
      if (token === generation) root.querySelector('[data-timeline]').innerHTML = markup;
    }
    if (page === 'calendar') root.querySelector('[data-calendar]').innerHTML = calendarHTML();
    if (page === 'trips') root.querySelector('[data-trips]').innerHTML = tripsHTML();
    if (page === 'map') await renderMap(token);
    const generic = root.querySelector('[data-generic-view]');
    if (generic && page === 'journals') {
      root.querySelectorAll('[data-action="discover"]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.tab === discoveryTab)));
      const markup = discoveryTab === 'features' ? featuresHTML() : await journalsHTML(token);
      if (token === generation) generic.innerHTML = markup;
    }
    if (generic && page === 'insights') generic.innerHTML = insightsHTML();
    if (generic && ['photos', 'videos'].includes(page)) {
      const markup = await cards(store.state.data.memories.filter(row => row.type === (page === 'videos' ? 'video' : 'photo') || row.media?.some(media => media.type?.startsWith(page === 'videos' ? 'video/' : 'image/'))), token);
      if (token === generation) generic.innerHTML = markup;
    }
    if (generic && page === 'todos') generic.innerHTML = `<div class="board-page">${['movie', 'restaurant', 'city', 'ritual'].map(category => `<section class="app-card"><h2>${labels[category]}</h2>${store.state.data.todos.filter(row => row.category === category).map(row => `<article class="day-entry ${row.status === 'done' ? 'todo-done' : ''}"><h3>${escape(row.title)}</h3><p>${escape(row.note)} · ${labels[row.status]}</p>${actionLinks('todos', row)}</article>`).join('') || '<p>下一件一起想做的事是什么？</p>'}</section>`).join('')}</div>`;
    if (generic && page === 'home') {
      const today = core.dateISO(), data = store.state.data;
      const next = data.events.map(row => ({ ...row, next: core.upcoming(row, today) })).filter(row => row.next).sort((a, b) => a.next.localeCompare(b.next))[0];
      const nextTrip = data.trips.filter(row => row.end_date >= today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
      const recent = core.filterMemories(data.memories, {});
      const selected = recent.find(row => row.id === (featuredId || new URLSearchParams(location.search).get('review'))) || recent.find(row => row.memory_date?.slice(5) === today.slice(5) && row.memory_date < today) || recent[0];
      const featuredURL = await coverURL(selected, token);
      const journals = await journalCards(data.journals.slice(0, 4), token);
      if (token !== generation) return;
      const monthCount = data.memories.filter(row => (row.created_at || row.memory_date)?.startsWith(today.slice(0, 7))).length;
      generic.innerHTML = `<header class="app-welcome"><h1>恋爱记录</h1><p>记录每一个温暖瞬间</p></header><div class="home-stats">${[[data.memories.length, '总回忆', 'archive', 'pink', 'memories/'], [data.journals.length, '小本数量', 'folder', 'blue', 'journals/'], [monthCount, '本月新增', 'send', 'gold', 'memories/']].map(([count, title, symbol, color, path]) => `<a class="home-stat" href="${link(path)}"><span class="icon-bubble tone-${color}">${icon(symbol)}</span><strong>${count}</strong><span>${title}</span></a>`).join('')}</div><div class="home-columns"><section class="recommendation-section">${sectionTitle('今日推荐', 'star', '', button('random-memory', icon('sparkles'), 'class="recommend-refresh" aria-label="换一个回忆"'))}<a class="recommendation ${featuredURL ? 'has-photo' : ''}" href="${selected ? link(`record/?kind=memory&edit=${selected.id}`) : link('record/')}">${featuredURL ? `<img src="${escape(featuredURL)}" alt="${escape(selected.title)}" />` : `<div class="recommendation-art">${icon('heart')}<span></span></div>`}<div class="recommendation-copy"><span class="recommendation-badge">${selected ? `温暖回看 · ${fmt(selected.memory_date)}` : '第一篇故事，等你来写'}</span><h2>${selected ? escape(selected.title) : '把这一刻留在这里'}</h2><p>${selected ? escape(selected.note || selected.location || '平凡的日子，也有值得收藏的温柔。') : '一张照片，一句心情，都是我们的小小珍藏。'}</p></div></a></section><section class="home-journals">${sectionTitle('我的小本', '', link('journals/'))}<div class="journal-grid">${journals || `<a class="journal-cover new-journal-card" href="${link('record/?kind=journal')}"><span class="icon-bubble tone-pink">${icon('book')}</span><h3>我们的第一本小本</h3><p>把零散的瞬间，收成一本故事。</p><span class="new-journal-cta">${icon('plus')}新建小本</span></a>`}</div></section></div><div class="home-reminders">${next ? `<a href="${link('calendar/')}" class="reminder-card">${icon('calendar')}<div><small>下一个重要日子</small><strong>${escape(next.title)}</strong><span>还有 ${core.daysBetween(today, next.next)} 天 · ${fmt(next.next)}</span></div></a>` : ''}${nextTrip ? `<a href="${link('trips/')}" class="reminder-card">${icon('plane')}<div><small>下一次出发</small><strong>${escape(nextTrip.title)}</strong><span>${fmt(nextTrip.start_date)} — ${fmt(nextTrip.end_date)}</span></div></a>` : ''}</div>${sectionTitle('最近的回忆', '', link('memories/'))}<div class="timeline" data-home-cards></div>`;
      const markup = await cards(core.filterMemories(data.memories, {}).slice(0, 3), token);
      if (token === generation) generic.querySelector('[data-home-cards]').innerHTML = markup;
    }
  }
  function editRow(table, id) {
    const kind = ({ memories: 'memory', todos: 'todo', events: 'event', journals: 'journal', trips: 'trip', trip_items: 'trip_item' })[table];
    if (page !== 'record') { location.href = link(`record/?kind=${kind}&table=${table}&edit=${encodeURIComponent(id)}`); return; }
    const row = store.state.data[table].find(item => item.id === id);
    if (!row) return;
    if (composer !== kind) { composer = kind; renderComposer(); }
    const form = root.querySelector('[data-composer] form');
    for (const [key, value] of Object.entries(row)) if (form.elements[key] && form.elements[key].type !== 'file') form.elements[key].value = Array.isArray(value) ? value.join(', ') : value ?? '';
    form.querySelector('h2').textContent = `编辑：${row.title}`;
    const attachments = form.querySelector('[data-existing-media]');
    if (attachments) attachments.textContent = `${row.media?.length || (row.file_path || row.file_data_url ? 1 : 0)} 个现有附件；不选新文件则保留。`;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function perform(fn, success = '') {
    try { await fn(); if (success) notify(success); } catch (error) { notify(error.message || String(error), true); }
  }
  async function onSubmit(event) {
    const form = event.target.closest('[data-form]');
    if (!form) return;
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]'), original = submit.textContent;
    submit.disabled = true; submit.textContent = '正在保存…'; notify('');
    await perform(async () => {
      const values = Object.fromEntries(new FormData(form).entries());
      if (form.dataset.form === 'auth') {
        if (!store.client) throw new Error('登录服务暂不可用，请联网重试。');
        const result = await store.client.auth.signInWithPassword({ email: values.email, password: values.password });
        if (result.error) throw result.error;
        form.reset(); return;
      }
      const table = ({ memory: 'memories', todo: 'todos', event: 'events', journal: 'journals', trip: 'trips', trip_item: 'trip_items' })[form.dataset.form];
      delete values.files;
      if (!values.id) delete values.id;
      values.title = values.title.trim();
      if (!values.title) throw new Error('请填写标题。');
      for (const key of Object.keys(values)) if (values[key] === '') values[key] = null;
      if (table === 'memories') values.tags = [...new Set((values.tags || '').split(/[,，]/).map(tag => tag.trim()).filter(Boolean))];
      if ('latitude' in values || 'longitude' in values) {
        if ((values.latitude === null) !== (values.longitude === null)) throw new Error('请同时填写经纬度，或同时留空。');
        if (values.latitude !== null) { values.latitude = Number(values.latitude); values.longitude = Number(values.longitude); if (!core.coords(values)) throw new Error('经纬度超出范围。'); }
      }
      if (table === 'trip_items') {
        values.position = Number(values.position);
        const trip = store.state.data.trips.find(row => row.id === values.trip_id);
        if (!trip || values.item_date < trip.start_date || values.item_date > trip.end_date) throw new Error('安排日期必须在所属旅行的日期范围内。');
      }
      if (values.end_date && values.end_date < (values.start_date || values.event_date)) throw new Error('结束日期不能早于开始日期。');
      if (table === 'trips' && values.id && store.state.data.trip_items.some(row => row.trip_id === values.id && (row.item_date < values.start_date || row.item_date > values.end_date))) throw new Error('新的旅行日期必须覆盖已有每日安排。');
      if (table === 'events' && values.recurrence === 'yearly' && values.end_date && values.end_date !== values.event_date) throw new Error('每年重复仅支持单日纪念日。');
      const files = form.elements.files ? [...form.elements.files.files] : [];
      await store.save(table, values, files);
      form.reset();
      await store.sync();
      if (store.state.error) throw new Error(store.state.error);
      notify(store.state.pending.length ? '已保存在本机，联网后同步。' : '已保存。');
    });
    if (submit.isConnected) { submit.disabled = false; submit.textContent = original; }
  }
  async function onClick(event) {
    const target = event.target.closest('[data-action]'); if (!target) return;
    const action = target.dataset.action;
    await perform(async () => {
      if (action === 'discover') { discoveryTab = target.dataset.tab; await render(); }
      if (action === 'random-memory') {
        const rows = store.state.data.memories.filter(row => row.id !== featuredId);
        if (!rows.length) { notify('留下一条回忆，未来就能在这里重新遇见。'); return; }
        featuredId = rows[Math.floor(Math.random() * rows.length)].id;
        if (page === 'home') await render();
        else location.href = link(`?review=${encodeURIComponent(featuredId)}`);
      }
      if (action === 'compose') { composer = target.dataset.kind; renderComposer(); }
      if (action === 'edit') editRow(target.dataset.table, target.dataset.id);
      if (action === 'delete' && confirm('确定删除这条记录吗？')) { await store.remove(target.dataset.table, target.dataset.id); await store.sync(); }
      if (action === 'toggle') { const row = store.state.data.todos.find(item => item.id === target.dataset.id); await store.save('todos', { ...row, status: row.status === 'done' ? 'planned' : 'done' }); await store.sync(); }
      if (action === 'sync') { await store.sync(); if (!store.state.error) notify('已刷新。'); }
      if (action === 'month') { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + Number(target.dataset.delta), 1); selectedDay = core.dateISO(calendarMonth); await render(); }
      if (action === 'today') { selectedDay = core.dateISO(); calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); await render(); }
      if (action === 'day') { selectedDay = target.dataset.date; await render(); }
      if (action === 'logout') { const result = await store.client.auth.signOut({ scope: 'local' }); if (result.error) throw result.error; }
      if (action === 'resolve') await store.resolve(target.dataset.table, target.dataset.id, target.dataset.choice);
      if (action === 'locate') {
        if (!navigator.geolocation) throw new Error('此浏览器不支持定位，请手动填写。');
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, maximumAge: 60000 }));
        const form = root.querySelector('[data-composer] form'); form.elements.latitude.value = position.coords.latitude; form.elements.longitude.value = position.coords.longitude;
        notify('当前位置已填入，保存后记入档案。');
      }
      if (action === 'export') download(await store.exportLocal(), 'our-memories.json', 'application/json');
      if (action === 'ics') exportICS(target.dataset.id);
      if (action === 'install') {
        if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; }
        else root.querySelector('[data-install-help]').textContent = '在浏览器菜单选择“安装应用”或“添加到主屏幕”。iPhone 可在 Safari 分享菜单添加。';
      }
    });
  }
  function onInput(event) {
    if (!event.target.closest('[data-filters]')) return;
    filters[event.target.name] = event.target.value;
    render();
  }
  async function onChange(event) {
    if (event.target.hasAttribute('data-trip-select')) { selectedTrip = event.target.value; render(); }
    if (event.target.hasAttribute('data-import') && event.target.files[0]) await perform(async () => {
      await store.importLocal(await event.target.files[0].text()); notify('备份已恢复。');
    });
  }
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportICS(id) {
    const trip = store.state.data.trips.find(row => row.id === id);
    const clean = text => String(text || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
    const rows = store.state.data.trip_items.filter(row => row.trip_id === id);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Our Quiet Archive//Travel//ZH', 'CALSCALE:GREGORIAN'];
    for (const row of rows.length ? rows : [{ id: trip.id, title: trip.title, item_date: trip.start_date, note: trip.note }]) {
      lines.push('BEGIN:VEVENT', `UID:${row.id}@our-quiet-archive`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${row.item_date.replace(/-/g, '')}`, `SUMMARY:${clean(row.title)}`, `DESCRIPTION:${clean([row.item_time, row.note].filter(Boolean).join('\n'))}`, `LOCATION:${clean(row.location)}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    // Fold at UTF-8 octet boundaries, preserving Chinese characters.
    const folded = lines.map(line => { let out = '', bytes = 0; for (const char of line) { const length = new TextEncoder().encode(char).length; if (bytes + length > 73) { out += '\r\n '; bytes = 1; } out += char; bytes += length; } return out; });
    download(folded.join('\r\n') + '\r\n', 'trip.ics', 'text/calendar;charset=utf-8');
  }
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
  store.subscribe(() => { render().catch(error => notify(error.message, true)); });
  function init() {
    const params = new URLSearchParams(location.search);
    filters.query = params.get('q') || '';
    mount();
  }
  if (window.document$) window.document$.subscribe(init);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register(link('sw.js'), { scope: base.pathname }).catch(error => console.info('Offline shell unavailable:', error.message));
})();
