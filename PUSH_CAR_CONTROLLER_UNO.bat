@echo off
setlocal enabledelayedexpansion
title AGRI LINK / CAR CONTROLLER - Arduino Firmware Flasher
color 0B

echo ==============================================================================
echo              CAR CONTROLLER (UNO 1) - MASTER FIRMWARE FLASHER                 
echo       Target: firmware\CAR_CONTROLLER_UNO\CAR_CONTROLLER_UNO.ino             
echo ==============================================================================
echo.

:: 1. Locate Arduino CLI Tool
set "CLI_PATH=%~dp0tools\arduino-cli\arduino-cli.exe"
if not exist "%CLI_PATH%" (
    where arduino-cli >nul 2>&1
    if !errorlevel! equ 0 (
        set "CLI_PATH=arduino-cli"
    ) else (
        color 0C
        echo [ERROR] arduino-cli.exe was not found in tools\arduino-cli\
        echo.
        pause
        exit /b 1
    )
)
echo [OK] Using Arduino CLI: "%CLI_PATH%"
echo.

:: 2. Auto-Detect Connected Port
set "TARGET_PORT="
for /f "tokens=1,2,3" %%A in ('"%CLI_PATH%" board list') do (
    echo %%A | findstr /i "COM" >nul
    if !errorlevel! equ 0 (
        set "TARGET_PORT=%%A"
        echo       Detected active hardware serial port: !TARGET_PORT!
    )
)

if "%TARGET_PORT%"=="" (
    set "TARGET_PORT=COM7"
    echo [INFO] Defaulting to target port: COM7
) else (
    echo [OK] Target Port set to: %TARGET_PORT%
)
echo.

:: 3. Select Board Type
echo Select Target Arduino Board Model:
echo   [1] Arduino Uno (Default / Standard ATmega328P - 115200 baud)
echo   [2] Arduino Nano (Old Bootloader - 57600 baud - Most CH340 Clones)
echo   [3] Arduino Nano (New Bootloader - 115200 baud)
echo   [4] Arduino Mega 2560 (ATmega2560)
echo.
set /p BOARD_CHOICE="Enter selection [1-4, Default=1]: "

if "%BOARD_CHOICE%"=="2" (
    set "FQBN=arduino:avr:nano:cpu=atmega328old"
    set "BOARD_NAME=Arduino Nano (Old Bootloader)"
) else if "%BOARD_CHOICE%"=="3" (
    set "FQBN=arduino:avr:nano"
    set "BOARD_NAME=Arduino Nano (New Bootloader)"
) else if "%BOARD_CHOICE%"=="4" (
    set "FQBN=arduino:avr:mega"
    set "BOARD_NAME=Arduino Mega 2560"
) else (
    set "FQBN=arduino:avr:uno"
    set "BOARD_NAME=Arduino Uno"
)

echo.
echo ==============================================================================
echo  Target Board: %BOARD_NAME% (%FQBN%) on %TARGET_PORT%
echo ==============================================================================
echo.

:: 4. Important Hardware Reminder
echo [IMPORTANT HARDWARE NOTICE]:
echo - If any jumper wire is connected to Pin 0 (RX) or Pin 1 (TX), unplug it now!
echo   (Connected Bluetooth or sensor wires on Pin 0/1 block USB programming)
echo - If uploading shows "programmer is not responding", press the physical
echo   RESET button on the board once right after pressing Enter below.
echo.
pause

:: 5. Compile Sketch
echo.
echo [1/2] Compiling CAR_CONTROLLER_UNO sketch...
"%CLI_PATH%" compile --fqbn %FQBN% "%~dp0firmware\CAR_CONTROLLER_UNO"
if !errorlevel! neq 0 (
    color 0C
    echo.
    echo ==============================================================================
    echo [ERROR] Compilation failed! Review the syntax or preprocessor errors above.
    echo ==============================================================================
    echo.
    pause
    exit /b 1
)
color 0A
echo [OK] Compilation Succeeded!
echo.

:: 6. Flash Firmware to Board
color 0B
echo [2/2] Flashing binary to %BOARD_NAME% on %TARGET_PORT%...
echo.
"%CLI_PATH%" upload -p %TARGET_PORT% --fqbn %FQBN% "%~dp0firmware\CAR_CONTROLLER_UNO"
if !errorlevel! neq 0 (
    color 0C
    echo.
    echo ==============================================================================
    echo [ERROR] Upload failed on %TARGET_PORT%!
    echo.
    echo Troubleshooting Steps:
    echo 1. Disconnect any jumper wires on PIN 0 (RX) and PIN 1 (TX).
    echo 2. Try choosing Option 2 (Nano Old Bootloader) if your board has a CH340 chip.
    echo 3. Press and release the physical RESET button on the board when uploading starts.
    echo 4. Ensure no Serial Monitor (Arduino IDE, Putty, or terminal) is open.
    echo ==============================================================================
    echo.
    pause
    exit /b 1
)

color 0A
echo.
echo ==============================================================================
echo  SUCCESS: Car Controller Firmware successfully uploaded to %TARGET_PORT%!
echo ==============================================================================
echo.
pause
