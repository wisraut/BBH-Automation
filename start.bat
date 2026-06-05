@echo off
setlocal enabledelayedexpansion
title Hospital Bridge - Launcher
color 0B

echo ================================
echo  Hospital Bridge - Starting
echo ================================
echo.

REM ==== [1/6] Docker Desktop ====
echo [1/6] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo   Docker not running, launching Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo   Waiting for Docker to be ready ^(up to 120s^)...
)
set /a tries=0
:wait_docker
docker info >nul 2>&1
if errorlevel 1 (
    set /a tries+=1
    if !tries! geq 24 (
        echo   [ERROR] Docker not ready after 120s. Open Docker Desktop manually.
        pause
        exit /b 1
    )
    timeout /t 5 /nobreak >nul
    goto wait_docker
)
echo   Docker is ready.

REM ==== [2/6] Dify stack ====
echo.
echo [2/6] Starting Dify stack...
set DIFY_DIR=C:\Users\wisru\dify\docker
if not exist "%DIFY_DIR%\docker-compose.yaml" (
    echo   [ERROR] Dify folder not found: %DIFY_DIR%
    pause
    exit /b 1
)
pushd "%DIFY_DIR%"
docker compose up -d >nul 2>&1
if errorlevel 1 (
    echo   [WARN] docker compose up returned error, but containers may still start...
)
popd
echo   Dify containers requested.

REM ==== [3/6] Wait Dify API healthy ====
echo.
echo [3/6] Waiting for Dify API ^(up to 120s^)...
set /a tries=0
:wait_dify
curl -s -o nul -w "%%{http_code}" http://localhost/v1/info > "%TEMP%\dify_check.txt" 2>nul
set /p HTTP_CODE=<"%TEMP%\dify_check.txt"
del "%TEMP%\dify_check.txt" >nul 2>&1
if "!HTTP_CODE!" == "401" goto dify_ready
if "!HTTP_CODE!" == "200" goto dify_ready
set /a tries+=1
if !tries! geq 24 (
    echo   [WARN] Dify not responding after 120s, but continuing...
    goto dify_done
)
timeout /t 5 /nobreak >nul
goto wait_dify
:dify_ready
echo   Dify API responding ^(HTTP !HTTP_CODE!^).
:dify_done

REM ==== [4/6] Bridge + ngrok via docker compose ====
echo.
echo [4/6] Starting Bridge + ngrok ^(docker compose^)...
set BRIDGE_DIR=%~dp0
pushd "%BRIDGE_DIR%"
docker compose -f docker-compose.bridge.yaml --env-file .env up -d >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Bridge compose up failed. Run for details:
    echo     docker compose -f docker-compose.bridge.yaml up
    popd
    pause
    exit /b 1
)
popd
echo   Bridge + ngrok containers requested.

REM ==== [5/6] Refresh Dify nginx DNS + wait bridge healthy ====
echo.
echo [5/6] Refreshing Dify nginx DNS ^(fix IP shuffle bug^)...
docker restart docker-nginx-1 >nul 2>&1
echo   Waiting for bridge ^(up to 60s^)...
set /a tries=0
:wait_bridge
curl -s -o nul -w "%%{http_code}" http://localhost:8000/ > "%TEMP%\bridge_check.txt" 2>nul
set /p HTTP_CODE=<"%TEMP%\bridge_check.txt"
del "%TEMP%\bridge_check.txt" >nul 2>&1
if "!HTTP_CODE!" == "200" goto bridge_ready
set /a tries+=1
if !tries! geq 12 (
    echo   [WARN] Bridge not responding after 60s, continuing...
    goto bridge_done
)
timeout /t 5 /nobreak >nul
goto wait_bridge
:bridge_ready
echo   Bridge responding ^(HTTP 200^).
:bridge_done

REM ==== [6/6] Monitor TUI ====
echo.
echo [6/6] Starting Monitor TUI...
start "Hospital Monitor" cmd /k "cd /d %BRIDGE_DIR% && python monitor.py"

echo.
echo ================================
echo  All services started.
echo  - Dify       http://localhost/
echo  - Bridge     http://localhost:8000/
echo  - ngrok      https://ineffectual-marian-nonnattily.ngrok-free.dev
echo  - Inspector  http://localhost:4040
echo  - Monitor    TUI window opened
echo.
echo  Logs:
echo    docker logs hospital-bridge -f
echo    docker logs hospital-ngrok -f
echo.
echo  Stop bridge ^+ ngrok:
echo    cd /d %BRIDGE_DIR%
echo    docker compose -f docker-compose.bridge.yaml down
echo  Stop Dify:
echo    cd /d %DIFY_DIR%
echo    docker compose down
echo ================================
echo.
pause >nul
