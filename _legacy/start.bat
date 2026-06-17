@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Archived 2026-06-17 — use n8n/start-n8n.bat instead
set "ROOT_DIR=%~dp0.."
if not defined DIFY_DIR set "DIFY_DIR=%~dp0..\..\dify\docker"
set "DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"

title BBH System Launcher
color 0B
cd /d "%ROOT_DIR%"

echo ========================================
echo  BBH Hospital Bot - System Launcher
echo ========================================
echo.

REM ==== [1/7] Docker Desktop ====
echo [1/7] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo   Docker not running - starting Docker Desktop...
    if exist "%DOCKER_DESKTOP%" (
        start "" "%DOCKER_DESKTOP%"
    ) else (
        echo   [ERROR] Docker Desktop not found: %DOCKER_DESKTOP%
        pause
        exit /b 1
    )
)

set /a elapsed=0
:wait_docker
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
if !elapsed! geq 180 (
    echo   [ERROR] Docker not ready after 180s. Open Docker Desktop manually then retry.
    pause
    exit /b 1
)
echo   Waiting for Docker... !elapsed!s
ping 127.0.0.1 -n 6 >nul
set /a elapsed+=5
goto wait_docker

:docker_ready
echo   Docker ready.

REM ==== [2/7] Dify stack ====
echo.
echo [2/7] Starting Dify stack...
if not exist "%DIFY_DIR%\docker-compose.yaml" (
    echo   [ERROR] Dify folder not found: %DIFY_DIR%
    pause
    exit /b 1
)
pushd "%DIFY_DIR%"
docker compose -f docker-compose.yaml up -d
if errorlevel 1 (
    echo   [ERROR] Dify compose up failed.
    popd
    pause
    exit /b 1
)
popd

set /a elapsed=0
:wait_dify
curl -s -o nul -w "%%{http_code}" http://localhost/v1/info > "%TEMP%\bbh_dify.txt" 2>nul
set /p HTTP_CODE=<"%TEMP%\bbh_dify.txt"
del "%TEMP%\bbh_dify.txt" >nul 2>&1
if "!HTTP_CODE!"=="200" goto dify_ready
if "!HTTP_CODE!"=="401" goto dify_ready
if !elapsed! geq 180 (
    echo   [WARN] Dify not ready after 180s. HTTP: !HTTP_CODE!. Continuing...
    goto dify_ready
)
if "!HTTP_CODE!"=="502" (
    echo   Dify warming up... !elapsed!s
) else (
    echo   Waiting for Dify API... HTTP !HTTP_CODE! / !elapsed!s
)
ping 127.0.0.1 -n 6 >nul
set /a elapsed+=5
goto wait_dify

:dify_ready
echo   Dify API ready. HTTP: !HTTP_CODE!

REM ==== [3/7] Refresh nginx DNS ====
echo.
echo [3/7] Refreshing Dify nginx...
docker restart docker-nginx-1 >nul 2>&1
echo   nginx restarted.

REM ==== [4/7] Bridge ====
echo.
echo [4/7] Starting Bridge...
docker image inspect hospital-bridge:dev >nul 2>&1
if errorlevel 1 (
    echo   Image not found - building on first run...
    docker compose -f docker-compose.bridge.yaml --env-file .env up -d --build
) else (
    docker compose -f docker-compose.bridge.yaml --env-file .env up -d
)
if errorlevel 1 (
    echo   [ERROR] Bridge compose up failed.
    docker compose -f docker-compose.bridge.yaml ps
    pause
    exit /b 1
)

set /a elapsed=0
:wait_bridge
curl -s -o nul -w "%%{http_code}" http://localhost:8000/ > "%TEMP%\bbh_bridge.txt" 2>nul
set /p BRIDGE_CODE=<"%TEMP%\bbh_bridge.txt"
del "%TEMP%\bbh_bridge.txt" >nul 2>&1
if "!BRIDGE_CODE!"=="200" goto bridge_ready
if !elapsed! geq 90 (
    echo   [WARN] Bridge not responding after 90s. HTTP: !BRIDGE_CODE!. Continuing...
    goto bridge_ready
)
echo   Waiting for Bridge... HTTP !BRIDGE_CODE! / !elapsed!s
ping 127.0.0.1 -n 6 >nul
set /a elapsed+=5
goto wait_bridge

:bridge_ready
echo   Bridge ready. HTTP: !BRIDGE_CODE!

REM ==== [5/7] Bot Ops DB ====
echo.
echo [5/7] Starting Bot Ops DB...
docker compose -f n8n/docker-compose.n8n.yaml --env-file n8n/.env.n8n up -d --remove-orphans bot-ops-db
if errorlevel 1 (
    echo   [ERROR] Bot Ops DB failed to start.
    pause
    exit /b 1
)

set /a elapsed=0
:wait_bot_ops_db
docker exec hospital-bot-ops-db sh -c "mysqladmin ping -h localhost -u \"$MYSQL_USER\" -p\"$MYSQL_PASSWORD\" --silent" >nul 2>&1
if not errorlevel 1 goto bot_ops_db_ready
if !elapsed! geq 120 (
    echo   [ERROR] Bot Ops DB not ready after 120s.
    docker logs hospital-bot-ops-db --tail 20
    pause
    exit /b 1
)
echo   Waiting for Bot Ops DB... !elapsed!s
ping 127.0.0.1 -n 6 >nul
set /a elapsed+=5
goto wait_bot_ops_db

:bot_ops_db_ready
echo   Bot Ops DB ready.

REM ==== [6/7] n8n ====
echo.
echo [6/7] Starting n8n...
docker compose -f n8n/docker-compose.n8n.yaml --env-file n8n/.env.n8n up -d --force-recreate --remove-orphans n8n
if errorlevel 1 (
    echo   [ERROR] n8n failed to start.
    pause
    exit /b 1
)

set /a elapsed=0
:wait_n8n
curl -s -o nul -w "%%{http_code}" http://localhost:5678/healthz > "%TEMP%\bbh_n8n.txt" 2>nul
set /p N8N_CODE=<"%TEMP%\bbh_n8n.txt"
del "%TEMP%\bbh_n8n.txt" >nul 2>&1
if "!N8N_CODE!"=="200" goto n8n_ready
if !elapsed! geq 120 (
    echo   [WARN] n8n health not confirmed after 120s. HTTP: !N8N_CODE!. Continuing...
    goto n8n_ready
)
echo   Waiting for n8n... HTTP !N8N_CODE! / !elapsed!s
ping 127.0.0.1 -n 6 >nul
set /a elapsed+=5
goto wait_n8n

:n8n_ready
echo   n8n ready. HTTP: !N8N_CODE!

REM ==== [7/7] Summary + Open UI ====
echo.
echo [7/7] Opening n8n editor...
start http://localhost:5678

echo.
echo ========================================
echo  All services started. LINE bot ready.
echo.
echo  Dify     : http://localhost/
echo  n8n      : http://localhost:5678/
echo  Bridge   : http://localhost:8000/
echo  Webhook  : https://n8n.bbh-hospital.com
echo  Tunnel   : Cloudflare (external service)
echo.
echo  Logs:
echo    docker logs hospital-bridge --tail 50 -f
echo    docker logs hospital-n8n --tail 50 -f
echo    docker logs hospital-bot-ops-db --tail 20
echo.
echo  Stop all:
echo    docker compose -f docker-compose.bridge.yaml down
echo    docker compose -f n8n\docker-compose.n8n.yaml --env-file n8n\.env.n8n down
echo    cd "%DIFY_DIR%" ^&^& docker compose down
echo ========================================
echo.

start "BBH Monitor" cmd /k "cd /d %ROOT_DIR% && python ops\monitor.py"

pause >nul
