@echo off
chcp 65001 >nul
title Nilo Entregas - Liberar rede local
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Este arquivo precisa ser executado como Administrador.
  echo Clique com o botao direito e escolha "Executar como administrador".
  pause
  exit /b 1
)

echo Liberando a porta 8765 apenas no perfil de rede PRIVADA do Windows...
netsh advfirewall firewall add rule name="Nilo Entregas V14 - Porta 8765" dir=in action=allow protocol=TCP localport=8765 profile=private

echo.
echo Pronto. Agora o celular/APK pode acessar o PC pela mesma rede privada.
pause
