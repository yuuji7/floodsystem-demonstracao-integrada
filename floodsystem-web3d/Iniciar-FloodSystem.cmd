@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo FloodSystem - Laboratorio Web3D
echo Mantenha esta janela aberta enquanto usar o modelo.
echo.
where node >nul 2>nul
if %errorlevel%==0 (
  node server.mjs --open
  goto end
)
where python >nul 2>nul
if %errorlevel%==0 (
  python -c "import http.server,functools,webbrowser; s=http.server.ThreadingHTTPServer(('127.0.0.1',4173),functools.partial(http.server.SimpleHTTPRequestHandler,directory='dist')); print('FloodSystem: http://127.0.0.1:4173'); webbrowser.open('http://127.0.0.1:4173'); s.serve_forever()"
  goto end
)
echo Nao foi encontrado Node.js ou Python. Instale um deles para abrir o teste.
:end
pause
