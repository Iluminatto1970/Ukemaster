@echo off
rem run-monitor.cmd — monitor de status do AdSense do UkeMaster (roda via tarefa UkeMasterAdSenseMonitor, oculto pelo run-monitor-hidden.vbs).
rem Corrigido 1: caminhos Windows (%~dp0) em vez de /c/Users/... (cmd.exe não entendia).
rem Corrigido 2: sem redirecionamento >> — o script node JÁ grava no log sozinho
rem (appendFileSync); redirecionar o mesmo arquivo causava EBUSY (dois escritores).
cd /d "%~dp0..\.."
node "%~dp0monitor-adsense-status.mjs"
