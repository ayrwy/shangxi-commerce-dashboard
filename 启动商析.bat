@echo off
chcp 65001 >nul
set "PROJECT_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%scripts\start-local.ps1"
pause
