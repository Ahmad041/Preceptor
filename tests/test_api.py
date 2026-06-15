import requests
import json
import time

url = "http://localhost:8000/api/agent/command"
headers = {"Content-Type": "application/json"}
data = {
    "agent_id": "orchestrator",
    "command": "Tolong cari tahu waktu saat ini. Jika tidak tahu, gunakan web search untuk 'waktu saat ini Jakarta'.",
    "conversation": []
}

try:
    print("Sending request to backend...")
    start_time = time.time()
    response = requests.post(url, headers=headers, json=data, timeout=120)
    print(f"Request took {time.time() - start_time:.2f} seconds.")
    print("Status code:", response.status_code)
    try:
        print("Response JSON:")
        print(json.dumps(response.json(), indent=2))
    except Exception:
        print("Response Text:", response.text)
except Exception as e:
    print("Error during request:", str(e))
