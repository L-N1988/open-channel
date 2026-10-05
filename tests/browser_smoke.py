"""Run against a built site: python -m http.server 8001 --directory site.
Requires Playwright and Chrome (or set CHROME_PATH). Tests do not contact Supabase.
"""
import base64
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('APP_TEST_URL', 'http://127.0.0.1:8001/').rstrip('/') + '/'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=')

def ready(page, path='record/'):
    page.goto(BASE + path)
    page.wait_for_function('window.LoveStore && LoveStore.state.ready')
    if path.startswith('record'):
        page.wait_for_selector('[data-composer] form')

def compose(page, kind):
    page.locator(f'[data-action="compose"][data-kind="{kind}"]').click()
    return page.locator('[data-composer] form')

def save(form):
    form.locator('button[type="submit"]').click()
    expect(form.locator('button[type="submit"]')).to_be_enabled()
    expect(form.page.locator('[data-app-message]')).not_to_have_class('app-message is-error')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH', '/usr/bin/google-chrome-stable'), headless=True, args=['--no-sandbox'])
    errors = []
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    context.on('page', lambda page: page.on('pageerror', lambda error: errors.append(error.stack)))
    page = context.new_page()
    ready(page)
    form = compose(page, 'journal')
    form.locator('[name="title"]').fill('海边的故事')
    form.locator('[name="note"]').fill('两个人的第一本时光集')
    save(form)
    journal_id = page.evaluate('LoveStore.state.data.journals[0].id')
    form = compose(page, 'memory')
    form.locator('[name="title"]').fill('晚风与海')
    form.locator('[name="note"]').fill('这一段文字稍后清空')
    form.locator('[name="journal_id"]').select_option(journal_id)
    form.locator('[name="tags"]').fill('海边, 周末, 海边')
    form.locator('[name="mood"]').select_option('happy')
    form.locator('[name="latitude"]').fill('0')
    form.locator('[name="longitude"]').fill('0')
    form.locator('[name="files"]').set_input_files([
        {'name': 'large.png', 'mimeType': 'image/png', 'buffer': PNG + bytes(3 * 1024 * 1024)},
        {'name': 'small.png', 'mimeType': 'image/png', 'buffer': PNG}
    ])
    save(form)
    memory_id = page.evaluate('LoveStore.state.data.memories[0].id')
    assert page.evaluate('LoveStore.state.data.memories[0].media.length') == 2
    assert page.evaluate('LoveStore.state.data.memories[0].tags') == ['海边', '周末']
    context.grant_permissions(['geolocation'])
    context.set_geolocation({'latitude': 30.25, 'longitude': 120.15})
    form.locator('[data-action="locate"]').click()
    expect(form.locator('[name="latitude"]')).to_have_value('30.25')
    page.locator(f'[data-action="edit"][data-table="memories"][data-id="{memory_id}"]').click()
    form = page.locator('[data-composer] form')
    form.locator('[name="note"]').fill('')
    save(form)
    expect(form.locator('[name="id"]')).to_have_value('')
    assert page.evaluate('LoveStore.state.data.memories[0].note') is None
    assert page.evaluate('LoveStore.state.data.memories[0].media.length') == 2
    form = compose(page, 'trip')
    form.locator('[name="title"]').fill('海边周末')
    form.locator('[name="start_date"]').fill('2026-10-05')
    form.locator('[name="end_date"]').fill('2026-10-07')
    save(form)
    trip_id = page.evaluate('LoveStore.state.data.trips[0].id')
    form = compose(page, 'trip_item')
    form.locator('[name="title"]').fill('海边散步')
    form.locator('[name="trip_id"]').select_option(trip_id)
    form.locator('[name="item_date"]').fill('2026-10-05')
    form.locator('[name="latitude"]').fill('30.2')
    form.locator('[name="longitude"]').fill('120.1')
    save(form)
    form = compose(page, 'event')
    today = page.evaluate('LoveCore.dateISO()')
    form.locator('[name="title"]').fill('每年纪念日')
    form.locator('[name="event_date"]').fill(today)
    form.locator('[name="recurrence"]').select_option('yearly')
    save(form)
    form = compose(page, 'event')
    form.locator('[name="title"]').fill('同一天的另一个安排')
    form.locator('[name="event_date"]').fill(today)
    save(form)
    # Two tabs saving concurrently must preserve both updates.
    second = context.new_page()
    ready(second)
    page.evaluate('window.__firstWrite = LoveStore.save("todos", {title: "First tab", category: "movie", status: "planned"}); null')
    second.evaluate('LoveStore.save("todos", {title: "Second tab", category: "movie", status: "planned"})')
    page.wait_for_function('LoveStore.state.data.todos.length === 2')
    second.close()
    # Persistence, live filters, and native image rendering.
    ready(page, 'memories/')
    expect(page.locator('.memory-entry')).to_have_count(1)
    expect(page.locator('.entry-media img')).to_have_count(2)
    page.wait_for_function('Array.from(document.querySelectorAll(".entry-media img")).every(img => img.complete && img.naturalWidth > 0)')
    page.locator('[data-filters] [name="query"]').fill('不存在的文字')
    expect(page.locator('.memory-entry')).to_have_count(0)
    page.locator('[data-filters] [name="query"]').fill('海边')
    expect(page.locator('.memory-entry')).to_have_count(1)
    ready(page, 'calendar/')
    expect(page.locator('[data-calendar]')).to_contain_text('每年纪念日')
    expect(page.locator('[data-calendar]')).to_contain_text('同一天的另一个安排')
    month = page.locator('.month-head h2').inner_text()
    page.locator('[data-action="month"][data-delta="1"]').click()
    assert page.locator('.month-head h2').inner_text() != month
    page.locator('[data-action="today"]').click()
    assert page.locator('.month-head h2').inner_text() == month
    ready(page, 'trips/')
    expect(page.locator('[data-trips]')).to_contain_text('海边散步')
    with page.expect_download() as downloaded:
        page.locator('[data-action="ics"]').click()
    ics_path = downloaded.value.path()
    assert 'BEGIN:VEVENT' in Path(ics_path).read_text()
    assert '海边散步' in Path(ics_path).read_text()
    ready(page, 'insights/')
    expect(page.locator('[data-generic-view]')).to_contain_text('海边')
    ready(page, 'map/')
    expect(page.locator('.leaflet-container')).to_be_visible()
    expect(page.locator('[data-map-view]')).to_contain_text('2 个带坐标的地点')
    ready(page, 'settings/')
    backup = page.evaluate('LoveStore.exportLocal()')
    assert len(json.loads(backup)['data']['memories'][0]['media']) == 2
    # A clean browser restores every table and original attachment bytes.
    restored = browser.new_context()
    restore_page = restored.new_page()
    ready(restore_page)
    restore_page.evaluate('(text) => LoveStore.importLocal(text)', backup)
    assert restore_page.evaluate('LoveStore.state.data.memories.length') == 1
    ready(restore_page, 'memories/')
    restore_page.wait_for_function('document.querySelectorAll(".entry-media img").length === 2 && Array.from(document.querySelectorAll(".entry-media img")).every(img => img.complete && img.naturalWidth > 0)')
    # Reject malformed imports without changing the archive.
    result = restore_page.evaluate('async () => { try { await LoveStore.importLocal("{}"); return false; } catch { return LoveStore.state.data.memories.length === 1; } }')
    assert result
    restored.close()
    # Service worker precaches app pages, including pages never visited.
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    context.set_offline(True)
    ready(page, 'journals/')
    expect(page.locator('.journal-cover')).to_contain_text('海边的故事')
    ready(page, 'record/')
    form = compose(page, 'memory')
    form.locator('[name="title"]').fill('离线也能记住')
    save(form)
    page.reload()
    page.wait_for_function('LoveStore.state.ready')
    assert page.evaluate('LoveStore.state.data.memories.length') == 2
    context.set_offline(False)
    # Mobile layout and dark theme.
    page.set_viewport_size({'width': 390, 'height': 844})
    ready(page)
    expect(page.locator('.app-bottom-nav')).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/tmp/love-record-mobile.png', full_page=True)
    page.emulate_media(color_scheme='dark')
    ready(page, 'calendar/')
    page.locator('label[for="__palette_1"]').click()
    expect(page.locator('body')).to_have_attribute('data-md-color-scheme', 'slate')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path='/tmp/love-calendar-dark.png', full_page=True)
    context.close()
    print('PASS: local CRUD, >2 MB multi-upload, field clearing, journals, itinerary, calendar, insights, map, backup restore, offline persistence, mobile/dark layouts')

    # Cloud sync fixture: durable queue, conflicts, conditional update, sign-out.
    cloud_context = browser.new_context(service_workers='block')
    cloud_context.route('**/vendor/supabase.js', lambda route: route.fulfill(path=str(Path(__file__).with_name('cloud-fixture.js')), content_type='application/javascript'))
    cloud_context.route('**/javascripts/love-record-config.js', lambda route: route.fulfill(body='window.LOVE_RECORD_CONFIG={supabaseUrl:"https://fixture.invalid",supabaseAnonKey:"fixture",mediaBucket:"love-media"};', content_type='application/javascript'))
    cloud_context.add_init_script("Object.defineProperty(navigator, 'onLine', {get: () => localStorage.getItem('__fixtureOffline') !== '1'});")
    cloud_page = cloud_context.new_page()
    cloud_page.on('pageerror', lambda error: errors.append(error.stack))
    ready(cloud_page)
    cloud_page.wait_for_function('LoveStore.state.session && !LoveStore.state.syncing')
    cloud_page.evaluate('''async () => {
      await LoveStore.save('memories', { title: 'Cloud memory', type: 'moment', memory_date: '2026-10-05', tags: [], note: 'Original' });
      await LoveStore.sync();
    }''')
    assert cloud_page.evaluate('LoveStore.state.pending.length') == 0
    assert cloud_page.evaluate('__cloud.data.memories.length') == 1
    # A cloud draft queue survives a full reload before reconnecting.
    cloud_page.evaluate('''async () => {
      localStorage.setItem('__fixtureOffline', '1');
      await LoveStore.save('todos', { title: 'Queued across reload', category: 'movie', status: 'planned' });
    }''')
    cloud_page.reload()
    cloud_page.wait_for_function('LoveStore.state.ready && LoveStore.state.pending.length === 1')
    cloud_page.evaluate('''async () => { localStorage.removeItem('__fixtureOffline'); await LoveStore.sync(); }''')
    assert cloud_page.evaluate('LoveStore.state.pending.length') == 0
    assert cloud_page.evaluate('__cloud.data.todos[0].title') == 'Queued across reload'
    # Simulate another device updating while this device is offline.
    cloud_context.set_offline(True)
    cloud_page.evaluate("localStorage.setItem('__fixtureOffline', '1')")
    cloud_page.evaluate('''async () => {
      const row = LoveStore.state.data.memories[0];
      __cloud.data.memories[0].note = 'Other device';
      __cloud.data.memories[0].updated_at = '2030-01-01T00:00:00.000Z';
      await LoveStore.save('memories', { ...row, note: 'My offline note' });
    }''')
    assert cloud_page.evaluate('LoveStore.state.pending.length') == 1
    cloud_context.set_offline(False)
    cloud_page.evaluate("localStorage.removeItem('__fixtureOffline')")
    cloud_page.evaluate('LoveStore.sync()')
    assert cloud_page.evaluate('LoveStore.state.conflicts.length') == 1
    expect(cloud_page.locator('.conflict-card')).to_contain_text('另一台设备')
    cloud_page.locator('[data-action="resolve"][data-choice="local"]').click()
    cloud_page.wait_for_function('LoveStore.state.pending.length === 0 && !LoveStore.state.syncing')
    assert cloud_page.evaluate('__cloud.data.memories[0].note') == 'My offline note'
    # Blank field must reach the cloud as null.
    cloud_page.evaluate('''async () => {
      await LoveStore.save('memories', { ...LoveStore.state.data.memories[0], note: null });
      await LoveStore.sync();
    }''')
    assert cloud_page.evaluate('__cloud.data.memories[0].note') is None
    # Taking the remote version of a second conflict keeps the remote data.
    cloud_page.evaluate('''async () => {
      const row = LoveStore.state.data.memories[0];
      __cloud.data.memories[0].note = 'Keep remote';
      __cloud.data.memories[0].updated_at = '2031-01-01T00:00:00Z';
      await LoveStore.save('memories', {...row, note: 'Discard local'});
      await LoveStore.sync();
      await LoveStore.resolve('memories', row.id, 'remote');
    }''')
    assert cloud_page.evaluate('LoveStore.state.data.memories[0].note') == 'Keep remote'
    assert cloud_page.evaluate('LoveStore.state.pending.length') == 0
    # Uploaded originals stay available locally after the cloud returns clean metadata.
    available = cloud_page.evaluate('''async bytes => {
      await LoveStore.save('memories', { title: 'Cloud photo', type: 'photo', memory_date: '2026-10-05', tags: [] }, [new File([new Uint8Array(bytes)], 'photo.png', {type: 'image/png'})]);
      await LoveStore.sync();
      const photo = LoveStore.state.data.memories.find(row => row.title === 'Cloud photo');
      if (photo.media[0].blobId || !photo.media[0].path) return false;
      localStorage.setItem('__fixtureOffline', '1');
      const url = await LoveStore.mediaURL(photo.media[0]);
      const available = url.startsWith('blob:');
      URL.revokeObjectURL(url);
      localStorage.removeItem('__fixtureOffline');
      return available;
    }''', list(PNG))
    assert available
    cloud_page.locator('[data-action="logout"]').click()
    cloud_page.wait_for_function('LoveStore.state.session === null && LoveStore.state.data.memories.length === 0')
    expect(cloud_page.locator('[data-form="auth"]')).to_be_visible()
    cloud_context.close()
    assert not errors, errors
    print('PASS: mocked cloud queue, conflict detection/resolution, field clearing, sign-out cache isolation; no JavaScript errors')
    browser.close()
