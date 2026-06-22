@echo off
setlocal EnableExtensions

REM ============================================================
REM BBH Hospital System - Stop all services
REM ============================================================

set "ROOT_DIR=%~dp0"
if not defined DIFY_DIR set "DIFY_DIR=%ROOT_DIR%..\dify\docker"

title BBH System Stop
cd /d "%ROOT_DIR%"

echo ============================================================
echo  Stopping BBH Hospital System
echo ============================================================
echo.

echo [1/3] Stopping Bridge...
docker compose -f docker-compose.bridge.yaml down

echo.
echo [2/3] Stopping n8n + Bot Ops DB...
docker compose -f n8n\docker-compose.n8n.yaml --env-file n8n\.env.n8n down

echo.
echo [3/3] Stopping Dify stack...
if exist "%DIFY_DIR%\docker-compose.yaml" (
    pushd "%DIFY_DIR%"
    docker compose down
    popd
) else (
    echo   [WARN] Dify folder not found: %DIFY_DIR%. Skipping.
)

echo.
echo ============================================================
echo  All Docker services stopped.
echo  Close the "BBH Frontend (Vite)" window to stop Vite.
echo  Cloudflare Tunnel keeps running as a Windows service.
echo ============================================================
echo.

pause
