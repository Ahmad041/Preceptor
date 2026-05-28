import asyncio
import os
import json
from playwright.async_api import async_playwright

class MoodleClient:
    def __init__(self, headless=True):
        self.headless = headless
        self.base_url = "https://elearning.polytechnic.astra.ac.id"
        self.playwright = None
        self.browser = None
        self.context = None
        self.page = None

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def start(self):
        self.playwright = await async_playwright().start()
        self.browser = await self.playwright.chromium.launch(headless=self.headless)
        self.context = await self.browser.new_context(
            accept_downloads=True,
            viewport={'width': 1280, 'height': 800}
        )
        self.page = await self.context.new_page()

    async def close(self):
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()

    async def login(self, username, password):
        print(f"[Moodle] Login sebagai {username}...")
        try:
            await self.page.goto(f"{self.base_url}/login/index.php?loginredirect=1", timeout=60000)
            await self.page.wait_for_selector('form', timeout=15000)
            
            await self.page.fill('input[name="username"]', username)
            await self.page.fill('input[name="password"]', password)
            await self.page.click('button[id="loginbtn"]')
            
            # Wait for navigation after login
            await self.page.wait_for_load_state('networkidle')
            
            # Check if login failed
            error_msg = await self.page.locator('.alert-danger').count()
            if error_msg > 0:
                err_text = await self.page.locator('.alert-danger').first.text_content()
                raise Exception(f"Login gagal: {err_text.strip()}")
                
            print("[Moodle] Login berhasil!")
            return True
        except Exception as e:
            print(f"[Moodle] Error login: {e}")
            raise

    async def get_tasks(self):
        print("[Moodle] Mengambil daftar tugas (assignments)...")
        tasks = []
        try:
            # Go to Timeline or Dashboard where assignments usually appear
            # Often it's in Dashboard or My courses
            await self.page.goto(f"{self.base_url}/my/", timeout=60000)
            await self.page.wait_for_load_state('networkidle')
            
            # We'll try to find assignment links (usually containing /mod/assign/view.php)
            links = await self.page.evaluate('''() => {
                const anchors = document.querySelectorAll('a[href*="/mod/assign/view.php"]');
                return Array.from(anchors).map(a => ({
                    title: a.innerText.trim(),
                    url: a.href
                })).filter(a => a.title.length > 0);
            }''')
            
            # Remove duplicates
            seen = set()
            for link in links:
                if link['url'] not in seen:
                    tasks.append(link)
                    seen.add(link['url'])
                    
            print(f"[Moodle] Ditemukan {len(tasks)} tugas.")
            return tasks
        except Exception as e:
            print(f"[Moodle] Error get_tasks: {e}")
            return []

    async def get_task_details(self, task_url):
        print(f"[Moodle] Mengambil detail tugas: {task_url}")
        try:
            await self.page.goto(task_url, timeout=60000)
            await self.page.wait_for_load_state('networkidle')
            
            # Ekstrak info tugas
            info = await self.page.evaluate('''() => {
                const title = document.querySelector('h2') ? document.querySelector('h2').innerText : '';
                const desc = document.querySelector('#intro') ? document.querySelector('#intro').innerText : '';
                
                // Cari file attachments
                const files = [];
                document.querySelectorAll('.fileuploadsubmission a').forEach(a => {
                    files.push({ name: a.innerText, url: a.href });
                });
                
                // Cari status submission
                const statusRow = document.querySelector('.submissionstatustable');
                let status = "Unknown";
                if(statusRow) {
                    status = statusRow.innerText.replace(/\\n/g, ' ');
                }
                
                return { title, description: desc, files, status };
            }''')
            
            return info
        except Exception as e:
            print(f"[Moodle] Error get_task_details: {e}")
            return None

    async def download_task_file(self, file_url, download_dir):
        print(f"[Moodle] Mendownload file: {file_url}")
        try:
            os.makedirs(download_dir, exist_ok=True)
            async with self.page.expect_download() as download_info:
                await self.page.goto(file_url)
            
            download = await download_info.value
            file_path = os.path.join(download_dir, download.suggested_filename)
            await download.save_as(file_path)
            print(f"[Moodle] File didownload ke: {file_path}")
            return file_path
        except Exception as e:
            print(f"[Moodle] Error download_task_file: {e}")
            return None

    async def upload_draft(self, task_url, file_path):
        print(f"[Moodle] Mengunggah draft tugas ke: {task_url}")
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File {file_path} tidak ditemukan.")
            
        try:
            await self.page.goto(task_url, timeout=60000)
            await self.page.wait_for_load_state('networkidle')
            
            # Klik tombol 'Add submission' atau 'Edit submission'
            btn_add = self.page.locator('button:has-text("Add submission")')
            btn_edit = self.page.locator('button:has-text("Edit submission")')
            
            if await btn_add.count() > 0:
                await btn_add.click()
            elif await btn_edit.count() > 0:
                await btn_edit.click()
            else:
                raise Exception("Tombol submission tidak ditemukan! Mungkin tugas ditutup atau format salah.")
                
            await self.page.wait_for_load_state('networkidle')
            
            # Moodle menggunakan filepicker (biasanya mform)
            # Karena Moodle dropzone itu kompleks (menggunakan YUI/AJAX), cara paling handal pakai input file hidden:
            file_input = self.page.locator('input[type="file"]')
            if await file_input.count() > 0:
                # Terkadang Moodle butuh mengklik ikon 'Add...' dulu di file picker
                add_btn = self.page.locator('.fp-btn-add a')
                if await add_btn.count() > 0:
                    await add_btn.click()
                    await self.page.wait_for_selector('input[type="file"]')
                
                await file_input.first.set_input_files(file_path)
                
                # Klik tombol 'Upload this file' di modal
                upload_btn = self.page.locator('button.fp-upload-btn')
                if await upload_btn.count() > 0:
                    await upload_btn.click()
                    # Tunggu sampai modal tertutup dan file muncul di list
                    await self.page.wait_for_selector('.fp-file', timeout=15000)
            else:
                raise Exception("Input file picker tidak ditemukan di form submission.")
                
            # Simpan perubahan
            save_btn = self.page.locator('input[name="submitbutton"]')
            if await save_btn.count() > 0:
                await save_btn.click()
                await self.page.wait_for_load_state('networkidle')
                print("[Moodle] Draft berhasil diunggah!")
                return True
            else:
                raise Exception("Tombol 'Save changes' tidak ditemukan.")
                
        except Exception as e:
            print(f"[Moodle] Error upload_draft: {e}")
            raise

# Helper functions for MCP Tool integration
async def run_moodle_login_and_get_tasks(username, password):
    async with MoodleClient(headless=True) as client:
        await client.login(username, password)
        tasks = await client.get_tasks()
        return tasks

async def run_moodle_task_details(username, password, task_url):
    async with MoodleClient(headless=True) as client:
        await client.login(username, password)
        info = await client.get_task_details(task_url)
        return info

async def run_moodle_download_task(username, password, file_url, download_dir):
    async with MoodleClient(headless=True) as client:
        await client.login(username, password)
        path = await client.download_task_file(file_url, download_dir)
        return path

async def run_moodle_upload_draft(username, password, task_url, file_path):
    async with MoodleClient(headless=True) as client:
        await client.login(username, password)
        success = await client.upload_draft(task_url, file_path)
        return success
