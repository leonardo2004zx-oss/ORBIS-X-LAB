@echo off
REM DUAL PROJECTOR PLAYER v7 - abre el reproductor como aplicacion (sin barras) en Edge o Chrome.
REM No instala nada y no usa internet.
setlocal
set "APP=%~dp0index.html"
set "URL=file:///%APP:\=/%"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%EDGE%" ( start "" "%EDGE%" --app="%URL%" & goto :fin )
if exist "%CHROME%" ( start "" "%CHROME%" --app="%URL%" & goto :fin )
start "" "%APP%"
:fin
endlocal
