@echo off
TITLE ORBIT-X - Startup Sequence
color 0a

echo ===================================================
echo [SYSTEM] BOOTING ORBIT-X HYBRID EDGE CONSOLE...
echo [SYSTEM] CHECKING GLOBAL ENVIRONMENT DEPENDENCIES...
echo ===================================================

IF NOT EXIST "node_modules\" (
    echo [SYSTEM] First boot detected. Installing Node dependencies...
    cmd.exe /c npm install
)

set "PY_CMD="
python -c "import sys; exit(0 if sys.version_info.major==3 else 1)" 2>nul
if %errorlevel% equ 0 set "PY_CMD=python"

if "%PY_CMD%"=="" (
    py -3 -c "import sys; exit(0 if sys.version_info.major==3 else 1)" 2>nul
    if %errorlevel% equ 0 set "PY_CMD=py -3"
)

if "%PY_CMD%"=="" (
    python3 -c "import sys; exit(0 if sys.version_info.major==3 else 1)" 2>nul
    if %errorlevel% equ 0 set "PY_CMD=python3"
)

if "%PY_CMD%"=="" (
    echo [SYSTEM] WARNING: Python 3 not detected safely. Falling back to default python...
    set "PY_CMD=python"
)

echo [SYSTEM] Ensuring AI dependencies are installed using: %PY_CMD%
%PY_CMD% -m pip install -r ai_service\requirements.txt -q --disable-pip-version-check

echo ===================================================
echo [SYSTEM] INITIALIZING UI AND AI DAEMON...
echo ===================================================

cmd.exe /c npm start

echo.
echo [SYSTEM] Application closed or crashed.
pause
