@echo off
setlocal enabledelayedexpansion
title AGRI LINK - ESP32 Firmware Flasher (Pro-Level)
color 0B

echo ==============================================================================
echo                 AGRI LINK - ESP32 MASTER FIRMWARE FLASHER                    
echo       Target: firmware\AGRI_LINK_FIRMWARE\AGRI_LINK_FIRMWARE.ino             
echo ==============================================================================
echo.

:: 1. Locate Arduino CLI Tool
set "CLI_PATH=%~dp0tools\arduino-cli\arduino-cli.exe"
if not exist "%CLI_PATH%" (
    set "CLI_PATH=%~dp0scratch\tools\arduino-cli\arduino-cli.exe"
)
if not exist "%CLI_PATH%" (
    where arduino-cli >nul 2>&1
    if !errorlevel! equ 0 (
        set "CLI_PATH=arduino-cli"
    ) else (
        color 0C
        echo [ERROR] arduino-cli.exe was not found!
        echo Please ensure tools\arduino-cli\arduino-cli.exe is present.
        echo.
        if "%~1"=="" pause
        exit /b 1
    )
)
echo [OK] Using Arduino CLI: "%CLI_PATH%"
echo.

:: 2. Close Locking Processes (Prevent COM Port Access Denied)
echo [1/4] Checking for processes locking COM ports...
taskkill /F /IM electron.exe >nul 2>&1
if !errorlevel! equ 0 (
    echo       Closed running Electron application.
) else (
    echo       No conflicting Electron process running.
)
ping 127.0.0.1 -n 2 >nul

:: 3. Detect Connected Board and COM Port
echo.
echo [2/4] Detecting connected ESP32 board...
set "TARGET_PORT=COM4"

for /f "tokens=1,2,3" %%A in ('"%CLI_PATH%" board list') do (
    echo %%A | findstr /i "COM" >nul
    if !errorlevel! equ 0 (
        set "DETECTED_PORT=%%A"
        echo       Found connected serial port: !DETECTED_PORT!
        set "TARGET_PORT=!DETECTED_PORT!"
    )
)
echo [OK] Target Port set to: %TARGET_PORT%
echo.

:: 4. Compile Target Firmware
echo [3/4] Compiling AGRI LINK Firmware...
echo       File: firmware\AGRI_LINK_FIRMWARE\AGRI_LINK_FIRMWARE.ino
echo       FQBN: esp32:esp32:esp32
echo.
"%CLI_PATH%" compile --fqbn esp32:esp32:esp32 "%~dp0firmware\AGRI_LINK_FIRMWARE"
if !errorlevel! neq 0 (
    color 0C
    echo.
    echo ==============================================================================
    echo [ERROR] Compilation failed! Review preprocessor or syntax errors above.
    echo ==============================================================================
    echo.
    if "%~1"=="" pause
    exit /b 1
)
color 0A
echo.
echo [OK] Compilation Succeeded!
echo.

:: 5. Flash to Hardware Board
echo [4/4] Flashing binary to ESP32 on %TARGET_PORT% at 921600 baud...
"%CLI_PATH%" upload -p %TARGET_PORT% --fqbn esp32:esp32:esp32 "%~dp0firmware\AGRI_LINK_FIRMWARE"
if !errorlevel! neq 0 (
    color 0C
    echo.
    echo ==============================================================================
    echo [ERROR] Upload failed on %TARGET_PORT%!
    echo - Check USB cable connection.
    echo - Ensure no other application such as Serial Monitor or Putty is using %TARGET_PORT%.
    echo - Press and hold BOOT button on ESP32 if connecting times out.
    echo ==============================================================================
    echo.
    if "%~1"=="" pause
    exit /b 1
)

color 0A
echo.
echo ==============================================================================
echo  SUCCESS: AGRI LINK Master Firmware successfully uploaded to %TARGET_PORT%!
echo ==============================================================================
echo.
echo The ESP32 is now running with:
echo  - 25 FPS Master OLED Sliding Carousel with Cubic Ease-Out
echo  - Real-Time VPD, Dew Point and Biosphere Vitality Calculations
echo  - Multi-Channel 16-Sample Dynamic History Sparklines
echo  - Live Sonar Radiating Radar and VL53L0X Target Lock Animations
echo  - Non-blocking 500ms JSON Telemetry and Two-Way Acoustic Command Bridge
echo.

if "%~1"=="--auto" goto auto_launch
if "%~1"=="--no-launch" goto finish

set /p LAUNCH_APP="Would you like to start the desktop app now? [Y/N, default Y]: "
if /i "%LAUNCH_APP%"=="N" goto finish

:auto_launch
echo Launching Desktop Application...
start "" node "%~dp0launch.js"
goto finish

:finish
echo Flashing operation complete.
if "%~1"=="" pause
