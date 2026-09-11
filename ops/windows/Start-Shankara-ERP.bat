@echo off
title Start Shankara ERP
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting administrator access...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-hosting.ps1"

echo.
pause
