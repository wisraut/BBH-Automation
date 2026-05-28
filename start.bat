@echo off
title Hospital Bridge - Launcher
echo ================================
echo  Hospital Bridge - Starting...
echo ================================

echo [1/3] Waiting for Docker to be ready...
:wait_docker
docker info >nul 2>&1
if errorlevel 1 (
    echo Docker not ready yet, retrying...
    timeout /t 5 /nobreak >nul
    goto wait_docker
)
echo Docker is ready!

echo [2/3] Starting Ollama...
start "Ollama" "C:\Users\wisru\AppData\Local\Programs\Ollama\ollama.exe" serve
timeout /t 5 /nobreak >nul

echo [3/3] Starting LINE-Dify Bridge...
start "LINE-Dify Bridge" cmd /k "cd /d C:\Users\wisru\line-dify-bridge && python main.py"

echo ================================
echo  All services started!
echo  Close this window is safe.
echo ================================
timeout /t 3 /nobreak >nul
exit
