@echo off
rem Build a single-file Windows executable of the desktop app.
rem --paths backend is REQUIRED: PyInstaller must see backend/ to bundle
rem map_translator.py (it is imported at runtime via sys.path).
.venv\Scripts\pyinstaller --onefile --noconsole --name WeatherMapTranslator --paths backend desktop\app.py
echo.
echo Done. Executable: dist\WeatherMapTranslator.exe
pause
