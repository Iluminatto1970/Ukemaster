#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# UkeMaster Pro — Monitor de status do AdSense (ukemasterpro.com)
#
# Consulta o status de aprovação do site via MCP diariamente e avisa
# (notificação do SO) quando mudar para READY (aprovado/servindo anúncios).
#
# Uso (a partir da raiz do projeto):
#   bash scripts/adsense-monitor/install.sh              # agenda 1x/dia (10:00)
#   bash scripts/adsense-monitor/install.sh --test       # agenda + roda 1 vez agora
#   bash scripts/adsense-monitor/install.sh --dry-run    # mostra o que faria
#
# Requisitos: node ≥ 18 e OAuth do MCP já feito (`adsense-mcp init`).
# Logs: .ukemaster/adsense-status.log · estado: .ukemaster/adsense-status.json
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/adsense-monitor/monitor-adsense-status.mjs"
TASK_NAME="${ADSENSE_MONITOR_TASK:-UkeMasterAdSenseMonitor}"
SCHEDULE_TIME="${ADSENSE_MONITOR_TIME:-10:00}"   # horário diário (HH:MM)

DRY_RUN=0
RUN_TEST=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --test) RUN_TEST=1 ;;
  esac
done

echo "▸ UkeMaster — Monitor do AdSense"
echo "  Script:  $SCRIPT"
echo "  Horário: diário às $SCHEDULE_TIME"

# ── 1) Node ≥ 18 ───────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { echo "✖ Node.js não encontrado. Instale Node ≥ 18."; exit 1; }
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
[ "$NODE_MAJOR" -ge 18 ] || { echo "✖ Node ≥ 18 necessário (encontrado: $NODE_MAJOR)."; exit 1; }

# ── 2) OAuth do MCP já configurado? ────────────────────────────────────
if ! node -e "const p=require('node:path'),fs=require('node:fs'),os=require('node:os');const d=p.join(os.homedir(),'.config','adsense-mcp');if(!fs.existsSync(p.join(d,'credentials.json')))process.exit(1);" 2>/dev/null; then
  echo "⚠ OAuth do MCP ainda não configurado — rode antes:"
  echo "    adsense-mcp init"
  echo "  (ou, se preferir, o instalador continua e o monitor só loga erros até autenticar.)"
fi

# ── 3) Instalação do agendamento ───────────────────────────────────────
OS="$(uname -s)"
if [ "$DRY_RUN" = "1" ]; then
  echo "◆ DRY-RUN — nada agendado. Comandos que seriam usados:"
  echo "  Linux/macOS:  ( crontab -l 2>/dev/null | grep -v 'monitor-adsense-status.mjs'; echo \"$SCHEDULE_TIME cd \\\"$ROOT\\\" && node \\\"$SCRIPT\\\" >> .ukemaster/adsense-status.log 2>&1\" ) | crontab -"
  echo "  Windows:       schtasks //Create //F //TN \"$TASK_NAME\" //TR \"<cmd-wrapper>\" //SC DAILY //ST $SCHEDULE_TIME"
elif [ "$OS" = "Linux" ] || [ "$OS" = "Darwin" ]; then
  mkdir -p "$ROOT/.ukemaster"
  CRON_LINE="$SCHEDULE_TIME cd \"$ROOT\" && node \"$SCRIPT\" >> .ukemaster/adsense-status.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v "monitor-adsense-status.mjs"; echo "$CRON_LINE" ) | crontab -
  echo "✔ Cron instalado (diário às $SCHEDULE_TIME):"
  echo "  $CRON_LINE"
else
  # Windows (Git Bash / MSYS) — Agendador de Tarefas
  WRAPPER="$ROOT/scripts/adsense-monitor/run-monitor.cmd"
  cat > "$WRAPPER" <<EOF
@echo off
cd /d "$ROOT"
node "$SCRIPT" >> "$ROOT\.ukemaster\adsense-status.log" 2>&1
EOF
  WIN_WRAPPER="$(cygpath -w "$WRAPPER" 2>/dev/null || echo "$WRAPPER")"
  if schtasks //Create //F //TN "$TASK_NAME" //TR "\"$WIN_WRAPPER\"" //SC DAILY //ST "$SCHEDULE_TIME" >/dev/null 2>&1; then
    echo "✔ Tarefa Windows \"$TASK_NAME\" criada (diária às $SCHEDULE_TIME)."
    echo "  Executa: $WIN_WRAPPER"
  else
    echo "△ Não consegui criar a tarefa (pode exigir Administrador)."
    echo "  Opção 1: reabra o Git Bash como Administrador e rode de novo."
    echo "  Opção 2: Agendador de Tarefas → Criar Tarefa Básica →"
    echo "          Disparador: Diário às $SCHEDULE_TIME | Ação: iniciar programa = $WIN_WRAPPER"
  fi
fi

# ── 4) Teste opcional ──────────────────────────────────────────────────
if [ "$RUN_TEST" = "1" ]; then
  echo "→ Teste (1 execução agora)..."
  node "$SCRIPT"
fi

echo "✔ Pronto. Para desinstalar: bash scripts/adsense-monitor/uninstall.sh"
