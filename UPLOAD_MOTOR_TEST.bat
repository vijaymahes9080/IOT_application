@echo off
setlocal enabledelayedexpansion
title MOTOR TEST - Arduino Uno Flasher
color 0B

echo ==============================================================================
echo                 MOTOR TEST - ARDUINO UNO FIRMWARE FLASHER                    
echo       Target: firmware\MOTOR_TEST_UNO\MOTOR_TEST_UNO.ino                     
echo       Port:   COM7 (CH340 Serial)                                            
echo ==============================================================================
echo.

set "CLI_PATH=%~dp0tools\arduino-cli\arduino-cli.exe"
if not exist "%CLI_PATH%" (
    where arduino-cli >nul 2>&1
    if !errorlevel! equ 0 (
        set "CLI_PATH=arduino-cli"
    ) else (
        color 0C
        echo [ERROR] arduino-cli not found!
        pause
        exit /b 1
    )
)

:: Auto-detect Port via Windows Serial APIs
set "TARGET_PORT="
for /f "tokens=*" %%P in ('powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames()"') do (
    set "TARGET_PORT=%%P"
)
if "%TARGET_PORT%"=="" set "TARGET_PORT=COM6"
echo [OK] Detected Active Serial Port: %TARGET_PORT%
set /p USER_PORT="Use port %TARGET_PORT% (press Enter) or type port name (e.g. COM6): "
if not "%USER_PORT%"=="" set "TARGET_PORT=%USER_PORT%"
echo Target set to: %TARGET_PORT%
echo.

echo Select your Board Model:
echo   [1] Arduino Uno (Standard - 115200 baud) [Default]
echo   [2] Arduino Nano (Old Bootloader - 57600 baud - Common for CH340)
echo   [3] Arduino Nano (New Bootloader - 115200 baud)
echo.
set /p BOARD_OPT="Enter choice [1-3, default 1]: "

if "%BOARD_OPT%"=="2" (
    set "FQBN=arduino:avr:nano:cpu=atmega328old"
    set "BNAME=Arduino Nano (Old Bootloader)"
) else if "%BOARD_OPT%"=="3" (
    set "FQBN=arduino:avr:nano"
    set "BNAME=Arduino Nano (New Bootloader)"
) else (
    set "FQBN=arduino:avr:uno"
    set "BNAME=Arduino Uno"
)

echo.
echo ==============================================================================
echo  1. COMPILING MOTOR TEST CODE FOR %BNAME%...
echo ==============================================================================
echo.
"%CLI_PATH%" compile --fqbn %FQBN% "%~dp0firmware\MOTOR_TEST_UNO"
if !errorlevel! neq 0 (
    color 0C
    echo [ERROR] Compilation failed!
    pause
    exit /b 1
)
color 0A
echo [OK] Compilation Succeeded!
echo.

color 0E
echo ==============================================================================
echo  CRITICAL HARDWARE STEPS BEFORE PRESSING ENTER:
echo  1. If any wire is connected to Pin 0 (RX) or Pin 1 (TX), UNPLUG IT NOW!
echo     (Connected wires on RX/TX block computer programming).
echo  2. As soon as you press Enter, look at the Arduino board.
echo     If flashing doesn't start immediately, PRESS THE RESET BUTTON ONCE!
echo ==============================================================================
echo.
pause

color 0B
echo.
echo [2/2] Uploading binary to %TARGET_PORT%...
echo.
"%CLI_PATH%" upload -p %TARGET_PORT% --fqbn %FQBN% "%~dp0firmware\MOTOR_TEST_UNO"
if !errorlevel! neq 0 (
    color 0C
    echo.
    echo ==============================================================================
    echo [ERROR] Upload failed on %TARGET_PORT%!
    echo - Check that Pin 0 (RX) is completely disconnected.
    echo - If your board is an Arduino Nano, try Option 2 (Old Bootloader).
    echo - Press and release the physical RESET button on the Arduino right as flashing starts.
    echo ==============================================================================
    echo.
    pause
    exit /b 1
)

color 0A
echo.
echo ==============================================================================
echo  SUCCESS: Motor test code successfully uploaded to your Arduino Uno on %TARGET_PORT%!
echo ==============================================================================
echo.
pause
