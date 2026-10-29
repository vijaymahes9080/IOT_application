@echo off
setlocal enabledelayedexpansion
title CH340 UNO - RESET-SYNC FLASHER
color 0E

echo ==============================================================================
echo        CH340 UNO AUTO-SYNC FLASHER - CAR CONTROLLER FIRMWARE
echo ==============================================================================
echo Target: firmware\CAR_CONTROLLER_UNO
echo Port:   COM7 (CH340 Serial)
echo.

set "TARGET_PORT="
for /f "tokens=*" %%P in ('powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames()"') do (
    set "TARGET_PORT=%%P"
)
if "%TARGET_PORT%"=="" set "TARGET_PORT=COM7"
echo [OK] Target Port: %TARGET_PORT%
echo.

echo ------------------------------------------------------------------------------
echo   INSTRUCTIONS FOR CH340 CLONE BOARDS:
echo   1. Press and HOLD DOWN the red RESET button on your Arduino board now.
echo   2. KEEP HOLDING IT DOWN.
echo   3. Press any key below to begin the 3-second release countdown.
echo ------------------------------------------------------------------------------
echo.
pause

echo.
color 0E
echo [3] Hold the button...
timeout /t 1 /nobreak >nul
echo [2] Still holding...
timeout /t 1 /nobreak >nul
echo [1] Get ready to let go...
timeout /t 1 /nobreak >nul
echo.
color 0A
echo ******************************************************************************
echo  >>> RELEASE THE RESET BUTTON RIGHT NOW! <<<
echo ******************************************************************************
echo.

"%~dp0tools\arduino-cli\arduino-cli.exe" upload -p %TARGET_PORT% --fqbn arduino:avr:uno "%~dp0firmware\CAR_CONTROLLER_UNO" -v

if !errorlevel! equ 0 (
    color 0A
    echo.
    echo ==============================================================================
    echo  SUCCESS! CAR CONTROLLER FIRMWARE FLASHED SUCCESSFULLY!
    echo ==============================================================================
    echo.
    echo Launching Live Circuit Telemetry Monitor in 3 seconds...
    timeout /t 3 /nobreak >nul
    start "" cmd /k "%~dp0RUN_CIRCUIT_TEST_MONITOR.bat"
    exit /b 0
) else (
    color 0C
    echo.
    echo ==============================================================================
    echo  Sync attempt missed!
    echo  Tip: Try releasing the button half a second earlier or later.
    echo ==============================================================================
    echo.
    pause
    exit /b 1
)
