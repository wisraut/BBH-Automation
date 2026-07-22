@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM BBH Hospital System Launcher
REM Starts: Docker -> Bot Ops DB -> Bridge -> n8n -> Frontend
REM ============================================================

set "ROOT_DIR=%~dp0"
set "DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set "FRONTEND_DIR=%ROOT_DIR%frontend"

title BBH System Launcher
color 0B
cd /d "%ROOT_DIR%"

echo ============================================================
echo  BBH Hospital System Launcher
echo ============================================================
echo.

REM ============================================================
REM [1/5] Docker Desktop
REM ============================================================
echo [1/5] Checking Docker...
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

REM ------------------------------------------------------------
REM Ensure the shared docker network exists. It was originally created by the
REM (now-removed) Dify stack as "docker_default"; the compose files below attach
REM to it as external, so create it if missing — otherwise compose up fails with
REM "network docker_default not found" after the Dify stack is fully removed.
REM ------------------------------------------------------------
docker network inspect docker_default >nul 2>&1 || (
    echo   Shared network missing - creating docker_default...
    docker network create docker_default >nul 2>&1
)

REM ============================================================
REM [2/5] Bot Ops MySQL
REM ============================================================
echo.
echo [2/5] Starting Bot Ops MySQL...
docker compose -f n8n\docker-compose.n8n.yaml --env-file n8n\.env.n8n up -d --remove-orphans bot-ops-db
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

REM ============================================================
REM [3/5] Bridge (FastAPI backend) + Embedder (RAG BGE-M3)
REM ============================================================
echo.
echo [3/5] Starting Bridge + Embedder...
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

REM ------------------------------------------------------------
REM Embedder readiness — the RAG lane can't embed until BGE-M3 finishes loading.
REM It starts as part of the bridge compose above; wait for its /health.
REM ------------------------------------------------------------
echo   Waiting for Embedder (RAG model load)...
set /a elapsed=0
:wait_embedder
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:8085/health > "%TEMP%\bbh_embed.txt" 2>nul
set /p EMBED_CODE=<"%TEMP%\bbh_embed.txt"
del "%TEMP%\bbh_embed.txt" >nul 2>&1
if "!EMBED_CODE!"=="200" goto embedder_ready
if !elapsed! geq 150 (
    echo   [WARN] Embedder not ready after 150s. HTTP: !EMBED_CODE!. RAG/AI unavailable until it loads.
    goto embedder_ready
)
echo   Waiting for Embedder... HTTP !EMBED_CODE! / !elapsed!s
ping 127.0.0.1 -n 6 >nul
set /a elapsed+=5
goto wait_embedder

:embedder_ready
echo   Embedder ready. HTTP: !EMBED_CODE!

REM ============================================================
REM [4/5] n8n (LINE Main Bot workflow runner)
REM ============================================================
echo.
echo [4/5] Starting n8n...
REM Safety net: reset volume ownership so n8n (UID 1000) can write to its SQLite.
REM Prevents SQLITE_READONLY crash if someone touched the volume as root
REM (e.g. via "docker cp ... hospital-n8n:/home/node/.n8n/...").
docker run --rm -v n8n_hospital_n8n_data:/data alpine chown -R 1000:1000 /data >nul 2>&1
docker compose -f n8n\docker-compose.n8n.yaml --env-file n8n\.env.n8n up -d --force-recreate --remove-orphans n8n
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

REM ============================================================
REM [5/5] Frontend dev server (Vite)
REM ============================================================
echo.
echo [5/5] Starting Frontend dev server...
if not exist "%FRONTEND_DIR%\package.json" (
    echo   [WARN] Frontend folder not found: %FRONTEND_DIR%. Skipping.
    goto skip_frontend
)
if not exist "%FRONTEND_DIR%\node_modules" (
    echo   node_modules missing - running npm install first...
    pushd "%FRONTEND_DIR%"
    call npm install
    popd
)
REM Launch Vite in a new terminal window
start "BBH Frontend (Vite)" cmd /k "cd /d %FRONTEND_DIR% && npm run dev"

set /a elapsed=0
:wait_frontend
curl -s -o nul -w "%%{http_code}" http://localhost:5173/ > "%TEMP%\bbh_fe.txt" 2>nul
set /p FE_CODE=<"%TEMP%\bbh_fe.txt"
del "%TEMP%\bbh_fe.txt" >nul 2>&1
if "!FE_CODE!"=="200" goto frontend_ready
if !elapsed! geq 60 (
    echo   [WARN] Frontend not responding after 60s. HTTP: !FE_CODE!. Continuing...
    goto frontend_ready
)
echo   Waiting for Vite dev server... HTTP !FE_CODE! / !elapsed!s
ping 127.0.0.1 -n 4 >nul
set /a elapsed+=3
goto wait_frontend

:frontend_ready
echo   Frontend ready. HTTP: !FE_CODE!

:skip_frontend

REM ============================================================
REM Summary + open browser
REM ============================================================
echo.
echo ============================================================
echo  All services up. Opening dashboard...
echo.
echo  Frontend : http://localhost:5173/
echo  Bridge   : http://localhost:8000/
echo  n8n      : http://localhost:5678/
echo  Webhook  : https://bridge.bbh-hospital.com/webhook
echo  Tunnel   : Cloudflare (external Windows service)
echo.
echo  Logs:
echo    docker logs hospital-bridge --tail 50 -f
echo    docker logs hospital-n8n --tail 50 -f
echo    docker logs hospital-bot-ops-db --tail 20
echo.
echo  Stop all:
echo    docker compose -f docker-compose.bridge.yaml down
echo    docker compose -f n8n\docker-compose.n8n.yaml --env-file n8n\.env.n8n down
echo    (close the "BBH Frontend (Vite)" window to stop Vite)
echo ============================================================
echo.

start http://localhost:5173/

exit
