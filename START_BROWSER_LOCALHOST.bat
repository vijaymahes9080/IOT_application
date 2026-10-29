@echo off
TITLE AGRI LINK - Localhost Browser Testing Sequence
color 0b

echo ===================================================
echo [AGRI LINK] STARTING LOCALHOST BROWSER ENVIRONMENT
echo ===================================================

:: Detect Python for AI daemon
set "PY_CMD="
python -c "import sys; exit(0 if sys.version_info.major==3 else 1)" 2>nul
if %errorlevel% equ 0 set "PY_CMD=python"
if "%PY_CMD%"=="" set "PY_CMD=py -3"

:: Start AI Service in background if not already listening on port 5005
netstat -ano | findstr :5005 >nul
if %errorlevel% neq 0 (
    echo [AI SERVICE] Launching Python AI daemon on port 5005...
    start "AGRI LINK AI Daemon" /min %PY_CMD% ai_service\app.py
    timeout /t 2 /nobreak >nul
) else (
    echo [AI SERVICE] Port 5005 is already active.
)

:: Open default browser to localhost:8080 after a brief delay
echo [BROWSER] Launching default web browser to http://localhost:8080/ ...
start "" "http://localhost:8080/"

:: Start Local Web Server
echo [SERVER] Starting Node.js HTTP server on http://localhost:8080/ ...
node server.js

pause

