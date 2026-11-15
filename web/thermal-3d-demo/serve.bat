@echo off
setlocal
cd /d "%~dp0"

if not exist "dist\index.html" (
  echo Missing dist\index.html
  echo Run:  npm install ^&^& npm run build
  pause
  exit /b 1
)

echo.
echo  RWH x CoRE Thermal 3D demo
echo  Serving dist\ on http://localhost:4173
echo  Close this window to stop the server.
echo.

where node >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" "http://localhost:4173"
  npx --yes serve dist -p 4173
  goto :eof
)

where python >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" "http://localhost:4173"
  pushd dist
  python -m http.server 4173
  popd
  goto :eof
)

where py >nul 2>&1
if %ERRORLEVEL%==0 (
  start "" "http://localhost:4173"
  pushd dist
  py -m http.server 4173
  popd
  goto :eof
)

echo Neither Node.js nor Python was found on PATH.
pause
