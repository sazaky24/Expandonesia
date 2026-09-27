@echo off
setlocal
cd /d "%~dp0"
title FastWork Mobile - Autostart

rem ===========================================================================
rem  Supaya FastWork otomatis menyala setiap kali Anda login ke Windows.
rem
rem  Pemakaian:
rem      install-autostart.bat              (default: mode tunnel)
rem      install-autostart.bat tailscale    (mode Tailscale, alamat tetap)
rem      install-autostart.bat lan          (mode LAN / satu Wi-Fi)
rem      install-autostart.bat status       (lihat yang terdaftar)
rem      install-autostart.bat remove       (hapus semua)
rem
rem  Catatan: task berjalan SETELAH login (bukan saat PC boot sebelum login)
rem  dan tidak butuh hak admin. Kalau PC menyala tanpa login, jalankan launcher
rem  manual dulu.
rem ===========================================================================

set "MODE=%~1"
if not defined MODE set "MODE=tunnel"

if /i "%MODE%"=="remove" goto :remove
if /i "%MODE%"=="status" goto :status

set "TARGET="
set "TASK="
if /i "%MODE%"=="tunnel" (
    set "TARGET=start-mobile-tunnel.bat"
    set "TASK=FastWork Mobile (Tunnel)"
)
if /i "%MODE%"=="tailscale" (
    set "TARGET=start-mobile-tailscale.bat"
    set "TASK=FastWork Mobile (Tailscale)"
)
if /i "%MODE%"=="lan" (
    set "TARGET=start-mobile.bat"
    set "TASK=FastWork Mobile (LAN)"
)

if not defined TARGET (
    echo [X] Mode "%MODE%" tidak dikenal.
    echo     Pilihan: tunnel ^| tailscale ^| lan ^| status ^| remove
    goto :done
)

if not exist "%TARGET%" (
    echo [X] %TARGET% tidak ditemukan di folder ini.
    goto :done
)

schtasks /query /tn "%TASK%" >nul 2>nul
if not errorlevel 1 (
    echo [i] Task "%TASK%" sudah terdaftar.
    echo     Jalankan dulu "install-autostart.bat remove", lalu daftarkan ulang.
    goto :status
)

rem --- wrapper kecil supaya penjadwalan tidak perlu mengutip path panjang -----
set "LAUNCHER=%~dp0autostart-launch.cmd"
> "%LAUNCHER%" echo @echo off
>> "%LAUNCHER%" echo cd /d "%~dp0."
>> "%LAUNCHER%" echo call "%~dp0%TARGET%"

schtasks /create /tn "%TASK%" /tr "%LAUNCHER%" /sc onlogon /f
if errorlevel 1 (
    echo [X] Gagal mendaftarkan task. Coba jalankan skrip ini sebagai Administrator.
    goto :done
)

echo.
echo [OK] Autostart terdaftar.
echo      Task    : %TASK%
echo      Launcher: %TARGET%
echo      Wrapper : autostart-launch.cmd
echo.
echo Launcher akan menyala otomatis setiap kali Anda login ke Windows.
echo Hapus dengan: install-autostart.bat remove
goto :done

:remove
for %%T in ("FastWork Mobile (Tunnel)" "FastWork Mobile (Tailscale)" "FastWork Mobile (LAN)") do (
    schtasks /delete /tn %%T /f >nul 2>nul
)
del "%~dp0autostart-launch.cmd" >nul 2>nul
echo [OK] Semua autostart FastWork dihapus beserta file wrapper-nya.
goto :done

:status
echo.
echo Task autostart yang terdaftar:
for %%T in ("FastWork Mobile (Tunnel)" "FastWork Mobile (Tailscale)" "FastWork Mobile (LAN)") do (
    schtasks /query /tn %%T /fo LIST 2>nul | findstr /i "TaskName Status"
)
echo.
echo ^(Kalau tidak ada baris di atas, belum ada autostart yang terdaftar.^)
goto :done

:done
endlocal
