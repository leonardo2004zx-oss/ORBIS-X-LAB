@echo off
REM Ejemplo de uso de PS4 ZSTD Forge en Windows.
REM Uso: ejemplo_uso.bat "F:\CUSA12345" "D:\FFPFSC"
set GAME=%~1
set DEST=%~2
if "%GAME%"=="" (echo Uso: ejemplo_uso.bat CARPETA_JUEGO [DESTINO] & exit /b 1)
if "%DEST%"=="" set DEST=%CD%\ffpfsc_out
cd /d "%~dp0.."

python ps4zstdforge.py doctor
if errorlevel 1 exit /b 1
python ps4zstdforge.py info "%GAME%"
python ps4zstdforge.py --input "%GAME%" --output "%DEST%\\" --level 9 --threads -1
if errorlevel 1 exit /b %errorlevel%

REM Verificación completa (opcional; necesita espacio libre igual al tamaño del juego):
REM python ps4zstdforge.py verify "%DEST%\CUSA12345_Titulo.ffpfsc" --source "%GAME%" --full
