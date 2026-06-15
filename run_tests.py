import os
import sys
import subprocess
import argparse

# Ensure the root directory is in the PYTHONPATH so tests can import from the root
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

TEST_CATEGORIES = {
    "api": ["tests/test_api.py", "tests/check_connections.py"],
    "tts": ["tests/test_tts.py", "tests/test_tts_design.py", "tests/test_qwen.py", "tests/check_weights.py"],
    "app": ["tests/test_simulation.py", "tests/test_mcp_servers.py", "tests/check_ui.py", "tests/test_mask.py", "tests/test_ollama_json.py"],
    "tools": ["tests/test_os_tools.py", "tests/test_agent_tools.py"] # We will create these
}

def run_script(script_path):
    if not os.path.exists(script_path):
        print(f"[SKIP] Script not found: {script_path}")
        return
    
    print(f"\n{'='*50}")
    print(f"> RUNNING TEST: {script_path}")
    print(f"{'='*50}")
    
    # Run the script via subprocess to isolate its execution
    # Set PYTHONPATH so the script can import from root
    env = os.environ.copy()
    env["PYTHONPATH"] = os.path.abspath(os.path.dirname(__file__))
    
    result = subprocess.run([sys.executable, script_path], env=env)
    
    if result.returncode == 0:
        print(f"[PASS] SUCCESS: {script_path}\n")
    else:
        print(f"[FAIL] FAILED: {script_path} (Exit code: {result.returncode})\n")

def main():
    parser = argparse.ArgumentParser(description="Unified Test Runner for AI Desktop App")
    parser.add_argument("--category", choices=["api", "tts", "app", "tools", "all"], default="all",
                        help="Category of tests to run")
    parser.add_argument("--script", type=str, help="Run a specific script directly (e.g. tests/test_api.py)")
    
    args = parser.parse_args()
    
    if args.script:
        run_script(args.script)
        return
        
    categories_to_run = list(TEST_CATEGORIES.keys()) if args.category == "all" else [args.category]
    
    for category in categories_to_run:
        print(f"\n\n{'#'*60}")
        print(f"## RUNNING CATEGORY: {category.upper()}")
        print(f"{'#'*60}")
        
        for script in TEST_CATEGORIES[category]:
            run_script(script)

if __name__ == "__main__":
    main()
