@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo     SentinelIoT - Arduino Cloud Bridge
echo ==========================================
echo.
echo Dashboard: https://sentineliot.netlify.app/
echo Backend:   https://iot-project-avq0.onrender.com
echo.

where py >nul 2>nul
if errorlevel 1 (
  echo Python 3 is required. Install Python and enable "Add Python to PATH".
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating the small Arduino bridge environment...
  py -3 -m venv .venv
  if errorlevel 1 goto failed
)

echo Installing bridge dependencies...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check requests pyserial
if errorlevel 1 goto failed

echo.
echo Starting Arduino bridge only. No local frontend or backend will be started.
echo Connect the Uno by USB. Close Arduino IDE Serial Monitor first.
echo.
".venv\Scripts\python.exe" network\device_agent.py --port auto --api https://iot-project-avq0.onrender.com
echo.
echo Arduino bridge stopped.
pause
exit /b 0

:failed
echo.
echo Setup failed. Check the message above.
pause
exit /b 1
