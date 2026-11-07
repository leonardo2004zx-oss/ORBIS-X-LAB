@echo off
REM Ejemplo de uso de PS4 ZSTD Forge en Windows.
REM Uso: ejemplo_uso.bat "F:\CUSA12345" "D:\ZSTD"
set GAME=%~1
set DEST=%~2
if "%GAME%"=="" (echo Uso: ejemplo_uso.bat CARPETA_JUEGO [DESTINO] & exit /b 1)
if "%DEST%"=="" set DEST=%CD%\zstd_out
cd /d "%~dp0.."

python ps4zstdforge.py info "%GAME%"
python ps4zstdforge.py --input "%GAME%" --output "%DEST%\\" --level 22 --threads -1
if errorlevel 1 exit /b %errorlevel%

REM Verificación completa (opcional, tarda tanto como descomprimir todo):
REM python ps4zstdforge.py verify "%DEST%\CUSA12345_Titulo.tar.zst" --source "%GAME%" --full
