@echo off
title Bailey Design Trials
cd /d "%~dp0"
set "PY="
set "PYARG="
for %%P in (
  "%USERPROFILE%\anaconda3\python.exe"
  "%LOCALAPPDATA%\anaconda3\python.exe"
  "%ProgramData%\anaconda3\python.exe"
  "%ProgramData%\Anaconda3\python.exe"
  "%USERPROFILE%\miniconda3\python.exe"
  "%LOCALAPPDATA%\miniconda3\python.exe"
  "%ProgramData%\miniconda3\python.exe"
) do (
  if not defined PY if exist %%P set "PY=%%~P"
)
if not defined PY (
  where py >nul 2>nul && set "PY=py" && set "PYARG=-3"
)
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo Python was not found. Install Python 3.8 or newer, or edit start.bat to point to it.
  pause
  exit /b 1
)
echo Starting with %PY% %PYARG%
"%PY%" %PYARG% server.py
if errorlevel 1 pause
