@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo          SentinelIoT - Quick Start
echo ==========================================

where py >nul 2>nul
if errorlevel 1 (
  echo Python launcher not found. Install Python 3.10+ and try again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js / npm not found. Install Node.js LTS and try again.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/4] Creating Python environment...
  py -3 -m venv .venv
  if errorlevel 1 goto failed
)

echo [2/4] Installing backend dependencies...
".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if errorlevel 1 goto failed

if not exist "frontend\node_modules" (
  echo [3/4] Installing dashboard dependencies...
  pushd frontend
  call npm install
  if errorlevel 1 (
    popd
    goto failed
  )
  popd
) else (
  echo [3/4] Dashboard dependencies already installed.
)

echo [4/4] Starting backend, dashboard, and Arduino bridge...
start "SentinelIoT API" /D "%~dp0" cmd /k ""%~dp0.venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"
start "SentinelIoT Dashboard" /D "%~dp0frontend" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
start "SentinelIoT Arduino" /D "%~dp0" cmd /k ""%~dp0.venv\Scripts\python.exe" network\device_agent.py --port auto"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:5173"

echo.
echo SentinelIoT is starting in your browser.
echo Keep the backend, dashboard, and Arduino windows open.
echo Connect the Uno by USB and upload arduino\sentinel.ino once if not done already.
echo The Arduino bridge auto-detects the board serial port.
echo If multiple serial devices are connected, choose the Arduino COM port manually.
echo.
echo ML inference uses the configured hosted model API.
echo Wi-Fi packet capture remains an optional advanced feature.
pause
exit /b 0

:failed
echo.
echo Setup failed. Check the error above, then run this file again.
pause
exit /b 1
