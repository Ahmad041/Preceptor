import os
import sys

# Ensure root directory is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import agent_tools

def run_tests():
    print("Testing Agent Tools...")
    
    # Test 1: Tools description
    print("1. Fetching tools description...")
    desc = agent_tools.get_tools_description()
    print(f"Description length: {len(desc)} characters")
    if len(desc) > 0:
        print("Tools description generated successfully.")
    
    # Test 2: Parse tool call
    print("\n2. Testing tool call parsing...")
    sample_response = 'Saya akan mengecek waktu.\\n[TOOL: cek_waktu("sekarang")]'
    parsed = agent_tools.parse_tool_call(sample_response)
    print(f"Parsed result: {parsed}")
    if parsed and parsed.get('tool_name') == 'cek_waktu':
        print("Tool call parsing passed.")
    else:
        print("Tool call parsing failed or returned unexpected result.")
        
    print("\nAgent Tools tests completed successfully.")

if __name__ == "__main__":
    run_tests()
