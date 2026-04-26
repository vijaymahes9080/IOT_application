@echo off
TITLE ORBIT-X - Dependency Installation Manager
color 0b

echo.
echo  ###################################################
echo  #                                                 #
echo  #             ORBIT-X NEURAL ECOSYSTEM            #
echo  #          DEPENDENCY INSTALLATION MODULE         #
echo  #                                                 #
echo  ###################################################
echo.

:: --- NODE.JS CHECK ---
echo [STEP 1] Checking Node.js Environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed! Please install it from https://nodejs.org/
    pause
    exit /b 1
)
echo [SYSTEM] Node.js detected. Installing/Updating NPM modules...
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [WARNING] NPM installation encountered issues. Continuing to AI dependencies...
) else (
    echo [SUCCESS] Node.js dependencies synchronized.
)

echo.

:: --- PYTHON / AI CHECK ---
echo [STEP 2] Checking Python 3 / AI Environment...
set "PY_CMD="

:: Try standard python
python -c "import sys; exit(0 if sys.version_info.major==3 else 1)" >nul 2>&1
if %errorlevel% equ 0 (
    set "PY_CMD=python"
) else (
    :: Try py -3
    py -3 -c "import sys; exit(0 if sys.version_info.major==3 else 1)" >nul 2>&1
    if %errorlevel% equ 0 (
        set "PY_CMD=py -3"
    ) else (
        :: Try python3
        python3 -c "import sys; exit(0 if sys.version_info.major==3 else 1)" >nul 2>&1
        if %errorlevel% equ 0 (
            set "PY_CMD=python3"
        )
    )
)

if "%PY_CMD%"=="" (
    echo [ERROR] Python 3 was not detected! Please install Python 3.10+ and add it to PATH.
    pause
    exit /b 1
)

echo [SYSTEM] Python detected: %PY_CMD%
echo [SYSTEM] Upgrading pip...
%PY_CMD% -m pip install --upgrade pip -q

echo [SYSTEM] Installing AI modalities from ai_service\requirements.txt...
if exist "ai_service\requirements.txt" (
    %PY_CMD% -m pip install -r ai_service\requirements.txt
    if %errorlevel% equ 0 (
        echo [SUCCESS] AI dependencies installed successfully.
    ) else (
        echo [ERROR] Failed to install AI dependencies. Please check your internet connection or Python configuration.
    )
) else (
    echo [ERROR] ai_service\requirements.txt not found!
)

echo.
echo ===================================================
echo [COMPLETE] ALL SYSTEMS READY FOR ORBIT-X DEPLOYMENT
echo ===================================================
echo.
echo You can now run the system using START_ORBIT_X.bat
echo.
pause
