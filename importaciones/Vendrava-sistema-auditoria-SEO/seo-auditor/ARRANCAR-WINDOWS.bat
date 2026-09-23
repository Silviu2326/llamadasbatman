@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env
where docker >nul 2>nul
if errorlevel 1 (
 echo Instala y abre Docker Desktop antes de ejecutar este archivo.
 pause
 exit /b 1
)
docker compose up --build -d
if errorlevel 1 (
 echo No se pudo arrancar. Comprueba que Docker Desktop este abierto.
 pause
 exit /b 1
)
start http://localhost:8787
echo Aplicacion iniciada. Crea tu contrasena en el navegador.
pause
