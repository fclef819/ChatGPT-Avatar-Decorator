@echo off
setlocal

cd /d "%~dp0"

echo [ChatGPT-Avatar-Decorator] Updating repository...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo Update failed. Please check the error above.
  pause
  exit /b 1
)

echo.
echo Update completed successfully.
pause
exit /b 0
