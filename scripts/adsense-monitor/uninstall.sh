#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# UkeMaster Pro — Remove o agendamento do monitor do AdSense.
# Uso: bash scripts/adsense-monitor/uninstall.sh
# (logs e estado em .ukemaster/ são mantidos — apague manualmente se quiser)
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

OS="$(uname -s)"
TASK_NAME="${ADSENSE_MONITOR_TASK:-UkeMasterAdSenseMonitor}"

if [ "$OS" = "Linux" ] || [ "$OS" = "Darwin" ]; then
  ( crontab -l 2>/dev/null | grep -v "monitor-adsense-status.mjs" | crontab - ) || true
  echo "✔ Cron do monitor removido do crontab."
else
  schtasks //Delete //F //TN "$TASK_NAME" >/dev/null 2>&1 || true
  echo "✔ Tarefa Windows \"$TASK_NAME\" removida (se existia)."
fi

echo "  Logs/estado mantidos em .ukemaster/ (adsense-status.log|.json)."
