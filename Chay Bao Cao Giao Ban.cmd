@echo off
title Chay Bao Cao Giao Ban
powershell.exe -NoLogo -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0lan-trial\launch.ps1"
set "launch_exit=%errorlevel%"
if not "%launch_exit%"=="0" pause
exit /b %launch_exit%
