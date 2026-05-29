@echo off
title Hospital Bridge - Launcher
echo ================================
echo  Hospital Bridge - Starting...
echo ================================

echo [1/4] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo Docker not running, launching Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo Waiting for Docker to be ready...
)
:wait_docker
docker info >nul 2>&1
if errorlevel 1 (
    echo Docker not ready yet, retrying in 5s...
    timeout /t 5 /nobreak >nul
    goto wait_docker
)
echo Docker is ready!

echo [2/4] Starting Ollama...
start "Ollama" "C:\Users\wisru\AppData\Local\Programs\Ollama\ollama.exe" serve
timeout /t 5 /nobreak >nul

echo [3/4] Starting LINE-Dify Bridge...
start "LINE-Dify Bridge" cmd /k "cd /d C:\Users\wisru\line-dify-bridge && python main.py"

echo Waiting for Bridge to start...
timeout /t 5 /nobreak >nul

echo [4/4] Starting Monitor...
start "Hospital Monitor" cmd /k "cd /d C:\Users\wisru\line-dify-bridge && python monitor.py"

echo ================================
echo  All services started!
echo  Press any key to close launcher
echo ================================
pause
