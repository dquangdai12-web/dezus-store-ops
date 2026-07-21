@echo off
setlocal
cd /d "%~dp0"
if not exist data\backups mkdir data\backups
set TS=%DATE:~-4%%DATE:~3,2%%DATE:~0,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%
set TS=%TS: =0%
if exist data\store_ops.json copy data\store_ops.json data\backups\store_ops_%TS%.json >nul
xcopy uploads data\backups\uploads_%TS%\ /E /I /Y >nul
echo Backup done: data\backups
pause
