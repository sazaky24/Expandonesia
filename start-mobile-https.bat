@echo off
setlocal
cd /d "%~dp0"
title FastWork Mobile (HTTPS)

rem ===========================================================================
rem  FastWork Mobile launcher (HTTPS dengan sertifikat self-signed)
rem    - backend FastAPI  -> https://<lan-ip>:8443
rem    - PWA (preview)    -> https://<lan-ip>:4173   <-- buka alamat ini di HP
rem    - sertifikat dibuat oleh frontend-react\scripts\make_dev_cert.py
rem
rem  Jalankan:  start-mobile-https.bat
rem             start-mobile-https.bat --check
rem
rem  HP akan menampilkan peringatan sertifikat: pilih Advanced - Proceed.
rem  Untuk sertifikat yang dipercaya tanpa peringatan, gunakan tunnel
rem  (cloudflared/ngrok) atau hosting HTTPS sungguhan.
rem ===========================================================================

set "IPFILE=%TEMP%\fastwork_lanip_https.txt"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).InterfaceAlias; if ($c) { (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias $c).IPAddress } else { '127.0.0.1' }" > "%IPFILE%" 2>nul
set "LANIP="
if exist "%IPFILE%" for /f "usebackq delims=" %%a in ("%IPFILE%") do set "LANIP=%%a"
del "%IPFILE%" >nul 2>nul
if not defined LANIP set "LANIP=127.0.0.1"

set "PY="
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY (
    python --version >nul 2>nul
    if not errorlevel 1 set "PY=python"
)

echo.
echo ==========================================================
echo   FastWork Mobile  ^(HTTPS self-signed^)
echo ----------------------------------------------------------
echo   IP LAN PC   : %LANIP%
echo   App di HP   : https://%LANIP%:4173
echo   Backend API : https://%LANIP%:8443
echo ==========================================================
echo.

if not defined PY (
    echo [X] Python tidak ditemukan di PATH. Install Python lalu ulangi.
    goto :done
)

rem --- 1) sertifikat dev -----------------------------------------------------
if not exist "frontend-react\certs\dev-cert.pem" (
    echo [i] Membuat sertifikat dev...
    "%PY%" "frontend-react\scripts\make_dev_cert.py"
    if errorlevel 1 (
        echo [X] Gagal membuat sertifikat. Pakai start-mobile.bat ^(HTTP^) saja.
        goto :done
    )
)

rem --- 2) dependensi backend -------------------------------------------------
"%PY%" -c "import fastapi, uvicorn, pandas, openpyxl, PIL, multipart" >nul 2>nul
if errorlevel 1 (
    echo [i] Melengkapi dependensi backend...
    "%PY%" -m pip install -r backend\requirements.txt
    if errorlevel 1 (
        echo [!] Mencoba instalasi tanpa pin versi...
        "%PY%" -m pip install fastapi uvicorn pandas openpyxl pillow python-multipart
    )
)

"%PY%" -c "import fastapi, uvicorn, pandas, openpyxl, PIL, multipart" >nul 2>nul
if errorlevel 1 (
    echo [X] Dependensi backend belum lengkap dan instalasi otomatis gagal.
    echo     Pasang manual lalu jalankan ulang:
    echo       "%PY%" -m pip install -r backend\requirements.txt
    goto :done
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [X] npm tidak ditemukan. Install Node.js lalu ulangi.
    goto :done
)

if /i "%~1"=="--check" goto :done

rem --- 3) backend HTTPS di jendela terpisah ----------------------------------
start "FastWork Backend :8443 (https)" cmd /k "%PY% -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8443 --ssl-keyfile frontend-react\certs\dev-key.pem --ssl-certfile frontend-react\certs\dev-cert.pem"

rem --- 4) build + serve PWA lewat HTTPS -------------------------------------
set "FASTWORK_HTTPS=1"

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
echo Buka di HP: https://%LANIP%:4173
echo Terima peringatan sertifikat ^(Advanced - Proceed^) sekali saja, lalu
echo aplikasi bisa dipasang ke layar utama dan dibuka offline.
echo Tekan Ctrl+C di jendela ini untuk menghentikan server PWA.
echo.

pushd frontend-react
call npm run preview
popd

:done
endlocal
