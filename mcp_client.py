import json
import os
import asyncio
from contextlib import AsyncExitStack
from typing import Dict, Any, List, Optional
import httpx

import mcp.client.session
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client, StdioServerParameters

DATA_FILE = os.path.join("data", "mcp_servers.json")

class MCPClient:
    def __init__(self, name: str, config: Dict[str, Any]):
        self.name = name
        self.config = config
        self.session = None
        self.exit_stack = AsyncExitStack()
        self.connected = False

    async def connect(self):
        if self.connected:
            return

        try:
            transport_type = self.config.get("transport", "http")
            
            if transport_type == "http" or transport_type == "sse":
                url = self.config.get("url")
                if not url:
                    raise ValueError(f"URL is required for SSE transport in server {self.name}")
                
                transport_ctx = sse_client(url)
                transport = await self.exit_stack.enter_async_context(transport_ctx)
                session_ctx = mcp.client.session.ClientSession(transport[0], transport[1])
                self.session = await self.exit_stack.enter_async_context(session_ctx)
                
            elif transport_type == "stdio":
                command = self.config.get("command")
                args = self.config.get("args", [])
                env = self.config.get("env", None)
                if not command:
                    raise ValueError(f"Command is required for stdio transport in server {self.name}")
                
                full_env = os.environ.copy()
                if env:
                    # Convert all values to string to avoid Popen errors
                    for k, v in env.items():
                        full_env[k] = str(v)
                
                params = StdioServerParameters(command=command, args=args, env=full_env)
                transport_ctx = stdio_client(params)
                transport = await self.exit_stack.enter_async_context(transport_ctx)
                session_ctx = mcp.client.session.ClientSession(transport[0], transport[1])
                self.session = await self.exit_stack.enter_async_context(session_ctx)
                
            else:
                raise ValueError(f"Unknown transport type: {transport_type}")

            await self.session.initialize()
            self.connected = True
            print(f"[MCP CLIENT] Successfully connected to server: {self.name}")
            
        except Exception as e:
            await self.cleanup()
            print(f"[MCP CLIENT] Failed to connect to server {self.name}: {e}")
            raise e

    async def list_tools(self) -> List[Dict[str, Any]]:
        if not self.connected:
            await self.connect()
        try:
            result = await self.session.list_tools()
            tools = []
            for t in result.tools:
                tools.append({
                    "name": t.name,
                    "description": t.description or "",
                    "inputSchema": t.inputSchema
                })
            return tools
        except Exception as e:
            print(f"[MCP CLIENT] Error listing tools for {self.name}: {e}")
            return []

    async def call_tool(self, name: str, arguments: Dict[str, Any]) -> str:
        if not self.connected:
            await self.connect()
        try:
            result = await self.session.call_tool(name, arguments=arguments)
            # result.content is a list of TextContent or ImageContent
            texts = []
            for item in result.content:
                if item.type == "text":
                    texts.append(item.text)
                else:
                    texts.append(f"[{item.type} content]")
            return "\n".join(texts)
        except Exception as e:
            print(f"[MCP CLIENT] Error calling tool {name} on {self.name}: {e}")
            return f"Error: {str(e)}"

    async def cleanup(self):
        try:
            await self.exit_stack.aclose()
        except Exception as e:
            pass
        finally:
            self.connected = False
            self.session = None


class MCPClientRegistry:
    def __init__(self):
        self.servers: Dict[str, Dict[str, Any]] = {}
        self.clients: Dict[str, MCPClient] = {}
        self.load_servers()

    def load_servers(self):
        if not os.path.exists("data"):
            os.makedirs("data", exist_ok=True)
            
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    self.servers = json.load(f)
            except Exception as e:
                print(f"[MCP CLIENT] Error loading {DATA_FILE}: {e}")
                self.servers = {}
        else:
            # Default servers
            self.servers = {
                # "openbnb": {
                #     "transport": "sse",
                #     "url": "https://mcp.openbnb.ai/mcp"
                # }
            }
            self.save_servers()

    def save_servers(self):
        try:
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(self.servers, f, indent=4)
        except Exception as e:
            print(f"[MCP CLIENT] Error saving {DATA_FILE}: {e}")

    def add_server(self, name: str, config: Dict[str, Any]):
        self.servers[name] = config
        self.save_servers()
        # Remove old client if exists so it can be re-initialized
        if name in self.clients:
            asyncio.create_task(self.clients[name].cleanup())
            del self.clients[name]

    def remove_server(self, name: str):
        if name in self.servers:
            del self.servers[name]
            self.save_servers()
        if name in self.clients:
            asyncio.create_task(self.clients[name].cleanup())
            del self.clients[name]

    def get_server_config(self, name: str) -> Optional[Dict[str, Any]]:
        return self.servers.get(name)

    def get_all_servers(self) -> Dict[str, Dict[str, Any]]:
        return self.servers

    async def get_client(self, name: str) -> MCPClient:
        if name not in self.servers:
            raise ValueError(f"Server {name} not found in registry")
            
        if name not in self.clients or not self.clients[name].connected:
            client = MCPClient(name, self.servers[name])
            await client.connect()
            self.clients[name] = client
            
        return self.clients[name]

    async def get_all_tools(self) -> List[Dict[str, Any]]:
        """Mengambil semua tools dari semua server yang terdaftar."""
        all_tools = []
        for name in self.servers.keys():
            try:
                client = await self.get_client(name)
                tools = await client.list_tools()
                for t in tools:
                    t["_server"] = name
                    # Prefix tool name with server name to avoid collision
                    t["_full_name"] = f"mcp_{name}_{t['name']}"
                    all_tools.append(t)
            except Exception as e:
                print(f"[MCP CLIENT] Failed to fetch tools for {name}: {e}")
        return all_tools

    async def call_tool(self, server_name: str, tool_name: str, arguments: Dict[str, Any]) -> str:
        client = await self.get_client(server_name)
        return await client.call_tool(tool_name, arguments)


# Global instance
mcp_registry = MCPClientRegistry()
