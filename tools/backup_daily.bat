@echo off
REM Daily backup wrapper for Windows Task Scheduler.
REM
REM Run by Windows Task Scheduler at e.g. 02:00 daily:
REM   schtasks /Create /SC DAILY /TN "BBH Daily Backup" /TR "C:\Users\wisru\line-dify-bridge\tools\backup_daily.bat" /ST 02:00 /F
REM
REM Output:
REM   - C:\Users\wisru\backups\bbh\bbh-backup-YYYY-MM-DD-HHMM.tar.gz
REM   - C:\Users\wisru\backups\bbh\backup_daily.log
REM
REM Rotation: keeps the 14 newest files in BACKUP_DIR.

setlocal

set "REPO=C:\Users\wisru\line-dify-bridge"
set "BACKUP_DIR=C:\Users\wisru\backups\bbh"
set "KEEP=14"

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

echo. >> "%BACKUP_DIR%\backup_daily.log"
echo === %date% %time% === >> "%BACKUP_DIR%\backup_daily.log"

REM Run backup.py — writes a timestamped tar.gz into BACKUP_DIR
cd /d "%REPO%"
python tools\backup.py --out "%BACKUP_DIR%" >> "%BACKUP_DIR%\backup_daily.log" 2>&1
if errorlevel 1 (
    echo BACKUP FAILED with exit %errorlevel% >> "%BACKUP_DIR%\backup_daily.log"
    exit /b %errorlevel%
)

REM Rotation: keep the KEEP newest backup files, delete the rest.
powershell -NoProfile -Command "Get-ChildItem '%BACKUP_DIR%\bbh-backup-*.tar.gz' | Sort-Object LastWriteTime -Descending | Select-Object -Skip %KEEP% | Remove-Item -Force"

echo OK >> "%BACKUP_DIR%\backup_daily.log"
endlocal
