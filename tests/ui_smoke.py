"""Check the native app-style home/discovery layouts and responsive navigation."""
import base64
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('APP_TEST_URL', 'http://127.0.0.1:8001/').rstrip('/') + '/'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=')

def check_width(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), page.url

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROME_PATH', '/usr/bin/google-chrome-stable'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':390, 'height':844})
    errors = []
    page.on('pageerror', lambda error: errors.append(error.stack))
    page.goto(BASE)
    page.wait_for_selector('.home-stats')
    expect(page.locator('.md-content__inner h1')).to_have_count(1)
    expect(page.locator('.home-stat')).to_have_count(3)
    expect(page.locator('.app-bottom-nav a')).to_have_count(4)
    check_width(page)
    page.screenshot(path='/tmp/love-style-home.png', full_page=True)
    for width in [320, 390, 768, 1440]:
        page.set_viewport_size({'width': width, 'height': 900})
        check_width(page)
    page.screenshot(path='/tmp/love-style-desktop.png', full_page=True)
    page.set_viewport_size({'width':390, 'height':844})
    # Real attachments drive covers and recommendation; no fixed demo counts.
    page.evaluate('''async bytes => {
      const journal = await LoveStore.save('journals', { title:'海边的故事', cover_color:'rose', note:'周末小记' });
      await LoveStore.save('memories', { title:'晚风与海', type:'moment', journal_id:journal.id, memory_date:LoveCore.dateISO(), tags:['海边'], mood:'happy' }, [new File([new Uint8Array(bytes)], 'photo.png', {type:'image/png'})]);
    }''', list(PNG))
    page.wait_for_function('document.querySelector(".home-stat strong").textContent === "1"')
    expect(page.locator('.home-journals .journal-cover')).to_have_count(1)
    expect(page.locator('.recommendation img')).to_have_count(1)
    page.goto(BASE + 'journals/')
    page.wait_for_selector('.journal-cover img')
    page.wait_for_function('document.querySelector(".journal-cover img").complete && document.querySelector(".journal-cover img").naturalWidth > 0')
    expect(page.locator('.journal-cover')).to_contain_text('1 个瞬间')
    check_width(page)
    page.screenshot(path='/tmp/love-style-discover.png', full_page=True)
    page.locator('[data-action="discover"][data-tab="features"]').click()
    expect(page.locator('[data-tab="features"]')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('.feature-stat strong')).to_have_text(['1', '1', '1'])
    expect(page.locator('.feature-tile')).to_have_count(8)
    check_width(page)
    page.screenshot(path='/tmp/love-style-features.png', full_page=True)
    page.locator('[data-action="random-memory"]').click()
    page.wait_for_selector('.recommendation.has-photo')
    expect(page.locator('.recommendation h2')).to_have_text('晚风与海')
    page.goto(BASE + 'journals/')
    page.wait_for_selector('.discovery-tabs')
    page.locator('label[for="__palette_1"]').click()
    expect(page.locator('body')).to_have_attribute('data-md-color-scheme', 'slate')
    check_width(page)
    page.screenshot(path='/tmp/love-style-dark.png', full_page=True)
    assert not errors, errors
    browser.close()
    print('PASS: native-style home/discovery, photo covers, live counts, random review, 320–1440 px widths, four-item navigation, and dark theme')
