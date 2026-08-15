' run-monitor-hidden.vbs — roda run-monitor.cmd com janela oculta (via tarefa UkeMasterAdSenseMonitor).
' Mesmo padrão do daily-sync-hidden.vbs e do run-cron-hidden.vbs da desktop:
' wscript não tem console e o WshShell.Run(..., 0, False) executa o cmd oculto.
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c ""C:\Users\ilumi\Documents\Dev\Projects\UkeMaster\scripts\adsense-monitor\run-monitor.cmd""", 0, False
