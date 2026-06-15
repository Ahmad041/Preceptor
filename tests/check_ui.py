import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # Listen for console logs and errors
        page.on("console", lambda msg: print(f"Browser Console: {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser Error: {err}"))
        
        print("Navigating to http://localhost:5173 ...")
        await page.goto("http://localhost:5173")
        await page.wait_for_timeout(2000)
        
        print("Page Title:", await page.title())
        
        # Click on something or just wait
        await browser.close()

asyncio.run(run())
