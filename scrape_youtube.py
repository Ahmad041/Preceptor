import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print("Opening YouTube video...")
        await page.goto("https://www.youtube.com/watch?v=QvN6Tu6dHYM")
        
        # Wait for the title to be loaded
        await page.wait_for_load_state("networkidle")
        
        title = await page.title()
        
        print(f"Title: {title}")
        
        description_element = await page.query_selector('meta[name="description"]')
        description_text = await description_element.get_attribute('content') if description_element else "No description found"
        print(f"Description:\n{description_text}")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
