@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=C:\Users\wisru\line-dify-bridge"
set "DIFY_DIR=C:\Users\wisru\dify\docker"
set "DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"

cd /d "%ROOT_DIR%"

echo ================================
echo BBH n8n startup
echo ================================

REM ==== [1/4] Docker Desktop ====
echo.
echo [1/4] Checking Docker Desktop...
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

REM ==== [2/4] Dify stack ====
echo.
echo [2/4] Starting Dify stack...
if not exist "%DIFY_DIR%\docker-compose.yaml" (
    echo   [ERROR] Dify compose file not found: %DIFY_DIR%\docker-compose.yaml
    exit /b 1
)

pushd "%DIFY_DIR%"
docker compose -f docker-compose.yaml up -d
if errorlevel 1 (
    echo   [ERROR] Dify compose up failed.
    popd
    exit /b 1
)
popd

set /a elapsed=0
:wait_dify
curl -s -o nul -w "%%{http_code}" http://localhost/v1/info > "%TEMP%\dify_n8n_check.txt" 2>nul
set /p HTTP_CODE=<"%TEMP%\dify_n8n_check.txt"
del "%TEMP%\dify_n8n_check.txt" >nul 2>&1

if "!HTTP_CODE!"=="200" goto dify_ready
if "!HTTP_CODE!"=="401" goto dify_ready
if !elapsed! geq 120 (
    echo   [ERROR] Dify API did not become ready within 120 seconds. Last HTTP: !HTTP_CODE!
    exit /b 1
)
echo   Waiting for Dify API... HTTP !HTTP_CODE!
ping 127.0.0.1 -n 6 >nul
set /a elapsed+=5
goto wait_dify

:dify_ready
echo   Dify API is ready. HTTP !HTTP_CODE!

REM ==== [3/5] Bridge ====
echo.
echo [3/5] Starting Bridge...
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
