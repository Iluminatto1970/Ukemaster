#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# UkeMaster Pro — Setup da VPS (100.72.114.76)
# 
# Execute este script NA VPS como root:
#   bash vps-setup.sh
#
# O que faz:
# 1. Instala Node.js 18+ (se não tiver)
# 2. Clona o repositório
# 3. Instala dependências e gera o bundle do cron
# 4. Configura o .env com as chaves do Supabase
# 5. Agenda o cron a cada 30 minutos
# 6. Roda um teste rápido
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  UkeMaster Pro — Setup da VPS para Cron de Importação      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Cores para output ────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ok()   { echo -e "${GREEN}✔ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err()  { echo -e "${RED}✖ $1${NC}"; }

# ── 0) Verificar se é root ──────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  err "Execute como root: sudo bash vps-setup.sh"
  exit 1
fi

# ── 1) Instalar Node.js ≥ 18 ────────────────────────────────────────
echo ""
echo "━━━ Passo 1: Verificando Node.js ━━━"

if command -v node >/dev/null 2>&1; then
  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -ge 18 ]; then
    ok "Node.js $(node -v) já instalado"
  else
    warn "Node.js $(node -v) é antigo (precisa ≥ 18). Atualizando..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
    apt-get install -y nodejs >/dev/null 2>&1
    ok "Node.js atualizado: $(node -v)"
  fi
else
  warn "Node.js não encontrado. Instalando..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
  apt-get install -y nodejs >/dev/null 2>&1
  ok "Node.js instalado: $(node -v)"
fi

# ── 2) Instalar git (se não tiver) ──────────────────────────────────
echo ""
echo "━━━ Passo 2: Verificando Git ━━━"

if command -v git >/dev/null 2>&1; then
  ok "Git $(git --version | cut -d' ' -f3) já instalado"
else
  warn "Git não encontrado. Instalando..."
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y git >/dev/null 2>&1
  ok "Git instalado: $(git --version)"
fi

# ── 3) Clonar o repositório ─────────────────────────────────────────
echo ""
echo "━━━ Passo 3: Clonando repositório ━━━"

INSTALL_DIR="/opt/ukemaster"
if [ -d "$INSTALL_DIR" ]; then
  ok "Diretório $INSTALL_DIR já existe. Fazendo git pull..."
  cd "$INSTALL_DIR"
  git pull origin main 2>/dev/null || warn "Git pull falhou (pode estar atualizado)"
else
  warn "Clonando repositório..."
  # SUBSTITUA pela URL do seu repositório Git
  git clone https://github.com/SEU-USER/ukemaster-pro.git "$INSTALL_DIR" 2>/dev/null || {
    err "Não foi possível clonar. Verifique:"
    err "  1. URL do repositório está correta"
    err "  2. A VPS tem acesso à internet"
    err "  3. O repositório é público (ou configure SSH keys)"
    err ""
    err "Se o repositório é privado, clone manualmente:"
    err "  cd /opt && git clone git@github.com:SEU-USER/ukemaster-pro.git ukemaster"
    exit 1
  }
  cd "$INSTALL_DIR"
  ok "Repositório clonado em $INSTALL_DIR"
fi

# ── 4) Instalar dependências e gerar bundle ──────────────────────────
echo ""
echo "━━━ Passo 4: Instalando dependências ━━━"

npm install --production=false 2>/dev/null
ok "Dependências instaladas"

echo ""
echo "━━━ Passo 5: Gerando bundle do cron ━━━"

npm run build:cron 2>/dev/null
if [ -f "dist-cron/ukemaster-cron.mjs" ]; then
  ok "Bundle gerado: dist-cron/ukemaster-cron.mjs"
else
  err "Falha ao gerar bundle. Verifique os erros acima."
  exit 1
fi

# ── 5) Configurar .env ──────────────────────────────────────────────
echo ""
echo "━━━ Passo 6: Configurando .env ━━━"

ENV_FILE="dist-cron/.env"
if [ -f "$ENV_FILE" ]; then
  ok ".env já existe. Mantendo configuração atual."
else
  warn "Criando .env com chaves do Supabase..."
  cat > "$ENV_FILE" << 'ENVEOF'
# ── UkeMaster Pro — env do cron (VPS) ───────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://asvjdjawaenxrlwdyziy.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_w7Wr47WNSZmbDShcnJy8Uw_9TNM0Rdj

# ── Conta UkeMaster (autenticação do cron) ──────────────────────────
CRON_UKEMATER_EMAIL=ukemaster@ukemasterpro.com.br
CRON_UKEMATER_PASSWORD=1a7g3c

# ── Configurações da VPS ────────────────────────────────────────────
CRON_TIME_BUDGET_MS=900000
CRON_PLATFORMS=
CRON_WORKER_NAME=vps

# ── YouTube (opcional — busca videoaulas) ───────────────────────────
YOUTUBE_API_KEY=
ENVEOF
  ok ".env criado com chaves do Supabase"
fi

# ── 6) Agendar cron ─────────────────────────────────────────────────
echo ""
echo "━━━ Passo 7: Agendando cron (a cada 30 min) ━━━"

CRON_SCHEDULE="*/30 * * * *"
CRON_CMD="cd /opt/ukemaster/dist-cron && node ukemaster-cron.mjs >> cron.log 2>&1"

# Remove entrada anterior se existir
(crontab -l 2>/dev/null | grep -v "ukemaster-cron.mjs") | crontab - 2>/dev/null || true

# Adiciona nova entrada
( crontab -l 2>/dev/null; echo "$CRON_SCHEDULE $CRON_CMD" ) | crontab -

ok "Cron agendado: $CRON_SCHEDULE"
echo "  Comando: $CRON_CMD"

# ── 7) Criar diretório de logs ──────────────────────────────────────
echo ""
echo "━━━ Passo 8: Configurando logs ━━━"

touch /opt/ukemaster/dist-cron/cron.log
ok "Log: /opt/ukemaster/dist-cron/cron.log"

# ── 8) Teste rápido ─────────────────────────────────────────────────
echo ""
echo "━━━ Passo 9: Rodando teste rápido ━━━"

cd /opt/ukemaster/dist-cron
if node ukemaster-cron.mjs --fast --budget 20000 2>&1 | tail -20; then
  ok "Teste concluído!"
else
  warn "Teste terminou com erros (pode ser normal na 1ª vez)"
fi

# ── 9) Resumo ───────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    ✅ SETUP CONCLUÍDO!                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📍 Localização: /opt/ukemaster"
echo "📦 Bundle:      /opt/ukemaster/dist-cron/ukemaster-cron.mjs"
echo "⚙️  Config:      /opt/ukemaster/dist-cron/.env"
echo "📋 Logs:        /opt/ukemaster/dist-cron/cron.log"
echo ""
echo "⏰ Cron agendado para rodar a cada 30 minutos"
echo ""
echo "🔧 Comandos úteis:"
echo "  # Ver logs em tempo real:"
echo "  tail -f /opt/ukemaster/dist-cron/cron.log"
echo ""
echo "  # Rodar manualmente agora:"
echo "  cd /opt/ukemaster/dist-cron && node ukemaster-cron.mjs"
echo ""
echo "  # Verificar se o cron está agendado:"
echo "  crontab -l"
echo ""
echo "  # Remover cron:"
echo "  crontab -l | grep -v ukemaster-cron.mjs | crontab -"
echo ""
echo "  # Atualizar o código:"
echo "  cd /opt/ukemaster && git pull && npm run build:cron"
echo ""
echo "⚠️  LEMBRETE: Troque a senha da VPS que foi compartilhada!"
echo ""
