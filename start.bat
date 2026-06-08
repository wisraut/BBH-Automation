@echo off
setlocal enabledelayedexpansion
title Hospital Bridge - Launcher
color 0B

set "BRIDGE_DIR=%~dp0"
set "DIFY_DIR=C:\Users\wisru\dify\docker"
set "NGROK_URL="

if exist "%BRIDGE_DIR%.env" (
    for /f "tokens=1,* delims==" %%A in ('findstr /b /c:"NGROK_PUBLIC_URL=" "%BRIDGE_DIR%.env"') do set "NGROK_URL=%%B"
)
if "%NGROK_URL%"=="" set "NGROK_URL=(not configured)"

echo ================================
echo  Hospital Bridge - Starting
echo ================================
echo.

REM ==== [1/6] Docker Desktop ====
echo [1/6] Checking Docker...
where docker >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Docker CLI not found. Install Docker Desktop first.
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo   Docker is not running. Launching Docker Desktop...
    if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
        start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    ) else (
        echo   [ERROR] Docker Desktop executable not found.
        pause
        exit /b 1
    )
)

echo   Waiting for Docker to be ready (up to 180s)...
set /a tries=0
:wait_docker
docker info >nul 2>&1
if errorlevel 1 (
    set /a tries+=1
    if !tries! geq 36 (
        echo   [ERROR] Docker not ready after 180s.
        echo   Try opening Docker Desktop manually, then run start.bat again.
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
if not exist "%DIFY_DIR%\docker-compose.yaml" (
    echo   [ERROR] Dify folder not found: %DIFY_DIR%
    pause
    exit /b 1
)

pushd "%DIFY_DIR%"
docker compose up -d
if errorlevel 1 (
    echo   [ERROR] Dify compose up failed.
    echo   Run manually:
    echo     cd /d "%DIFY_DIR%"
    echo     docker compose up -d
    popd
    pause
    exit /b 1
)
popd
echo   Dify containers requested.

REM ==== [3/6] Wait Dify API ====
echo.
echo [3/6] Waiting for Dify API (up to 180s)...
set /a tries=0
:wait_dify
curl -s -o nul -w "%%{http_code}" http://localhost/v1/info > "%TEMP%\dify_check.txt" 2>nul
set /p HTTP_CODE=<"%TEMP%\dify_check.txt"
del "%TEMP%\dify_check.txt" >nul 2>&1

if "!HTTP_CODE!"=="200" goto dify_ready
if "!HTTP_CODE!"=="401" goto dify_ready

set /a tries+=1
if !tries! geq 36 (
    echo   [WARN] Dify did not become ready after 180s. Last HTTP: !HTTP_CODE!
    echo   Continuing so the bridge can still start and expose diagnostics.
    goto dify_done
)

if "!HTTP_CODE!"=="502" (
    echo   Dify nginx returned 502; waiting for api/worker startup...
) else (
    echo   Dify not ready yet. HTTP: !HTTP_CODE!
)
timeout /t 5 /nobreak >nul
goto wait_dify

:dify_ready
echo   Dify API responding (HTTP !HTTP_CODE!).
:dify_done

REM ==== [4/6] Bridge + ngrok ====
echo.
echo [4/6] Starting Bridge + ngrok (docker compose --build)...
pushd "%BRIDGE_DIR%"
docker compose -f docker-compose.bridge.yaml --env-file .env config >nul
if errorlevel 1 (
    echo   [ERROR] Bridge compose config is invalid.
    echo   Run manually:
    echo     docker compose -f docker-compose.bridge.yaml --env-file .env config
    popd
    pause
    exit /b 1
)

docker compose -f docker-compose.bridge.yaml --env-file .env up --build -d
if errorlevel 1 (
    echo   [ERROR] Bridge compose up failed.
    echo.
    docker compose -f docker-compose.bridge.yaml ps
    echo.
    echo   Logs:
    echo     docker logs hospital-bridge -f
    echo     docker logs hospital-ngrok -f
    popd
    pause
    exit /b 1
)
popd
echo   Bridge + ngrok containers requested.

REM ==== [5/6] Refresh nginx DNS + wait bridge ====
echo.
echo [5/6] Refreshing Dify nginx DNS and waiting for bridge...
docker restart docker-nginx-1 >nul 2>&1

set /a tries=0
:wait_bridge
curl -s -o nul -w "%%{http_code}" http://localhost:8000/ > "%TEMP%\bridge_check.txt" 2>nul
set /p HTTP_CODE=<"%TEMP%\bridge_check.txt"
del "%TEMP%\bridge_check.txt" >nul 2>&1

if "!HTTP_CODE!"=="200" goto :bridge_ready

set /a tries+=1
if !tries! geq 18 (
    echo   [ERROR] Bridge not healthy after 90s. Last HTTP: !HTTP_CODE!
    echo.
    pushd "%BRIDGE_DIR%"
    docker compose -f docker-compose.bridge.yaml ps
    popd
    echo.
    echo   Recent hospital-bridge logs:
    docker logs hospital-bridge --tail 80
    echo.
    echo   Recent hospital-ngrok logs:
    docker logs hospital-ngrok --tail 40
    pause
    exit /b 1
)

echo   Bridge not ready yet. HTTP: !HTTP_CODE!
timeout /t 5 /nobreak >nul
goto wait_bridge

:bridge_ready
echo   Bridge responding (HTTP 200).

REM ==== [6/6] Monitor TUI ====
echo.
echo [6/6] Starting Monitor TUI...
start "Hospital Monitor" cmd /k "cd /d %BRIDGE_DIR% && python ops\monitor.py"

echo.
echo ================================
echo  All services started.
echo  - Dify       http://localhost/
echo  - Bridge     http://localhost:8000/
echo  - ngrok      %NGROK_URL%
echo  - Inspector  http://localhost:4040
echo  - Monitor    TUI window opened
echo.
echo  Logs:
echo    docker logs hospital-bridge -f
echo    docker logs hospital-ngrok -f
echo.
echo  Stop bridge + ngrok:
echo    cd /d "%BRIDGE_DIR%"
echo    docker compose -f docker-compose.bridge.yaml down
echo  Stop Dify:
echo    cd /d "%DIFY_DIR%"
echo    docker compose down
echo ================================
echo.
pause >nul
