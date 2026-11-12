@echo off
setlocal
cd /d "%~dp0"
set "PYTHON=integracao\.runtime\python\Scripts\python.exe"
if not exist "%PYTHON%" (
  echo Execute Preparar-Demonstracao.ps1 primeiro.
  pause
  exit /b 1
)
if "%~1"=="" (
  "%PYTHON%" -B integracao\demo_server.py --open
) else (
  "%PYTHON%" -B integracao\demo_server.py --open --source "%~1"
)
if errorlevel 1 pause
