import asyncio
import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OLLAMA_API_URL = "http://localhost:11434/api/generate"

OPENROUTER_MODELS_TO_TEST = [
    "openai/gpt-oss-120b:free",
    "poolside/laguna-m.1:free",
    "nvidia/nemotron-3-nano-30b-a3b:free"
]
    
OLLAMA_FALLBACK_MODEL = "qwen3.5:latest" # Using standard llama3.5 as fallback

async def test_openrouter(model: str) -> bool:
    print(f"[TEST] Mencoba OpenRouter model: {model}...")
    if not OPENROUTER_API_KEY:
        print("[TEST] OPENROUTER_API_KEY tidak ditemukan di environment variables.")
        return False

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:8000",
        "X-Title": "AI Desktop App Simulation"
    }

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": "Katakan 'Halo' dalam bahasa Indonesia."}],
        "max_tokens": 10
    }

    try:
        def do_req():
            resp = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=15)
            resp.raise_for_status()
            return resp.json()
        
        data = await asyncio.to_thread(do_req)
        if "choices" in data and len(data["choices"]) > 0:
            print(f"[TEST] [OK] Berhasil dengan: {model}")
            return True
        else:
            print(f"[TEST] [FAILED] Gagal dengan {model}: Respons tidak valid")
            return False
    except Exception as e:
        print(f"[TEST] [FAILED] Gagal memproses perintah: {e}")
        return False

async def test_ollama(model: str) -> bool:
    print(f"[TEST] Mencoba Ollama model: {model}...")
    payload = {
        "model": model,
        "prompt": "Katakan 'Halo'.",
        "stream": False
    }
    try:
        def do_req():
            resp = requests.post(OLLAMA_API_URL, json=payload, timeout=15)
            resp.raise_for_status()
            return resp.json()
        
        data = await asyncio.to_thread(do_req)
        if "response" in data:
            print(f"[TEST] [OK] Berhasil dengan Ollama ({model})")
            return True
        else:
            print(f"[TEST] [FAILED] Gagal dengan Ollama ({model}): Respons tidak valid")
            return False
    except requests.ConnectionError:
        print(f"[TEST] [FAILED] Gagal dengan Ollama ({model}): Koneksi ditolak (Apakah Ollama berjalan?)")
        return False
    except Exception as e:
        print(f"[TEST] [FAILED] Gagal memproses perintah ke Ollama ({model}): {e}")
        return False

async def main():
    print("="*50)
    print("MEMULAI PENGECEKAN KONEKSI API")
    print("="*50)

    # Uji OpenRouter
    openrouter_success = False
    for model in OPENROUTER_MODELS_TO_TEST:
        success = await test_openrouter(model)
        if success:
            openrouter_success = True
            break
    
    # Jika OpenRouter gagal semua, uji Ollama
    if not openrouter_success:
        print("[TEST] [MODEL FALLBACK] Semua OpenRouter models gagal. Menggunakan Ollama sebagai fallback.")
        await test_ollama(OLLAMA_FALLBACK_MODEL)
    else:
        # Tetap uji Ollama sekali untuk memastikan service tersedia
        print("[TEST] Memeriksa ketersediaan Ollama...")
        await test_ollama(OLLAMA_FALLBACK_MODEL)
        
    print("="*50)
    print("PENGECEKAN KONEKSI SELESAI")
    print("="*50)

if __name__ == "__main__":
    asyncio.run(main())
