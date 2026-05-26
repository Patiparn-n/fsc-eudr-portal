@echo off
chcp 65001 > nul
cd /d "%~dp0"
title FSC and EUDR Compliance Portal Runner
echo Starting Webapp local server...
echo URL: http://localhost:8085/
rem Bypassing script block restrictions
powershell -NoProfile -Command "Get-Content run_server.ps1 -Raw | Invoke-Expression"
pause
