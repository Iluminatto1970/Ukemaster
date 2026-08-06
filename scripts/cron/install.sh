#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# UkeMaster Pro — Instalador portável do cron de plataformas
#
# Uso (a partir da raiz do projeto):
#   bash scripts/cron/install.sh            # instala o agendamento
#   bash scripts/cron/install.sh --test     # instala + roda 1 teste rápido
#   bash scripts/cron/install.sh --dry-run  # valida e mostra o que faria
#
# Funciona em: Linux, macOS e Windows (Git Bash / MSYS). Veja o guia
# completo em CRON_DEPLOYMENT.md.
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEST="$ROOT/dist-cron"
ENV_EXAMPLE="$ROOT/scripts/cron/cron.env.example"
ENV_DEST="$DEST/.env"
BUNDLE="$DEST/ukemaster-cron.mjs"
SCHEDULE="${CRON_SCHEDULE:-*/30 * * * *}"        # padrão: a cada 30 min
TASK_NAME="${CRON_TASK_NAME:-UkeMasterCron}"     # nome no Agendador (Windows)

DRY_RUN=0
RUN_TEST=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --test) RUN_TEST=1 ;;
  esac
done

echo "▸ UkeMaster Pro — cron de plataformas"
echo "  Pasta:     $DEST"
echo "  Agendado:  $SCHEDULE"

# ── 1) Node.js ≥ 18 ────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || { echo "✖ Node.js não encontrado. Instale Node ≥ 18: https://nodejs.org"; exit 1; }
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "✖ Node ≥ 18 necessário (encontrado: $NODE_MAJOR)."
  exit 1
fi
echo "✔ Node $NODE_MAJOR"

# ── 2) Bundle (build se faltar) ────────────────────────────────────────
mkdir -p "$DEST"
if [ ! -f "$BUNDLE" ]; then
  echo "→ Gerando bundle (npm run build:cron)..."
  (cd "$ROOT" && npm run build:cron >/dev/null)
fi
[ -f "$BUNDLE" ] || { echo "✖ Bundle não foi gerado. Rode 'npm install' antes."; exit 1; }
echo "✔ Bundle: $BUNDLE"

# ── 3) Arquivo .env (só 2 chaves do Supabase, públicas por design) ─────
if [ -f "$ENV_DEST" ]; then
  echo "✔ .env já existe ($ENV_DEST) — mantido."
elif [ -f "$ROOT/.env.local" ]; then
  (cd "$ROOT" && node -e "
    const fs = require('fs');
    const local = fs.readFileSync('.env.local', 'utf8');
    const get = (k) => { const m = local.match(new RegExp('^' + k + '=\\\"?(.*?)\\\"?\\\\s*\$', 'm')); return m ? m[1].trim() : ''; };
    const url = get('NEXT_PUBLIC_SUPABASE_URL') || get('VITE_SUPABASE_URL') || get('SUPABASE_URL');
    const key = get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || get('VITE_SUPABASE_PUBLISHABLE_KEY') || get('VITE_SUPABASE_ANON_KEY') || get('SUPABASE_ANON_KEY');
    const cEmail = get('CRON_UKEMATER_EMAIL');
    const cPass = get('CRON_UKEMATER_PASSWORD');
    let env = fs.readFileSync('scripts/cron/cron.env.example', 'utf8');
    if (url) env = env.replace(/^NEXT_PUBLIC_SUPABASE_URL=.*$/m, 'NEXT_PUBLIC_SUPABASE_URL=' + url);
    if (key) env = env.replace(/^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=.*$/m, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=' + key);
    if (cEmail) env = env.replace(/^CRON_UKEMATER_EMAIL=.*$/m, 'CRON_UKEMATER_EMAIL=' + cEmail);
    if (cPass) env = env.replace(/^CRON_UKEMATER_PASSWORD=.*$/m, 'CRON_UKEMATER_PASSWORD=' + cPass);
    fs.writeFileSync('dist-cron/.env', env);
    console.log('✔ .env criado com as chaves do .env.local');
  ")
else
  cp "$ENV_EXAMPLE" "$ENV_DEST"
  echo "→ .env criado a partir do exemplo."
  echo "   ⚠ EDITE $ENV_DEST com as chaves do seu Supabase antes de agendar!"
fi

# ── 4) Instalação do agendamento ───────────────────────────────────────
OS="$(uname -s)"
if [ "$DRY_RUN" = "1" ]; then
  echo "◆ DRY-RUN — nada foi agendado. Comandos que seriam usados:"
  echo "  Linux/macOS:"
  echo "    ( crontab -l 2>/dev/null | grep -v ukemaster-cron.mjs; echo \"$SCHEDULE cd \\\"$DEST\\\" && node ukemaster-cron.mjs >> cron.log 2>&1\" ) | crontab -"
  echo "  Windows:"
  echo "    schtasks /Create /F /TN $TASK_NAME /TR \"\\\"<CAMINHO-WINDOWS>\\\\run-cron.cmd\\\"\" /SC MINUTE /MO 30"
elif [ "$OS" = "Linux" ] || [ "$OS" = "Darwin" ]; then
  CRON_LINE="$SCHEDULE cd \"$DEST\" && node ukemaster-cron.mjs >> cron.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v "ukemaster-cron.mjs"; echo "$CRON_LINE" ) | crontab -
  echo "✔ Cron instalado no crontab:"
  echo "  $CRON_LINE"
else
  # Windows (Git Bash / MSYS / Cygwin) — Agendador de Tarefas
  WRAPPER="$DEST/run-cron.cmd"
  cat > "$WRAPPER" <<'EOF'
@echo off
cd /d "%~dp0"
node ukemaster-cron.mjs >> cron.log 2>&1
EOF
  # O Agendador do Windows exige caminho nativo (C:\...) — converte do POSIX (/c/...)
  WIN_WRAPPER="$(cygpath -w "$WRAPPER" 2>/dev/null || echo "$WRAPPER")"
  if schtasks //Create //F //TN "$TASK_NAME" //TR "\"$WIN_WRAPPER\"" //SC MINUTE //MO 30 >/dev/null 2>&1; then
    echo "✔ Tarefa Windows \"$TASK_NAME\" criada (a cada 30 min)."
    echo "  Executa: $WIN_WRAPPER"
  else
    echo "△ Não consegui criar a tarefa (pode exigir Administrador)."
    echo "  Opção 1: reabra o Git Bash como Administrador e rode de novo."
    echo "  Opção 2: Agendador de Tarefas → Criar Tarefa Básica:"
    echo "          Programa = $WIN_WRAPPER | Disparador = a cada 30 minutos"
  fi
fi

# ── 5) Teste rápido opcional ───────────────────────────────────────────
if [ "$RUN_TEST" = "1" ]; then
  echo "→ Teste rápido (1 execução curta, sem delays; o dedupe evita duplicatas)..."
  # Orçamento curto (20s) para o teste não demorar como uma rodada real
  (cd "$DEST" && node ukemaster-cron.mjs --fast --budget 20000 || echo "△ Teste terminou com erros — veja a saída acima.")
fi

echo "✔ Pronto. Logs em: $DEST/cron.log"
echo "  Para desinstalar: bash scripts/cron/uninstall.sh"
