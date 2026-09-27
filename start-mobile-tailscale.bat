@echo off
setlocal
cd /d "%~dp0"
title FastWork Mobile (Tailscale)

rem ===========================================================================
rem  FastWork Mobile via TAILSCALE — alamat TETAP, privat, HTTPS asli
rem
rem  Paling cocok kalau PC dan HP berbeda jaringan (PC Ethernet, HP data
rem  seluler / Wi-Fi lain). Tailscale membuat "jaringan pribadi" antara kedua
rem  perangkat, jadi HP bisa menjangkau PC dari jaringan mana pun TANPA
rem  port forwarding, dan alamatnya tidak berubah-ubah seperti quick tunnel.
rem
rem  Sekali saja di PC dan HP (akun Tailscale sama):
rem      PC : https://tailscale.com/download/windows  (login)
rem      HP : Play Store / App Store                   (login akun yang sama)
rem
rem  Jalankan:
rem      start-mobile-tailscale.bat            -> http://<ip-tailscale-pc>:4173
rem      start-mobile-tailscale.bat --https    -> https://<nama-pc>.<tailnet>.ts.net
rem                                               (tombol "Pasang aplikasi" &
rem                                                mode offline aktif)
rem      start-mobile-tailscale.bat --check    -> diagnosa saja
rem ===========================================================================

set "PY="
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY (
    python --version >nul 2>nul
    if not errorlevel 1 set "PY=python"
)

set "TS="
for %%T in (tailscale.exe) do if not defined TS set "TS=%%~$PATH:T"
if not defined TS if exist "%ProgramFiles%\Tailscale\tailscale.exe" set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
if not defined TS if exist "%ProgramFiles(x86)%\Tailscale\tailscale.exe" set "TS=%ProgramFiles(x86)%\Tailscale\tailscale.exe"
if not defined TS if exist "%LOCALAPPDATA%\Tailscale\tailscale.exe" set "TS=%LOCALAPPDATA%\Tailscale\tailscale.exe"

set "TSIP="
if defined TS for /f "usebackq delims=" %%a in (`"%TS%" ip -4 2^>nul`) do if not defined TSIP set "TSIP=%%a"

echo.
echo ==========================================================
echo   FastWork Mobile  ^(via Tailscale^)
echo ----------------------------------------------------------
echo   Python          : %PY%
echo   tailscale       : %TS%
echo   IP Tailscale PC : %TSIP%
echo ==========================================================
echo.

if not defined PY (
    echo [X] Python tidak ditemukan di PATH. Install Python lalu ulangi.
    goto :done
)

if not defined TS (
    echo [X] Tailscale belum terpasang di PC ini.
    echo     Install dari https://tailscale.com/download/windows lalu login,
    echo     dan pasang juga aplikasi Tailscale di HP dengan akun yang sama.
    goto :done
)

if not defined TSIP (
    echo [X] Tailscale terpasang tetapi belum login ^(tailscale ip -4 kosong^).
    echo     Buka aplikasi Tailscale di PC, login, lalu jalankan lagi skrip ini.
    goto :done
)

"%PY%" -c "import fastapi, uvicorn, pandas, openpyxl, PIL, multipart" >nul 2>nul
if errorlevel 1 (
    echo [i] Melengkapi dependensi backend...
    "%PY%" -m pip install -r backend\requirements.txt
    if errorlevel 1 (
        echo [!] requirements.txt gagal ^(wheel belum tersedia untuk versi Python ini^).
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

rem --- HTTPS opsional via `tailscale serve` ----------------------------------
set "TSHTTPS="
if /i "%~1"=="--https" (
    echo [i] Mengaktifkan HTTPS Tailscale ^(sertifikat asli, URL tetap^)...
    "%TS%" serve --bg 4173
    if errorlevel 1 (
        echo [!] Gagal mengaktifkan HTTPS. Aktifkan dulu "HTTPS Certificates" di:
        echo     https://login.tailscale.com/admin/dns
        echo [!] Lanjut memakai HTTP biasa: http://%TSIP%:4173
    ) else (
        set "TSHTTPS=1"
    )
)

rem --- backend: 0.0.0.0 supaya terjangkau dari IP Tailscale -------------------
start "FastWork Backend :8000" cmd /k "%PY% -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000"

echo.
echo ==========================================================
echo   ALAMAT TETAP UNTUK HP ^(tidak berubah, dari jaringan apa pun^)
echo ----------------------------------------------------------
echo   Aplikasi : http://%TSIP%:4173
echo   Backend  : http://%TSIP%:8000/health
echo ==========================================================
echo.

if defined TSHTTPS (
    echo   Versi HTTPS ^(untuk install PWA + mode offline^):
    "%TS%" serve status
    echo.
)

echo Selama Tailscale aktif di PC dan HP ^(akun sama^), alamat di atas selalu
echo bisa dipakai. Tekan Ctrl+C di jendela ini untuk mematikan PWA.
echo.

pushd "%~dp0frontend-react"
call npm run preview
popd

:done
endlocal
