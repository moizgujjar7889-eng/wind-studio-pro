@echo off
REM Compresses every .glb in public\assets\characters with gltfpack (meshopt). Needs Node.js installed.
REM Originals are kept in public\assets\characters\_originals so you can go back.
cd /d "%~dp0.."
if not exist public\assets\characters\_originals mkdir public\assets\characters\_originals
for %%f in (public\assets\characters\*.glb) do (
  echo Compressing %%~nxf ...
  copy /Y "%%f" "public\assets\characters\_originals\%%~nxf" >nul
  call npx --yes gltfpack -i "public\assets\characters\_originals\%%~nxf" -o "%%f" -c
)
echo.
echo Done. Test the app (npm run dev). If a model looks broken, copy its file back from _originals.
pause
