@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Resolve to repo root from this script's location (n8n/ → ..)
set "ROOT_DIR=%~dp0.."
set "DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"

cd /d "%ROOT_DIR%"

echo ================================
echo BBH n8n startup
echo ================================

REM ==== [1/5] Docker Desktop ====
echo.
echo [1/5] Checking Docker Desktop...
docker info >nul 2>&1
if errorlevel 1 (
    echo   Docker is not ready. Starting Docker Desktop...
    if exist "%DOCKER_DESKTOP%" (
        start "" "%DOCKER_DESKTOP%"
    ) else (
        echo   [ERROR] Docker Desktop not found: %DOCKER_DESKTOP%
        exit /b 1
    )
)

set /a elapsed=0
:wait_docker
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
if !elapsed! geq 120 (
    echo   [ERROR] Docker did not become ready within 120 seconds.
    exit /b 1
)
echo   Waiting for Docker... !elapsed!s
ping 127.0.0.1 -n 6 >nul
set /a elapsed+=5
goto wait_docker

:docker_ready
echo   Docker is ready.

REM ==== [2/5] Bridge ====
echo.
echo [2/5] Starting Bridge...
docker compose -f docker-compose.bridge.yaml up -d --build
if errorlevel 1 (
    echo   [ERROR] Bridge compose up failed.
    exit /b 1
)

set /a elapsed=0
:wait_bridge
curl -s -o nul -w "%%{http_code}" http://localhost:8000/health > "%TEMP%\bridge_check.txt" 2>nul
set /p BRIDGE_CODE=<"%TEMP%\bridge_check.txt"
del "%TEMP%\bridge_check.txt" >nul 2>&1
if "!BRIDGE_CODE!"=="200" goto bridge_ready
if !elapsed! geq 60 (
    echo   [WARN] Bridge did not respond within 60 seconds. Last HTTP: !BRIDGE_CODE!. Continuing...
    goto bridge_ready
)
echo   Waiting for Bridge... HTTP !BRIDGE_CODE!
ping 127.0.0.1 -n 6 >nul
set /a elapsed+=5
goto wait_bridge

:bridge_ready
echo   Bridge is ready. HTTP !BRIDGE_CODE!

REM ==== [3/5] Bot Ops DB ====
echo.
echo [3/5] Starting Bot Ops DB...
docker compose -f n8n/docker-compose.n8n.yaml --env-file n8n/.env.n8n up -d bot-ops-db
if errorlevel 1 (
    echo   [ERROR] Bot Ops DB compose up failed.
    exit /b 1
)

set /a elapsed=0
:wait_bot_ops_db
docker exec hospital-bot-ops-db sh -c "mysqladmin ping -h localhost -u \"$MYSQL_USER\" -p\"$MYSQL_PASSWORD\" --silent" >nul 2>&1
if not errorlevel 1 goto bot_ops_db_ready
if !elapsed! geq 120 (
    echo   [ERROR] Bot Ops DB did not become ready within 120 seconds.
    exit /b 1
)
echo   Waiting for Bot Ops DB... !elapsed!s
ping 127.0.0.1 -n 6 >nul
set /a elapsed+=5
goto wait_bot_ops_db

:bot_ops_db_ready
echo   Bot Ops DB is ready.

REM ==== [4/5] n8n ====
echo.
echo [4/5] Starting n8n...
docker compose -f n8n/docker-compose.n8n.yaml --env-file n8n/.env.n8n up -d --force-recreate n8n
if errorlevel 1 (
    echo   [ERROR] n8n compose up failed.
    exit /b 1
)

ping 127.0.0.1 -n 16 >nul
docker logs hospital-n8n --tail 5
docker logs hospital-n8n --tail 50 2>&1 | findstr /C:"Activated workflow" >nul
if errorlevel 1 (
    echo   [ERROR] n8n workflow was not activated.
    exit /b 1
)
echo   n8n workflow activated.

REM ==== [5/5] Browser ====
echo.
echo [5/5] Opening n8n editor...
start http://localhost:5678
echo n8n editor: http://localhost:5678
echo n8n admin: admin / GWqSSiYugNgbvvFcJPUBmmKJ

echo.
echo Done.
exit /b 0
