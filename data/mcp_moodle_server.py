import asyncio
import os
import json
from mcp.server.fastmcp import FastMCP
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup

mcp = FastMCP("Moodle Auto-Student")

# Dapatkan kredensial dari environment variable
MOODLE_USER = os.environ.get("MOODLE_USER", "")
MOODLE_PASS = os.environ.get("MOODLE_PASS", "")

async def _login(page):
    print("Navigating to login page...")
    await page.goto('https://elearning.polytechnic.astra.ac.id/login/index.php?loginredirect=1')
    await page.wait_for_selector('input[name="username"]')
    await page.fill('input[name="username"]', MOODLE_USER)
    await page.fill('input[name="password"]', MOODLE_PASS)
    await page.click('button[id="loginbtn"]')
    await page.wait_for_load_state('networkidle')

@mcp.tool()
async def moodle_get_tasks() -> str:
    """
    Login to Moodle and retrieve the list of tasks/deadlines from the Timeline.
    Returns a JSON string of tasks.
    """
    if not MOODLE_USER or not MOODLE_PASS:
        return "Error: MOODLE_USER or MOODLE_PASS environment variable is not set."

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await _login(page)
            # Wait for timeline to load
            await page.wait_for_selector('[data-region="timeline"]', timeout=10000)
            await asyncio.sleep(2) # Give it a bit to fetch JS data
            
            content = await page.content()
            soup = BeautifulSoup(content, 'html.parser')
            timeline = soup.find(attrs={'data-region': 'timeline'})
            
            tasks = []
            if timeline:
                items = timeline.find_all(class_='list-group-item')
                for item in items:
                    text = item.get_text(separator=' | ', strip=True)
                    if text:
                        # Try to find a link
                        link_elem = item.find('a')
                        link = link_elem['href'] if link_elem and link_elem.has_attr('href') else None
                        tasks.append({"task_info": text, "url": link})
            
            return json.dumps({"status": "success", "tasks": tasks}, indent=2)
        except Exception as e:
            return f"Error occurred: {str(e)}"
        finally:
            await browser.close()

@mcp.tool()
async def moodle_get_task_details(task_url: str) -> str:
    """
    Given a task URL, visits the page, extracts the instructions, and downloads any attachment files
    (like PDFs). Returns the instructions and local paths of downloaded files.
    ZIP files will just be downloaded and their paths returned.
    """
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        download_paths = []
        try:
            await _login(page)
            await page.goto(task_url)
            await page.wait_for_load_state('networkidle')
            
            # Extract main instruction text
            content = await page.content()
            soup = BeautifulSoup(content, 'html.parser')
            
            description_block = soup.find(id='intro')
            description = description_block.get_text(separator='\n', strip=True) if description_block else "No description found."
            
            # Look for attachments
            attachments = soup.find_all('a', href=lambda href: href and 'pluginfile.php' in href)
            
            for att in attachments:
                url = att['href']
                filename = att.get_text(strip=True) or url.split('/')[-1].split('?')[0]
                
                # Setup download handler
                async with page.expect_download() as download_info:
                    await page.goto(url)
                
                download = await download_info.value
                save_path = os.path.join(os.getcwd(), 'downloads', download.suggested_filename)
                os.makedirs(os.path.dirname(save_path), exist_ok=True)
                await download.save_as(save_path)
                download_paths.append(save_path)
                
            return json.dumps({
                "status": "success",
                "instructions": description,
                "downloaded_files": download_paths
            }, indent=2)
            
        except Exception as e:
            return f"Error occurred: {str(e)}"
        finally:
            await browser.close()

@mcp.tool()
async def moodle_upload_task_draft(task_url: str, file_path: str) -> str:
    """
    Uploads a local file to the Moodle assignment page as a Draft (does not click Submit).
    This allows the user to review the uploaded file before final submission.
    """
    if not os.path.exists(file_path):
        return f"Error: File {file_path} does not exist locally."
        
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        try:
            await _login(page)
            await page.goto(task_url)
            await page.wait_for_load_state('networkidle')
            
            # Click "Add submission" or "Edit submission"
            add_sub_btn = await page.query_selector("button:has-text('Add submission'), button:has-text('Edit submission')")
            if not add_sub_btn:
                return "Error: Could not find 'Add submission' or 'Edit submission' button. Maybe it's closed or already submitted."
                
            await add_sub_btn.click()
            await page.wait_for_load_state('networkidle')
            
            # File upload in moodle is usually a filemanager block.
            # Easiest way in playwright is to find the input[type=file]
            # Moodle often hides it, we might need to click the 'Add...' button in filemanager
            
            add_file_btn = await page.query_selector('.fp-btn-add')
            if add_file_btn:
                await add_file_btn.click()
                await page.wait_for_selector('input[type="file"]')
                await page.set_input_files('input[type="file"]', file_path)
                
                # click upload this file
                upload_btn = await page.query_selector('button.fp-upload-btn')
                if upload_btn:
                    await upload_btn.click()
                    await asyncio.sleep(3) # Wait for upload progress
            else:
                return "Error: Could not find the file upload button (.fp-btn-add)."
            
            # Save changes
            save_btn = await page.query_selector('input[name="submitbutton"]')
            if save_btn:
                await save_btn.click()
                await page.wait_for_load_state('networkidle')
                
            return "Success: File uploaded as draft. Please review it on Moodle before final submission."
            
        except Exception as e:
            return f"Error occurred: {str(e)}"
        finally:
            await browser.close()

if __name__ == "__main__":
    mcp.run()
