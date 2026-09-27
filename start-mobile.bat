@echo off
setlocal
cd /d "%~dp0"
title FastWork Mobile

rem ===========================================================================
rem  FastWork Mobile launcher (HTTP — paling gampang, cocok untuk tes di HP)
rem    1) backend FastAPI  -> http://<lan-ip>:8000
rem    2) build PWA        -> frontend-react\dist
rem    3) preview server   -> http://<lan-ip>:4173   <-- buka alamat ini di HP
rem
rem  Jalankan:  start-mobile.bat            (nyalakan semua)
rem             start-mobile.bat --check    (hanya diagnosa, tanpa server)
rem ===========================================================================

rem --- 1) LAN IP -------------------------------------------------------------
set "IPFILE=%TEMP%\fastwork_lanip_http.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).InterfaceAlias; if ($c) { (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias $c).IPAddress } else { '127.0.0.1' }" > "%IPFILE%" 2>nul
set "LANIP="
if exist "%IPFILE%" for /f "usebackq delims=" %%a in ("%IPFILE%") do set "LANIP=%%a"
del "%IPFILE%" >nul 2>nul
if not defined LANIP set "LANIP=127.0.0.1"

rem --- semua IPv4 (berguna untuk kasus hotspot / USB tethering) --------------
set "IPLIST=%TEMP%\fastwork_iplist_http.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { '    ' + $_.IPAddress + '   (' + $_.InterfaceAlias + ')' }" > "%IPLIST%" 2>nul

rem --- 2) Python -------------------------------------------------------------
set "PY="
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY (
    python --version >nul 2>nul
    if not errorlevel 1 set "PY=python"
)

echo.
echo ==========================================================
echo   FastWork Mobile  ^(HTTP^)
echo ----------------------------------------------------------
echo   IP LAN PC   : %LANIP%
echo   Python      : %PY%
echo   App di HP   : http://%LANIP%:4173
echo   Backend API : http://%LANIP%:8000
echo ==========================================================
echo.
echo   Alamat IPv4 di PC ini ^(pakai yang sesuai jaringan HP^):
type "%IPLIST%" 2>nul
echo.
echo   HP beda jaringan dari PC? Jalankan: start-mobile-tunnel.bat
echo.

if not defined PY (
    echo [X] Python tidak ditemukan di PATH. Install Python lalu ulangi.
    goto :done
)

rem --- 3) dependensi backend -------------------------------------------------
"%PY%" -c "import fastapi, uvicorn, pandas, openpyxl, PIL, multipart" >nul 2>nul
if errorlevel 1 (
    echo [i] Melengkapi dependensi backend...
    "%PY%" -m pip install -r backend\requirements.txt
    if errorlevel 1 (
        echo [!] requirements.txt gagal ^(biasanya wheel belum tersedia untuk versi Python ini^).
        echo [!] Mencoba instalasi tanpa pin versi...
        "%PY%" -m pip install fastapi uvicorn pandas openpyxl pillow python-multipart
    )
)

rem --- 3b) pastikan dependensi benar-benar ada -------------------------------
"%PY%" -c "import fastapi, uvicorn, pandas, openpyxl, PIL, multipart" >nul 2>nul
if errorlevel 1 (
    echo [X] Dependensi backend belum lengkap dan instalasi otomatis gagal.
    echo     Pasang manual lalu jalankan ulang:
    echo       "%PY%" -m pip install -r backend\requirements.txt
    goto :done
)

rem --- 4) Node/npm ----------------------------------------------------------
where npm >nul 2>nul
if errorlevel 1 (
    echo [X] npm tidak ditemukan. Install Node.js lalu ulangi.
    goto :done
)

if /i "%~1"=="--check" goto :done

rem --- 5) backend di jendela terpisah ---------------------------------------
start "FastWork Backend :8000" cmd /k "%PY% -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000"

rem --- 6) build + serve PWA -------------------------------------------------
pushd frontend-react
if not exist "node_modules" (
    echo [i] Menginstall dependensi frontend ^(sekali saja^)...
    call npm install
    if errorlevel 1 (
        echo [X] npm install gagal.
        popd
        goto :done
    )
)

echo [i] Build PWA...
call npm run build
if errorlevel 1 (
    echo [X] Build gagal.
    popd
    goto :done
)
popd

echo.
echo Buka di HP   : http://%LANIP%:4173
echo Backend aktif: http://%LANIP%:8000/health
echo Tekan Ctrl+C di jendela ini untuk menghentikan server PWA.
echo.
echo Catatan: pada origin HTTP biasa aplikasi tetap jalan penuh, tetapi tombol
echo "Pasang aplikasi" dan mode offline hanya aktif pada HTTPS / localhost.
echo Untuk itu jalankan start-mobile-https.bat.
echo.

pushd frontend-react
call npm run preview
popd

:done
del "%IPLIST%" >nul 2>nul
endlocal
