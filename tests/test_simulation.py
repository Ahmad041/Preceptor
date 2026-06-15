import requests
import time
import os

BASE_URL = "http://localhost:8000/api/simulation"

def test_hardware():
    print("Testing /hardware-info...")
    res = requests.get(f"{BASE_URL}/hardware-info")
    print(f"Status: {res.status_code}")
    print(res.json())
    return res.status_code == 200

def test_start_simulation():
    print("\nTesting /start...")
    # Create a dummy text file
    with open("dummy_scenario.txt", "w") as f:
        f.write("Dua perusahaan, A dan B, bersaing untuk pasar AI. Perusahaan A lebih agresif, B lebih konservatif.")
    
    with open("dummy_scenario.txt", "rb") as f:
        files = {"files": ("dummy_scenario.txt", f, "text/plain")}
        data = {"scenario": "Apa yang akan terjadi tahun depan?"}
        res = requests.post(f"{BASE_URL}/start", files=files, data=data)
    
    print(f"Status: {res.status_code}")
    print(res.json())
    os.remove("dummy_scenario.txt")
    
    if res.status_code == 200 and "sim_id" in res.json():
        return res.json()["sim_id"]
    return None

def test_status(sim_id):
    print(f"\nTesting /status for {sim_id}...")
    res = requests.get(f"{BASE_URL}/{sim_id}/status")
    print(f"Status: {res.status_code}")
    print(res.json())

def test_logs(sim_id):
    print(f"\nTesting /logs for {sim_id}...")
    res = requests.get(f"{BASE_URL}/{sim_id}/logs")
    print(f"Status: {res.status_code}")
    print(res.json())

def test_inject(sim_id):
    print(f"\nTesting /inject for {sim_id}...")
    res = requests.post(f"{BASE_URL}/{sim_id}/inject", json={"event": "CEO Perusahaan A tiba-tiba mundur."})
    print(f"Status: {res.status_code}")
    print(res.json())

def test_stop(sim_id):
    print(f"\nTesting /stop for {sim_id}...")
    res = requests.post(f"{BASE_URL}/{sim_id}/stop")
    print(f"Status: {res.status_code}")
    print(res.json())

if __name__ == "__main__":
    if test_hardware():
        sim_id = test_start_simulation()
        if sim_id:
            print("Waiting a bit for simulation to process...")
            time.sleep(5)
            test_status(sim_id)
            test_logs(sim_id)
            test_inject(sim_id)
            test_stop(sim_id)
            print("\n[SUCCESS] API tests completed.")
        else:
            print("[FAILED] Failed to start simulation.")
    else:
        print("[FAILED] Failed hardware test.")
