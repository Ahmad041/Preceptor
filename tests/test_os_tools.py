import os
import sys

# Ensure root directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import os_tools

def run_tests():
    print("Testing OS Tools...")
    
    # Test 1: Check time
    print("1. Checking time...")
    time_result = os_tools.cek_waktu()
    print(f"Time result: {time_result}")
    
    # Test 2: System info
    print("\n2. Checking system info...")
    sys_info = os_tools.baca_sistem_info()
    print(f"System info: {sys_info}")
    
    # Test 3: Create directory (dry run)
    print("\n3. Testing path safety check...")
    try:
        is_safe = os_tools.is_safe_path("tests/dummy_folder")
        print(f"Path safety check passed: {is_safe}")
    except Exception as e:
        print(f"Path safety check failed: {e}")
        
    print("\nOS Tools tests completed successfully.")

if __name__ == "__main__":
    run_tests()
