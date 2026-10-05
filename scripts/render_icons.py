"""Rasterize the code-native SVG app icon with Playwright/Chrome."""
from pathlib import Path
from playwright.sync_api import sync_playwright

icons = Path(__file__).resolve().parents[1] / 'docs/assets/icons'
svg = (icons / 'icon.svg').read_text()
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/google-chrome-stable', headless=True, args=['--no-sandbox'])
    page = browser.new_page()
    for size, name in [(192, 'icon-192.png'), (512, 'icon-512.png'), (512, 'icon-maskable.png')]:
        page.set_viewport_size({'width': size, 'height': size})
        background = '#fff0f6' if name == 'icon-maskable.png' else 'transparent'
        page.set_content(f'<style>html,body{{margin:0;background:{background}}}svg{{width:100vw;height:100vh;display:block}}</style>' + svg)
        page.screenshot(path=str(icons / name), omit_background=name != 'icon-maskable.png')
    browser.close()
