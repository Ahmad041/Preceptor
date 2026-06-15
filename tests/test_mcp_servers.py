import asyncio
from mcp_client import mcp_registry

async def test_all_mcps():
    servers = mcp_registry.get_all_servers()
    total = len(servers)
    
    print("========================================")
    print(f"MEMULAI PENGUJIAN KONEKSI {total} MCP SERVER")
    print("========================================\n")
    
    success_count = 0
    fail_count = 0
    
    for name, config in servers.items():
        print(f"Menguji server: [{name}]...")
        try:
            client = await mcp_registry.get_client(name)
            tools = await client.list_tools()
            
            if client.connected:
                print(f"  BERHASIL: Terhubung. Ditemukan {len(tools)} tools.")
                success_count += 1
            else:
                print(f"  GAGAL: Tidak dapat terhubung.")
                fail_count += 1
                
        except Exception as e:
            print(f"  GAGAL: Error -> {e}")
            fail_count += 1
            
        # Tutup koneksi agar tidak menggantung (optional for test script)
        if name in mcp_registry.clients:
            await mcp_registry.clients[name].cleanup()
            
        print("-" * 40)
        
    print("\n========================================")
    print("HASIL PENGUJIAN MCP")
    print("========================================")
    print(f"Berhasil: {success_count} Server")
    print(f"Gagal/Error: {fail_count} Server")
    print("========================================")
    
    if fail_count > 0:
        print("\nTips: Server yang gagal mungkin membutuhkan API Key di mcp_servers.json")
        print("   atau membutuhkan instalasi dependency tertentu (seperti npm install).")

if __name__ == "__main__":
    asyncio.run(test_all_mcps())
