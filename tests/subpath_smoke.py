"""Check GitHub Pages-style paths and offline canonical index.html navigation."""
import os
from playwright.sync_api import sync_playwright, expect
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH', '/usr/bin/google-chrome-stable'), headless=True, args=['--no-sandbox'])
    context = browser.new_context()
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(error.stack))
    base = os.environ.get('APP_SUBPATH_URL', 'http://127.0.0.1:8002/archive/')
    page.goto(base + 'record/')
    page.wait_for_function('window.LoveStore && LoveStore.state.ready')
    page.locator('[data-composer] [name="title"]').fill('Subdirectory memory')
    page.locator('[data-composer] [type="submit"]').click()
    page.wait_for_function('LoveStore.state.data.memories.length === 1')
    assert page.locator('[data-capture-link]').get_attribute('href') == base + 'record/'
    page.evaluate('navigator.serviceWorker.ready')
    page.wait_for_function('navigator.serviceWorker.controller !== null')
    assert page.evaluate('navigator.serviceWorker.getRegistration().then(reg => reg.scope)') == base
    context.set_offline(True)
    page.goto(base + 'index.html')
    page.wait_for_function('LoveStore.state.ready')
    expect(page.locator('[data-home-cards]')).to_contain_text('Subdirectory memory')
    page.goto(base + 'memories/?q=Subdirectory')
    page.wait_for_function('LoveStore.state.ready')
    expect(page.locator('.memory-entry')).to_have_count(1)
    assert not errors, errors
    context.close()
    browser.close()
    print('PASS: subdirectory links, worker scope, offline index.html and query-string navigation')
