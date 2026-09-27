@echo off
setlocal
cd /d "%~dp0"
title FastWork Mobile (Tunnel)

rem ===========================================================================
rem  FastWork Mobile via TUNNEL PUBLIK
rem
rem  Dipakai kalau PC dan HP TIDAK berada di jaringan yang sama
rem  (mis. PC pakai Ethernet, HP pakai data seluler atau Wi-Fi lain).
rem
rem  Yang dijalankan:
rem    1) backend FastAPI     -> http://127.0.0.1:8000
rem    2) PWA (vite preview)  -> http://127.0.0.1:4173
rem    3) cloudflared/ngrok   -> https://xxxx.trycloudflare.com  <-- dibuka di HP
rem
rem  Satu tunnel melayani aplikasi DAN API: aplikasi memanggil /api/* pada origin
rem  yang sama, lalu Vite meneruskannya ke FastAPI lokal (lihat vite.config.js).
rem  Karena origin-nya HTTPS asli, tombol "Pasang aplikasi" dan mode offline
rem  langsung berfungsi tanpa peringatan sertifikat.
rem
rem  Prasyarat: cloudflared (gratis, tanpa akun) atau ngrok (butuh authtoken).
rem      winget install --id Cloudflare.cloudflared
rem      unduhan manual: https://github.com/cloudflare/cloudflared/releases
rem
rem  Jalankan: start-mobile-tunnel.bat            (nyalakan semua)
rem             start-mobile-tunnel.bat --check    (diagnosa saja)
rem ===========================================================================

set "PY="
if exist ".venv\Scripts\python.exe" set "PY=.venv\Scripts\python.exe"
if not defined PY (
    python --version >nul 2>nul
    if not errorlevel 1 set "PY=python"
)

set "TUNNEL="
for %%T in (cloudflared.exe) do if not defined TUNNEL set "TUNNEL=%%~$PATH:T"
if not defined TUNNEL if exist "%LOCALAPPDATA%\cloudflared\cloudflared.exe" set "TUNNEL=%LOCALAPPDATA%\cloudflared\cloudflared.exe"
if not defined TUNNEL if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "TUNNEL=%ProgramFiles%\cloudflared\cloudflared.exe"
if not defined TUNNEL if exist "%USERPROFILE%\cloudflared.exe" set "TUNNEL=%USERPROFILE%\cloudflared.exe"

set "NGROK="
for %%T in (ngrok.exe) do if not defined NGROK set "NGROK=%%~$PATH:T"

echo.
echo ==========================================================
echo   FastWork Mobile  ^(via tunnel publik^)
echo ----------------------------------------------------------
echo   Python      : %PY%
echo   cloudflared : %TUNNEL%
echo   ngrok       : %NGROK%
echo ==========================================================
echo.

if not defined PY (
    echo [X] Python tidak ditemukan di PATH. Install Python lalu ulangi.
    goto :done
)

if not defined TUNNEL if not defined NGROK (
    echo [X] cloudflared / ngrok tidak ditemukan.
    echo     Pasang cloudflared ^(gratis, tanpa akun^) dengan:
    echo         winget install --id Cloudflare.cloudflared
    echo     atau unduh dari:
    echo         https://github.com/cloudflare/cloudflared/releases
    echo     Tutup jendela ini, buka lagi, lalu jalankan start-mobile-tunnel.bat.
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

rem --- backend: hanya 127.0.0.1, karena yang diekspos adalah tunnel ------------
start "FastWork Backend :8000" cmd /k "%PY% -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000"

rem --- preview server di jendela terpisah ------------------------------------
pushd "%~dp0frontend-react"
start "FastWork PWA :4173" cmd /k "npm run preview"
popd

echo.
echo Tunggu sampai tunnel mencetak alamat publiknya, contoh:
echo     https://kata-kata-acak.trycloudflare.com
echo Buka alamat HTTPS itu di browser HP ^(boleh dari data seluler^).
echo Tekan Ctrl+C di jendela ini untuk mematikan tunnel.
echo.

if defined TUNNEL (
    "%TUNNEL%" tunnel --url http://localhost:4173
) else (
    echo [i] Memakai ngrok. Kalau belum pernah disetel:
    echo     ngrok config add-authtoken ^<TOKEN_DARI_DASHBOARD_NGROK^>
    "%NGROK%" http 4173
)

:done
endlocal
