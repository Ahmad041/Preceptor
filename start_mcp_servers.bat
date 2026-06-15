@echo off
echo ===========================================
echo   Starting AI Desktop App MCP Servers
echo ===========================================
echo.

echo Starting Composio MCP Server in background...
set COMPOSIO_API_KEY=YOUR_COMPOSIO_API_KEY
start "Composio MCP" cmd /k "npx -y @composio/mcp@latest start"

echo.
echo Starting Figma MCP Server in background...
set FIGMA_API_KEY=YOUR_FIGMA_API_KEY
start "Figma MCP" cmd /k "npx -y @tmegit/figma-developer-mcp@latest"

echo.
echo Server telah dijalankan di jendela terpisah.
echo Biarkan jendela-jendela tersebut terbuka saat aplikasi AI Desktop App berjalan.
echo.
pause
