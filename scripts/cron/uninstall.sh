#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# UkeMaster Pro — Remove o agendamento do cron (sem apagar o bundle nem
# o histórico do Supabase — que é persistente na nuvem).
#
# Uso: bash scripts/cron/uninstall.sh
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="$ROOT/dist-cron"
OS="$(uname -s)"
TASK_NAME="${CRON_TASK_NAME:-UkeMasterCron}"

if [ "$OS" = "Linux" ] || [ "$OS" = "Darwin" ]; then
  ( crontab -l 2>/dev/null | grep -v "ukemaster-cron.mjs" | crontab - ) || true
  echo "✔ Cron removido do crontab."
else
  schtasks //Delete //F //TN "$TASK_NAME" >/dev/null 2>&1 || true
  echo "✔ Tarefa Windows \"$TASK_NAME\" removida (se existia)."
fi

echo "  Para apagar a pasta local (bundle + .env + logs): rm -rf \"$DEST\""
echo "  Obs.: o histórico na nuvem (cron_imports/cron_log) permanece intacto."
