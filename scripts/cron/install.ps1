# =============================================================================
# UkeMaster Pro - Instalador do cron de plataformas (Windows PowerShell)
#
# Equivalente ao scripts/cron/install.sh para maquinas SEM Git Bash.
#
# Uso (no PowerShell, a partir da raiz do projeto):
#   powershell -ExecutionPolicy Bypass -File scripts\cron\install.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\cron\install.ps1 -Test
#   powershell -ExecutionPolicy Bypass -File scripts\cron\install.ps1 -IntervalHours 6
#
# Cria as tarefas agendadas (padrao: a cada 6 horas):
#   UkeMasterCron           -> run-cron.cmd           (00:00, 06:00, 12:00, 18:00)
#   UkeMasterCronCommands   -> run-cron-commands.cmd  (00:30, 06:30, 12:30, 18:30)
#
# LEMBRETE pos-instalacao: edite dist-cron\.env com
#   CRON_WORKER_NAME=<nome unico da maquina> (ex.: notebook)
#   SUPABASE_SERVICE_ROLE_KEY=<copie da outra maquina, se existir la>
#   CRON_PLATFORMS=cifraclub-br,ultimate-guitar-en,ufret-ja,guitaretab-int
# =============================================================================
param(
  [int]$IntervalHours = 6,
  [switch]$Test,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)  # scripts/cron -> raiz
$dest = Join-Path $root 'dist-cron'
$taskName = 'UkeMasterCron'

Write-Host "UkeMaster Pro - cron de plataformas (PowerShell)"
Write-Host "  Pasta:     $dest"
Write-Host "  Agendado:  a cada $IntervalHours horas (4 rodadas/dia)"

# -- 1) Node.js >= 18 --------------------------------------------------------
try { $nodeMajor = [int](node -p "process.versions.node.split('.')[0]") }
catch { Write-Host "X Node.js nao encontrado. Instale Node >= 18: https://nodejs.org" -ForegroundColor Red; exit 1 }
if ($nodeMajor -lt 18) { Write-Host "X Node >= 18 necessario (encontrado: $nodeMajor)." -ForegroundColor Red; exit 1 }
Write-Host "OK Node $nodeMajor"

# -- 2) Bundle (build se faltar) ---------------------------------------------
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$bundle = Join-Path $dest 'ukemaster-cron.mjs'
if (-not (Test-Path $bundle)) {
  Write-Host "-> Gerando bundle (npm run build:cron)..."
  Push-Location $root
  npm run build:cron | Out-Null
  Pop-Location
}
if (-not (Test-Path $bundle)) { Write-Host "X Bundle nao foi gerado. Rode 'npm install' antes." -ForegroundColor Red; exit 1 }
Write-Host "OK Bundle: $bundle"

# -- 3) Arquivo .env (so se nao existir - nunca sobrescreve) ------------------
$envDest = Join-Path $dest '.env'
$envExample = Join-Path $PSScriptRoot 'cron.env.example'
if (Test-Path $envDest) {
  Write-Host "OK .env ja existe ($envDest) - mantido."
} else {
  Copy-Item $envExample $envDest
  Write-Host "-> .env criado a partir do exemplo."
}

# -- 4) Wrappers .cmd ----------------------------------------------------------
$runCron = Join-Path $dest 'run-cron.cmd'
$runCmds = Join-Path $dest 'run-cron-commands.cmd'
Set-Content -Path $runCron -Encoding ASCII -Value @'
@echo off
cd /d "%~dp0"
node ukemaster-cron.mjs >> cron.log 2>&1
'@
Set-Content -Path $runCmds -Encoding ASCII -Value @'
@echo off
rem UkeMaster Pro - rodada de comandos do painel admin (--commands-only)
cd /d "%~dp0"
node ukemaster-cron.mjs --commands-only >> commands.log 2>&1
'@
Write-Host "OK Wrappers: $(Split-Path -Leaf $runCron), $(Split-Path -Leaf $runCmds)"

if ($DryRun) {
  Write-Host "DRY-RUN - nada foi agendado. Acoes que seriam registradas:"
  Write-Host "  Register-ScheduledTask $taskName           -> $runCron   (repete a cada ${IntervalHours}h, ancorado em 00:00)"
  Write-Host "  Register-ScheduledTask ${taskName}Commands -> $runCmds  (repete a cada ${IntervalHours}h, ancorado em 00:30)"
  exit 0
}

# -- 5) Tarefas agendadas (a cada N horas) ------------------------------------
# Usa Register-ScheduledTask (API do Task Scheduler) em vez de 'schtasks /TR':
# o schtasks quebra o /TR quando o caminho tem espacos (corta no primeiro
# espaco, deixando a tarefa apontando para um caminho inexistente).
$action1 = New-ScheduledTaskAction -Execute $runCron -WorkingDirectory $dest
$action2 = New-ScheduledTaskAction -Execute $runCmds -WorkingDirectory $dest
# Um gatilho diario por rodada (ex.: 6h -> 00/06/12/18h e :30 nas mesmas horas).
# Gatilhos diarios evitam as armadilhas de RepetitionDuration do Task Scheduler.
$triggers1 = @(); $triggers2 = @()
for ($h = 0; $h -lt 24; $h += $IntervalHours) {
  $triggers1 += New-ScheduledTaskTrigger -Daily -At ([DateTime]::Today).AddHours($h)
  $triggers2 += New-ScheduledTaskTrigger -Daily -At ([DateTime]::Today).AddHours($h).AddMinutes(30)
}
try {
  Register-ScheduledTask -TaskName $taskName -Action $action1 -Trigger $triggers1 -Force | Out-Null
  Register-ScheduledTask -TaskName "${taskName}Commands" -Action $action2 -Trigger $triggers2 -Force | Out-Null
} catch {
  Write-Host "X Falha ao registrar tarefas: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
Write-Host "OK Tarefas criadas (a cada $IntervalHours horas):"
Write-Host "  $taskName           -> $runCron (00:00, 06:00, 12:00, 18:00)"
Write-Host "  ${taskName}Commands -> $runCmds (00:30, 06:30, 12:30, 18:30)"

# -- 6) Teste rapido opcional ---------------------------------------------------
if ($Test) {
  Write-Host "-> Teste rapido (20s; o dedupe evita duplicatas)..."
  Push-Location $dest
  node ukemaster-cron.mjs --fast --budget 20000
  Pop-Location
}

Write-Host "OK Pronto. Logs em: $dest\cron.log e $dest\commands.log"
Write-Host "  NAO ESQUECA: edite $envDest com CRON_WORKER_NAME unico desta"
Write-Host "  maquina (ex.: notebook) e a SUPABASE_SERVICE_ROLE_KEY (copie da"
Write-Host "  outra maquina, se ela a tiver). Para desinstalar:"
Write-Host "  schtasks /Delete /F /TN $taskName; schtasks /Delete /F /TN ${taskName}Commands"
