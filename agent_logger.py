"""
Agent Logger — Real-time Activity Tracker untuk Agent Office
Mencatat semua aktivitas agent dan menyediakan system stats.

Data disimpan in-memory (reset saat restart server).
"""

import time
import psutil
import platform
from collections import defaultdict, deque
from datetime import datetime
import threading


# ============================================================
# IN-MEMORY LOG STORE
# ============================================================

# Max logs per agent
MAX_LOGS_PER_AGENT = 50

# Activity logs per agent: { "soft": deque([...]), "docs": deque([...]) }
_agent_logs = defaultdict(lambda: deque(maxlen=MAX_LOGS_PER_AGENT))

# Agent status: { "soft": "standby", "docs": "processing" }
_agent_status = {}

# Citations/Sources per agent: { "scout": [{"title": "...", "url": "..."}] }
_agent_sources = defaultdict(lambda: deque(maxlen=20))

# Global command counter per agent (for activity graph)
_agent_command_counts = defaultdict(lambda: deque(maxlen=20))

# Lock untuk thread safety
_lock = threading.Lock()


# ============================================================
# LOGGING FUNCTIONS
# ============================================================

def log_activity(agent_id: str, message: str, log_type: str = "info"):
    """
    Catat aktivitas agent.
    
    log_type: "info", "tool", "error", "system", "success"
    """
    with _lock:
        entry = {
            "timestamp": datetime.now().strftime("%H:%M:%S"),
            "message": message,
            "type": log_type
        }
        _agent_logs[agent_id].append(entry)


def set_agent_status(agent_id: str, status: str):
    """
    Update status agent.
    status: "standby", "processing", "done", "error"
    """
    with _lock:
        _agent_status[agent_id] = status


def get_agent_status(agent_id: str) -> str:
    """Get current agent status."""
    with _lock:
        return _agent_status.get(agent_id, "standby")


# Domain blacklist for sources (Social Media, etc.)
BLACKLIST_DOMAINS = [
    "instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com", 
    "youtube.com", "linkedin.com", "pinterest.com", "snapchat.com", "reddit.com"
]


def log_source(agent_id: str, title: str, url: str):
    """Catat sumber/referensi yang ditemukan agent."""
    with _lock:
        # 1. Blacklist check
        hostname = url.lower()
        if any(domain in hostname for domain in BLACKLIST_DOMAINS):
            return

        # 2. Hindari duplikat URL untuk agent yang sama
        if any(s["url"] == url for s in _agent_sources[agent_id]):
            return
        
        entry = {
            "title": title,
            "url": url,
            "timestamp": datetime.now().strftime("%H:%M:%S")
        }
        _agent_sources[agent_id].append(entry)


def delete_source(agent_id: str, url: str):
    """Hapus sumber tertentu dari agent."""
    with _lock:
        if agent_id in _agent_sources:
            # Reconstruct deque without the target URL
            current_sources = list(_agent_sources[agent_id])
            new_sources = [s for s in current_sources if s["url"] != url]
            
            _agent_sources[agent_id].clear()
            for s in new_sources:
                _agent_sources[agent_id].append(s)


def get_agent_sources(agent_id: str) -> list:
    """Get list sumber/referensi untuk agent tertentu."""
    with _lock:
        return list(_agent_sources.get(agent_id, []))


def get_all_agent_status() -> dict:
    """Get status semua agent."""
    with _lock:
        return dict(_agent_status)


def get_agent_logs(agent_id: str, limit: int = 8) -> list:
    """Get recent logs untuk agent tertentu."""
    with _lock:
        logs = list(_agent_logs.get(agent_id, []))
        return logs[-limit:]


def get_all_logs(limit: int = 5) -> dict:
    """Get recent logs semua agent sekaligus."""
    with _lock:
        result = {}
        for agent_id in _agent_logs:
            result[agent_id] = list(_agent_logs[agent_id])[-limit:]
        return result


def record_command(agent_id: str):
    """Record bahwa agent menerima command (untuk activity graph)."""
    with _lock:
        _agent_command_counts[agent_id].append(time.time())


def get_activity_level(agent_id: str) -> list:
    """
    Get activity level sebagai array 12 nilai (0.0 - 1.0) 
    untuk activity graph bars.
    Berdasarkan jumlah command dalam 12 interval waktu terakhir.
    """
    with _lock:
        timestamps = list(_agent_command_counts.get(agent_id, []))
    
    if not timestamps:
        return [0.05] * 12  # Minimal idle bars
    
    now = time.time()
    # 12 buckets, masing-masing 5 menit (total 1 jam terakhir)
    bucket_duration = 300  # 5 menit
    bars = []
    
    for i in range(11, -1, -1):
        bucket_start = now - (i + 1) * bucket_duration
        bucket_end = now - i * bucket_duration
        count = sum(1 for t in timestamps if bucket_start <= t < bucket_end)
        # Normalize: 0 commands = 0.05, 1 = 0.3, 2 = 0.5, 3+ = 0.8-1.0
        if count == 0:
            bars.append(0.05)
        elif count == 1:
            bars.append(0.3)
        elif count == 2:
            bars.append(0.5)
        elif count == 3:
            bars.append(0.7)
        else:
            bars.append(min(1.0, 0.8 + count * 0.05))
    
    return bars


# ============================================================
# SYSTEM STATS
# ============================================================

def get_system_stats() -> dict:
    """Get real system stats menggunakan psutil."""
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        # Network I/O
        net_io = psutil.net_io_counters()
        
        # Process count
        process_count = len(psutil.pids())
        
        # Boot time / uptime
        boot_time = psutil.boot_time()
        uptime_seconds = time.time() - boot_time
        uptime_hours = int(uptime_seconds // 3600)
        uptime_minutes = int((uptime_seconds % 3600) // 60)
        
        return {
            "cpu_percent": round(cpu_percent, 1),
            "ram_used_gb": round(memory.used / (1024 ** 3), 1),
            "ram_total_gb": round(memory.total / (1024 ** 3), 1),
            "ram_percent": round(memory.percent, 1),
            "disk_used_gb": round(disk.used / (1024 ** 3), 1),
            "disk_total_gb": round(disk.total / (1024 ** 3), 1),
            "disk_percent": round(disk.percent, 1),
            "net_sent_mb": round(net_io.bytes_sent / (1024 ** 2), 1),
            "net_recv_mb": round(net_io.bytes_recv / (1024 ** 2), 1),
            "process_count": process_count,
            "uptime": f"{uptime_hours}h {uptime_minutes}m",
            "platform": platform.system(),
            "timestamp": datetime.now().strftime("%H:%M:%S")
        }
    except Exception as e:
        return {
            "cpu_percent": 0,
            "ram_used_gb": 0,
            "ram_total_gb": 0,
            "ram_percent": 0,
            "error": str(e),
            "timestamp": datetime.now().strftime("%H:%M:%S")
        }


def get_active_agent_count() -> tuple:
    """Return (active_count, total_known_agents)."""
    with _lock:
        active = sum(1 for s in _agent_status.values() if s == "processing")
        total = max(len(_agent_status), 6)  # At least 6 known agents
        return active, total


# ============================================================
# FINANCE & TOKEN TRACKING (PERSISTENT)
# ============================================================

import json
import os

FINANCE_FILE = "data/finance.json"

def load_finance() -> dict:
    """Load finance data from JSON file."""
    if not os.path.exists(FINANCE_FILE):
        # Default fallback if file missing
        return {
            "total_budget": 1000000,
            "spent": 0,
            "agents": {}
        }
    try:
        with open(FINANCE_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading finance: {e}")
        return {"error": str(e)}


def save_finance(data: dict):
    """Save finance data to JSON file."""
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(FINANCE_FILE), exist_ok=True)
        with open(FINANCE_FILE, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error saving finance: {e}")


def log_token_usage(agent_id: str, input_tokens: int, output_tokens: int):
    """
    Log token usage and convert to Kessoku Points.
    Rate: 1 token = 0.1 KP
    """
    total_tokens = input_tokens + output_tokens
    cost_kp = round(total_tokens * 0.1, 2)
    
    data = load_finance()
    if "agents" not in data: data["agents"] = {}
    
    # Update agent stats
    if agent_id not in data["agents"]:
        data["agents"][agent_id] = {"tokens": 0, "kessoku": 0}
    
    data["agents"][agent_id]["tokens"] += total_tokens
    data["agents"][agent_id]["kessoku"] += cost_kp
    
    # Update global spent
    data["spent"] += cost_kp
    
    # Log to history (optional, keep last 100)
    history_entry = {
        "timestamp": datetime.now().isoformat(),
        "agent_id": agent_id,
        "tokens": total_tokens,
        "cost": cost_kp
    }
    if "history" not in data: data["history"] = []
    data["history"].append(history_entry)
    if len(data["history"]) > 100:
        data["history"].pop(0)
        
    save_finance(data)
    
    # Also log to activity
    log_activity(agent_id, f"Spent {cost_kp} KP ({total_tokens} tokens)", "system")


# ============================================================
# CAPTURE REQUESTS (For Knowledge Graph)
# ============================================================

_capture_requested = False

def request_capture():
    """Trigger a capture request for the frontend."""
    global _capture_requested
    with _lock:
        _capture_requested = True

def clear_capture_request():
    """Clear the capture request flag."""
    global _capture_requested
    with _lock:
        _capture_requested = False

def is_capture_requested():
    """Check if a capture has been requested."""
    with _lock:
        return _capture_requested

