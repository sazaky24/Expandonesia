@echo off
rem Launch the offline desktop Weather Map Translator with the project venv.
"%~dp0..\.venv\Scripts\pythonw.exe" "%~dp0app.py"
if errorlevel 1 pause
