@echo off
setlocal enabledelayedexpansion
title CAR CONTROLLER - Live Circuit & Auto-Mode Telemetry Monitor
color 0A

echo ==============================================================================
echo       CAR CONTROLLER (UNO 1) - LIVE TELEMETRY & CIRCUIT VERIFICATION
echo ==============================================================================
echo.

set "TARGET_PORT="
for /f "tokens=*" %%P in ('powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames()"') do (
    set "TARGET_PORT=%%P"
)
if "%TARGET_PORT%"=="" set "TARGET_PORT=COM7"

echo [OK] Target Serial Port: %TARGET_PORT%
echo.
node "%~dp0tools\test_car_circuit.js" %TARGET_PORT%
pause
