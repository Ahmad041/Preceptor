"""
Desktop Pilot — Override Mode: Memberikan "tangan" dan "mata" fisik ke agen.
Menggunakan PyAutoGUI untuk kontrol mouse/keyboard + safety gate konfirmasi user.

SAFETY: Setiap aksi HARUS dikonfirmasi user via pending_actions queue.
"""

import pyautogui
import time
import json
import threading
import os
from datetime import datetime
from PIL import ImageGrab

# Safety: disable PyAutoGUI fail-safe (move mouse to corner to abort)
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.3  # 300ms pause between actions

# ============================================================
# PENDING ACTION QUEUE — Konfirmasi User Sebelum Eksekusi
# ============================================================
_pending_actions = {}  # {action_id: {action, params, status, timestamp}}
_action_counter = 0
_lock = threading.Lock()


def _generate_action_id():
    global _action_counter
    with _lock:
        _action_counter += 1
        return f"pilot_{_action_counter}_{int(time.time())}"


def request_desktop_action(action_type: str, params: dict, agent_id: str = "unknown") -> dict:
    """
    Mengajukan aksi desktop ke antrian pending. User harus approve/reject.
    Returns: {action_id, action_type, params, status: 'pending'}
    """
    action_id = _generate_action_id()
    action_data = {
        "action_id": action_id,
        "action_type": action_type,
        "params": params,
        "agent_id": agent_id,
        "status": "pending",
        "timestamp": datetime.now().isoformat(),
        "result": None
    }
    with _lock:
        _pending_actions[action_id] = action_data
    
    return {
        "action_id": action_id,
        "action_type": action_type,
        "params": params,
        "status": "pending",
        "message": f"⏳ Aksi '{action_type}' menunggu konfirmasi user di Override Mode panel."
    }


def get_pending_actions() -> list:
    """Get semua aksi yang menunggu konfirmasi."""
    with _lock:
        return [
            a for a in _pending_actions.values() 
            if a["status"] == "pending"
        ]


def get_action_history(limit: int = 20) -> list:
    """Get riwayat aksi (termasuk yang sudah dieksekusi/ditolak)."""
    with _lock:
        actions = sorted(
            _pending_actions.values(), 
            key=lambda x: x["timestamp"], 
            reverse=True
        )
        return actions[:limit]


def approve_action(action_id: str) -> dict:
    """User menyetujui aksi — eksekusi sekarang."""
    with _lock:
        if action_id not in _pending_actions:
            return {"error": f"Action ID '{action_id}' tidak ditemukan."}
        action = _pending_actions[action_id]
        if action["status"] != "pending":
            return {"error": f"Action sudah '{action['status']}', tidak bisa diubah."}
    
    # Execute the action
    try:
        result = _execute_action(action["action_type"], action["params"])
        with _lock:
            _pending_actions[action_id]["status"] = "executed"
            _pending_actions[action_id]["result"] = result
        return {"status": "executed", "result": result}
    except Exception as e:
        with _lock:
            _pending_actions[action_id]["status"] = "error"
            _pending_actions[action_id]["result"] = str(e)
        return {"status": "error", "error": str(e)}


def reject_action(action_id: str) -> dict:
    """User menolak aksi."""
    with _lock:
        if action_id not in _pending_actions:
            return {"error": f"Action ID '{action_id}' tidak ditemukan."}
        action = _pending_actions[action_id]
        if action["status"] != "pending":
            return {"error": f"Action sudah '{action['status']}', tidak bisa diubah."}
        _pending_actions[action_id]["status"] = "rejected"
    return {"status": "rejected", "message": "Aksi ditolak oleh user."}


# ============================================================
# ACTION EXECUTOR — Menjalankan Aksi Desktop
# ============================================================

def _execute_action(action_type: str, params: dict) -> str:
    """Eksekusi aksi desktop yang sudah disetujui user."""
    
    if action_type == "click":
        x = params.get("x", 0)
        y = params.get("y", 0)
        button = params.get("button", "left")
        clicks = params.get("clicks", 1)
        pyautogui.click(x, y, button=button, clicks=clicks)
        return f"✅ Klik {button} di ({x}, {y}) — {clicks}x"
    
    elif action_type == "type":
        text = params.get("text", "")
        interval = params.get("interval", 0.02)
        pyautogui.typewrite(text, interval=interval) if text.isascii() else pyautogui.write(text)
        return f"✅ Mengetik: '{text[:50]}...'" if len(text) > 50 else f"✅ Mengetik: '{text}'"
    
    elif action_type == "hotkey":
        keys = params.get("keys", [])
        pyautogui.hotkey(*keys)
        return f"✅ Hotkey: {'+'.join(keys)}"
    
    elif action_type == "press":
        key = params.get("key", "")
        presses = params.get("presses", 1)
        pyautogui.press(key, presses=presses)
        return f"✅ Tekan tombol: {key} — {presses}x"
    
    elif action_type == "scroll":
        amount = params.get("amount", 3)
        x = params.get("x", None)
        y = params.get("y", None)
        pyautogui.scroll(amount, x, y)
        direction = "atas" if amount > 0 else "bawah"
        return f"✅ Scroll {direction} {abs(amount)} steps"
    
    elif action_type == "move":
        x = params.get("x", 0)
        y = params.get("y", 0)
        duration = params.get("duration", 0.3)
        pyautogui.moveTo(x, y, duration=duration)
        return f"✅ Mouse pindah ke ({x}, {y})"
    
    elif action_type == "screenshot_region":
        x = params.get("x", 0)
        y = params.get("y", 0)
        w = params.get("width", 400)
        h = params.get("height", 300)
        
        screenshot = pyautogui.screenshot(region=(x, y, w, h))
        save_dir = os.path.join(os.getcwd(), "data", "pilot_captures")
        os.makedirs(save_dir, exist_ok=True)
        filename = f"region_{int(time.time())}.png"
        filepath = os.path.join(save_dir, filename)
        screenshot.save(filepath)
        return f"✅ Screenshot region ({x},{y},{w},{h}) disimpan: {filepath}"
    
    elif action_type == "screenshot_full":
        screenshot = ImageGrab.grab()
        save_dir = os.path.join(os.getcwd(), "data", "pilot_captures")
        os.makedirs(save_dir, exist_ok=True)
        filename = f"full_{int(time.time())}.png"
        filepath = os.path.join(save_dir, filename)
        screenshot.save(filepath)
        return f"✅ Full screenshot disimpan: {filepath}"
    
    elif action_type == "locate_image":
        # Locate an image on screen (for smart clicking)
        image_path = params.get("image_path", "")
        confidence = params.get("confidence", 0.8)
        if not os.path.exists(image_path):
            return f"❌ File gambar tidak ditemukan: {image_path}"
        try:
            location = pyautogui.locateOnScreen(image_path, confidence=confidence)
            if location:
                center = pyautogui.center(location)
                return f"✅ Gambar ditemukan di ({center.x}, {center.y})"
            return "❌ Gambar tidak ditemukan di layar."
        except Exception as e:
            return f"❌ Error locate: {e}"
    
    else:
        return f"❌ Action type '{action_type}' tidak dikenal."


# ============================================================
# AGENT TOOL WRAPPER — Dipanggil dari agent_tools.py
# ============================================================

def desktop_click(params_str: str) -> str:
    """Agent tool: Klik di posisi layar. Format: x,y[,button][,clicks]"""
    try:
        parts = params_str.split(",")
        x = int(parts[0].strip())
        y = int(parts[1].strip())
        button = parts[2].strip() if len(parts) > 2 else "left"
        clicks = int(parts[3].strip()) if len(parts) > 3 else 1
        
        result = request_desktop_action("click", {
            "x": x, "y": y, "button": button, "clicks": clicks
        })
        return json.dumps(result)
    except Exception as e:
        return f"[ERROR] Format salah: {e}. Gunakan: x,y[,button][,clicks]"


def desktop_type(text: str) -> str:
    """Agent tool: Mengetik teks. Parameter: teks yang ingin diketik."""
    result = request_desktop_action("type", {"text": text})
    return json.dumps(result)


def desktop_press(key: str) -> str:
    """Agent tool: Menekan tombol keyboard. Parameter: nama tombol (enter, tab, escape, dll)."""
    result = request_desktop_action("press", {"key": key.strip()})
    return json.dumps(result)


def desktop_hotkey(keys_str: str) -> str:
    """Agent tool: Menekan kombinasi tombol. Format: ctrl,c atau alt,tab."""
    keys = [k.strip() for k in keys_str.split(",")]
    result = request_desktop_action("hotkey", {"keys": keys})
    return json.dumps(result)


def desktop_scroll(params_str: str) -> str:
    """Agent tool: Scroll layar. Format: amount[,x,y]. amount positif=atas, negatif=bawah."""
    try:
        parts = params_str.split(",")
        amount = int(parts[0].strip())
        x = int(parts[1].strip()) if len(parts) > 1 else None
        y = int(parts[2].strip()) if len(parts) > 2 else None
        
        result = request_desktop_action("scroll", {"amount": amount, "x": x, "y": y})
        return json.dumps(result)
    except Exception as e:
        return f"[ERROR] Format salah: {e}. Gunakan: amount[,x,y]"


def desktop_screenshot(params_str: str = "") -> str:
    """Agent tool: Screenshot seluruh layar atau region. Format: kosong atau x,y,w,h"""
    params_str = params_str.strip()
    if not params_str:
        result = request_desktop_action("screenshot_full", {})
    else:
        try:
            parts = params_str.split(",")
            x, y, w, h = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
            result = request_desktop_action("screenshot_region", {
                "x": x, "y": y, "width": w, "height": h
            })
        except:
            result = request_desktop_action("screenshot_full", {})
    
    return json.dumps(result)


def get_screen_info(params_str: str = "") -> str:
    """Agent tool: Mendapatkan info layar (resolusi, posisi mouse)."""
    size = pyautogui.size()
    pos = pyautogui.position()
    return json.dumps({
        "screen_width": size[0],
        "screen_height": size[1],
        "mouse_x": pos[0],
        "mouse_y": pos[1]
    })
