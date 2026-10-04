# ⏰ Cron de Plataformas — Deploy em Qualquer Máquina

O cron varre os sites de cifras **nacionais e internacionais** (CifraClub
Brasil + GuitarTabs/INT), converte para o formato do UkeMaster Pro (tom,
dificuldade, categoria, SEO, vídeo do YouTube opcional) e publica no Supabase
— **até o acervo ficar 100% sincronizado**, sem duplicar músicas (dedupe em
3 camadas + histórico persistente `cron_imports`/`cron_log`).

> **Fila = ÍNDICE DE CATÁLOGO** (`src/data/cifraclubCatalog.ts`): 667 artistas
> cobrindo os 98 gêneros do CifraClub (MPB, Sertanejo, Gospel, Rock, Pop,
> Forró, Reggae, Infantil, Internacional...). A categoria de cada música vem
> do **gênero oficial do CifraClub** (não de lista manual) — para adicionar
> artistas novos, re-rode `node scripts/collect-genre-artists.mjs && node
> scripts/build-catalog.mjs` e faça deploy (o cron detecta o diff pela fila).

> **MULTIMÁQUINA SEM DUPLICAÇÃO**: a Vercel (1x/dia) e as máquinas locais
> (a cada 6 horas) compartilham a mesma fila e o mesmo cursor, protegidos por
> um **lease atômico** na tabela `scrape_state` (key `worker_lease`): só uma
> execução processa por vez; a que perde espera a próxima rodada. Heartbeat
> a cada artista + expiração automática (25 min) se a máquina cair.

> Idealmente roda numa máquina ligada 24/7. A Vercel já roda 1x/dia (limite
> do plano grátis); nas suas máquinas ele roda **a cada 6 horas** (4 rodadas
> por dia) com orçamento de 2 h por rodada — a sincronização completa fica em
> semanas/meses para a fila grande do CifraClub (3.848 artistas).

---

## ✅ Requisitos (mínimos)

| Item | Exigência |
|---|---|
| **Node.js** | ≥ 18 (tem `fetch` nativo). Baixe em https://nodejs.org |
| **Internet** | Acesso ao site de origem + ao Supabase |
| **Máquina** | Ligada 24/7 (pode ser um PC, notebook velho, VPS ou Raspberry) |
| **Repositório** | `git clone` do projeto **OU** apenas a pasta `dist-cron/` copiada |

Nada mais é necessário: **zero dependências** no runtime (o bundle é único e
autocontido — 34 KB).

---

## 🌍 Fontes por idioma (alinhadas ao seletor do portal)

O cron captura músicas dos idiomas que o portal oferece (pt/en/es/fr/de/ja/zh/ar):

| Idioma | Plataforma | Instrumento | Status |
|---|---|---|---|
| **pt (BR)** | CifraClub (667 artistas × 98 gêneros) | violão/guitarra/ukulele | ✅ habilitada |
| **en** | UkuTabs (`ukutabs-en`) | ukulele | ✅ habilitada |
| **ja** | U-FRET (`ufret-ja`) | violão/ukulele/piano | ✅ habilitada |
| **es / fr / de** | GuitarTabs (`guitaretab-int`, agregador global com artistas desses países) | violão | ✅ habilitada |
| **es nativo** | LaCuerda | violão | ⚠️ desabilitada (redirect JS + 404) |
| **fr nativo** | Partoch | violão | ⚠️ desabilitada (tab via AJAX — exige headless) |
| **de nativo** | E-Chords | violão | ⚠️ desabilitada (Cloudflare) |
| **zh** | 17Jita / Tan8 | violão/piano | ⚠️ desabilitadas (anti-bot JS / partituras em imagem) |
| **ar** | — | — | ⚠️ sem site de cifras em HTML puro estável |

Cada fonte desabilitada tem `disabledReason` no registro (`src/lib/platforms.ts`)
com o motivo — se um dia passar a servir HTML puro, basta habilitar e ajustar
um seletor no scraper.

### 🖥️ Dividir entre o Acer e o Desktop (sem duplicar)

As máquinas compartilham a mesma fila e o **lease atômico** já impede que
duas executem o mesmo artista ao mesmo tempo. Para dar prioridade por idioma
(um japonês vê conteúdo JA mais rápido), cada máquina pode processar só um
grupo de plataformas via `CRON_PLATFORMS`:

```bash
# Acer (Linux) — pt + japonês
CRON_PLATFORMS=cifraclub-br,ufret-ja

# Desktop (Linux Mint, Tailscale — ex-Windows) — inglês + internacional
CRON_PLATFORMS=ukutabs-en,guitaretab-int
```

Edite `dist-cron/.env` em cada máquina (ou use `--platform` no agendamento).
Deixe `CRON_PLATFORMS` vazio se preferir que as duas rodem tudo (o lease
alterna quem processa a cada 6 h).

---

## 🚀 Caminho A — Instalação automática (recomendado)

Na máquina nova, com o projeto clonado:

```bash
# 1. Entra no projeto e instala as dependências de build (esbuild)
git clone <seu-repo> UkeMaster && cd UkeMaster
npm install

# 2. Instala o cron (gera o bundle, cria o .env, agenda e testa)
npm run cron:install -- --test
```

O instalador (`scripts/cron/install.sh`) faz tudo:

1. **Valida** o Node ≥ 18;
2. **Gera** `dist-cron/ukemaster-cron.mjs` (bundle único);
3. **Cria** `dist-cron/.env` — preenche automaticamente com as chaves do
   `.env.local` se ele existir na máquina; senão, copia o exemplo e pede
   para você editar;
4. **Agenda** a execução (**a cada 6 horas** por padrão — 4 rodadas/dia):
   - **Linux/macOS** → `crontab` (`0 */6 * * *`)
   - **Windows (Git Bash)** → Agendador de Tarefas (`schtasks`), com wrappers
     `dist-cron/run-cron.cmd` (00:00/06:00/12:00/18:00) e
     `dist-cron/run-cron-commands.cmd` (00:30/06:30/12:30/18:30, comandos do
     painel admin). Para outra cadência: `CRON_INTERVAL_HOURS=3 npm run cron:install`.
   - **Windows SEM Git Bash (só PowerShell)** →
     `powershell -ExecutionPolicy Bypass -File scripts\cron\install.ps1`
     (mesmo resultado: cria as 2 tarefas; aceita `-Test` e `-IntervalHours N`).
     ⚠️ **Importante**: use esta versão do `install.ps1` (registra via
     `Register-ScheduledTask`, com `WorkingDirectory` explícito). Versões
     antigas que criavam as tarefas com `schtasks /TR` **truncavam o caminho
     no primeiro espaço** — em pastas com espaços (ex.:
     `C:\Users\ilumi\Documents\Dev\Iluminatto Dev\...`) a tarefa ficava
     apontando para um caminho inexistente, mostrava "Pronto"/"LastRun hoje"
     mas **nunca executava nada** (LastTaskResult `0x800710E2`). Se suspeitar,
     confira a ação da tarefa:
     `(Get-ScheduledTask UkeMasterCron).Actions` — o `Execute` deve ser o
     `.cmd` COMPLETO (com espaços) e o `WorkingDirectory` preenchido.
5. **Testa** (com `--test`): roda uma execução rápida — o dedupe garante que
   nada duplica.

### Editar o .env (só a 1ª vez)

```bash
nano dist-cron/.env
```

```text
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-chave
CRON_UKEMATER_EMAIL=ukemaster@ukemasterpro.com.br
CRON_UKEMATER_PASSWORD=senha-da-conta-ukemaster
CRON_TIME_BUDGET_MS=900000
```

> **Conta UkeMaster (obrigatória desde 2026-08)**: o cron agora escreve
> autenticado como o usuário `UkeMaster` do Supabase Auth (não usa mais o
> papel anônimo). Crie a conta **uma vez** com o e-mail/senha acima no
> cadastro do app (ou peça a senha ao proprietário) e configure as duas
> vars `CRON_UKEMATER_*` em TODAS as máquinas + Vercel. Sem elas o cron
> degrada para a anon key — e passa a falhar assim que o RLS de `songs`
> exigir login (supabase/migrations/20260929210000_search_artists_e_rls_chord_dictionary.sql, seção 3 — já aplicada).

---

## 🛠 Caminho B — Instalação manual (só o bundle)

Se preferir não clonar o repositório (ou a máquina não tiver git/npm):

1. Copie a pasta `dist-cron/` gerada em outra máquina:
   ```
   dist-cron/
   ├── ukemaster-cron.mjs   # bundle único (34 KB)
   ├── .env                 # chaves do Supabase
   └── cron.log             # (criado automaticamente)
   ```
2. Crie o `dist-cron/.env` (veja o template em
   `scripts/cron/cron.env.example`).
3. Agende manualmente:

   **Linux/macOS** (`crontab -e`):
   ```
   0 */6 * * * cd /CAMINHO/dist-cron && node ukemaster-cron.mjs >> cron.log 2>&1
   ```

   **Windows** — Agendador de Tarefas (a cada 6 horas):
   - Programa: `C:\CAMINHO\dist-cron\run-cron.cmd` (wrapper; inicia em `dist-cron`)
   - Disparador: diariamente a partir de 00:00, repetindo a cada 6 horas
   - Segunda tarefa (comandos do painel): `run-cron-commands.cmd`, a partir de 00:30,
     repetindo a cada 6 horas

---

## 📦 Variáveis de ambiente (todas opcionais)

| Variável | Padrão | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | — | URL do Supabase (obrigatória) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | — | Chave publishable/anon (obrigatória) |
| `CRON_TIME_BUDGET_MS` | `7200000` | Orçamento por execução (ms). 2 h = 7200000 |
| `CRON_SCHEDULE` | `0 */6 * * *` | Expressão cron (Linux/macOS, usada pelo instalador) |
| `CRON_INTERVAL_HOURS` | `6` | Cadência no Windows (horas) — tarefas `UkeMasterCron` e `UkeMasterCronCommands` |
| `CRON_TASK_NAME` | `UkeMasterCron` | Nome da tarefa no Windows |
| `CRON_UKEMATER_EMAIL` | — | E-mail da conta UkeMaster (autenticação do cron) |
| `CRON_UKEMATER_PASSWORD` | — | Senha da conta UkeMaster (fica no .env da máquina) |
| `CRON_WORKER_NAME` | hostname | Nome DESTA máquina (`acer`, `desktop`...) — alvo da fila de comandos do painel admin |

Argumentos do bundle (modo manual):

```bash
node dist-cron/ukemaster-cron.mjs                     # modo automático (cursor)
node dist-cron/ukemaster-cron.mjs --artist <url>      # 1 artista específico
node dist-cron/ukemaster-cron.mjs --platform cifraclub-br
node dist-cron/ukemaster-cron.mjs --fast              # sem delays (teste)
node dist-cron/ukemaster-cron.mjs --reset             # recomeça a varredura
```

---

## 🎛 Rodada imediata via painel admin (fila de comandos)

O painel admin (área do proprietário) tem a seção **"Rodada Imediata nas
Máquinas (Acer / Desktop)"**: o dono escolhe o alvo (Todas / Acer /
Desktop), opcionalmente liga "Atualizar o que já temos" e clica em disparar.

Isso **grava um comando na tabela `worker_commands`** do Supabase (status
`pending`). No início de **cada execução**, o bundle da máquina consulta os
comandos pendentes para o seu nome (`target=all` ou `target=<CRON_WORKER_NAME>`)
e processa o mais antigo:

```text
pending → processing → done | failed
```

- O PATCH de pega é **atômico** (filtro `status=eq.pending`): se duas
  máquinas tentarem o mesmo comando, só uma vence.
- A rodada do comando **respeita os delays normais** das plataformas
  (qualidade > pressa) e usa o orçamento `CRON_TIME_BUDGET_MS`.
- Se processou ≥ 1 comando, a execução **encerra ali** — o fluxo normal roda
  na próxima rodada (o comando É a rodada daquela vez).
- O painel mostra o status em tempo real (polling a cada 6s enquanto houver
  comando ativo) com o resumo do resultado (novas/atualizadas/duplicadas/erros).
- Comandos finalizados com mais de 24 h são apagados automaticamente.
- **Requisito**: as máquinas precisam rodar o bundle atualizado. Regere e
  redistribua — **de preferência com o script automático**:

  ```bash
  npm run build:cron                       # gera dist-cron/ukemaster-cron.mjs
  node scripts/deploy-workers.mjs          # envia p/ VPS + Desktop, preserva o .env,
                                           # confere hash e (opcional) roda 1 rodada
  ```

  O `scripts/deploy-workers.mjs`:

  | Máquina | Acesso | Observações |
  |---|---|---|
  | **VPS** (`root@100.72.114.76`) | SSH por chave (Tailscale) | destino `/root/ukemaster-cron`; **fica offline** se a VPS estiver desligada (o script avisa) |
  | **Desktop** (`iluminatto@desktop`) | plink/pscp com senha | defina `DESKTOP_PW='<senha>'`; a pasta `dist-cron` é descoberta pela tarefa agendada |
  | **Acer** (opcional) | SSH por chave | configure `ACER_HOST`, `ACER_USER`, `ACER_CRON_DIR` |

  Flags úteis: `--alvo vps|desktop|acer|all` · `--rodada-imediata` (rodada curta
  de 60 s logo após copiar) · `--dry-run` · `--exigir-todas` (erro se alguma
  máquina falhar). O `.env` de cada máquina **nunca é sobrescrito** (só é criado
  se não existir).

  Exemplos:

  ```bash
  node scripts/deploy-workers.mjs --dry-run                    # ver o que faria
  DESKTOP_PW='...' node scripts/deploy-workers.mjs --alvo desktop
  node scripts/deploy-workers.mjs --alvo vps --rodada-imediata
  ```

  Alternativa manual (ou `git pull && npm run build:cron` em cada máquina)
  e defina `CRON_WORKER_NAME=acer / desktop / vps` no `dist-cron/.env`:

---

## 🔄 Sincronização entre as duas máquinas (desktop ↔ notebook-dev)

Registro do processo validado em 2026-10 para espelhar projeto, cron, skills
e CLIs entre o **desktop** (Windows, hostname `DESKTOP`, user `ilumi`) e o
**notebook-dev** (Windows, hostname `Notebook-Dev`, user `ilumi`).

### 1) Acesso remoto sem senha (SSH via Tailscale)

Ambas na rede Tailscale. O notebook é `100.108.235.116` (pode estar suspenso
— valide com `tailscale status | grep -i notebook` e use retry).

Setup (feito 1x no desktop):
```bash
ssh-keygen -t ed25519 -N "" -C ilumi-desktop-ukemaster
# chave pública instalada no notebook em:
#   C:\ProgramData\ssh\administrators_authorized_keys
# (ACL correta: só SYSTEM/Administrators — icacls /inheritance:r /grant "SYSTEM:F" "Administrators:F")
ssh -o BatchMode=yes ilumi@100.108.235.116 "echo ok"
```

**Armadilhas de quoting** (Git Bash local → cmd/PowerShell remoto):
- Preferir `ssh ... "powershell -NoProfile -Command \"...\""` e escapar
  `\$_` para variáveis do PowerShell.
- Para scripts PS complexos: escrever o `.ps1` local, `scp` e executar com
  `-File` (mais confiável que citar na linha).
- `scp -r` **não funciona** com o OpenSSH do Windows (falha "stat remote").
  Para diretórios, use zip (`Compress-Archive`/`Expand-Archive`) ou `tar`.

Path do projeto no notebook:
`C:\Users\ilumi\Documents\Dev\Iluminatto Dev\Marcas\Ukemaster Pro`
(com espaços — sempre via PowerShell, nunca cmd cru).

### 2) Espelhar o repositório (git bundle)

Quando as linhas de histórico divergem (sem ancestral comum), o `git pull`
não resolve. Processo usado:

```bash
# 1. Backup tar completo da pasta antiga da máquina de destino (reversível)
#    (desktop guardou cópia em ~/ukemaster-backups/, destino em C:\Users\ilumi\)

# 2. Empacota o branch main do desktop e envia
git bundle create ukemaster.bundle main
scp ukemaster.bundle ilumi@100.108.235.116:C:/Users/ilumi/

# 3. No notebook: clona do bundle e aponta origin para o GitHub
git clone C:/Users/ilumi/ukemaster.bundle "C:\...\Ukemaster Pro" -b main
git remote set-url origin https://github.com/Iluminatto1970/Ukemaster.git
```

- Legado da linha antiga preservado em `archive/notebook-legacy/`
  (commit `818ae34`) e, no GitHub, no branch `legacy/notebook-old-line`.
- Após espelhar, rodar `npm install` na máquina nova e validar `npx esbuild --version`.
- O push ao GitHub pode exigir `--force-with-lease=<branch>:<hash-atual-remota>`
  quando a main remota divergiu — **preservar a linha antiga num branch antes**.

### 3) Cron nas duas máquinas (sem duplicar)

1. Na máquina nova: `powershell -ExecutionPolicy Bypass -File scripts\cron\install.ps1 -IntervalHours 6`
2. Editar `dist-cron\.env`: `CRON_WORKER_NAME` **distinto por máquina**
   (`desktop` / `notebook`) e copiar as chaves do Supabase da outra máquina.
3. O **lease atômico** (`scrape_state.worker_lease`) garante que só uma
   máquina processa por vez — validado em produção: com o desktop processando,
   o notebook registrou "Outra máquina está processando a fila agora (lease
   ativo)... nada foi processado para evitar duplicação" e encerrou ok.
4. Execução forçada para validar: `Start-ScheduledTask -TaskName UkeMasterCron`
   (e `UkeMasterCronCommands`) — confirmar no `dist-cron\cron.log` /
   `commands.log` um bloco JSON novo com o `"worker"` correto.

### 4) Skills (~/.agents/skills e ~/.claude/skills)

- Biblioteca real: `~/.agents/skills` (504 dirs em ambas as máquinas).
  `~/.claude/skills` pode conter **junctions** apontando para ela (contar
  arquivos direto em `~/.agents/skills`, não na junction).
- Para unir: copiar os diretórios que faltam de uma máquina para a outra
  (zip via scp) — nunca mover, sempre copiar/mesclar.

### 5) CLIs npm globais pareadas

Referência de paridade validada por `npm ls -g --depth=0` nas duas máquinas
(idênticas em 2026-10): `@agentskill.sh/cli`, `@anthropic-ai/claude-code`,
`@earendil-works/pi-coding-agent`, `@iflow-mcp/locomotive-agency-linear-mcp`,
`@mcp-devtools/linear`, `@openai/codex`, `@qwen-code/qwen-code`, `9router`,
`better-sqlite3`, `clerk`, `freebuff`, `mcp-linear`, `melies`, `openclaw`,
`opencode-ai`, `pm2`, `pnpm`, `serve`, `sql.js`, `supabase`, `vercel`.

Para parar uma nova:
```bash
ssh ilumi@100.108.235.116 "npm i -g --no-audit --no-fund pacote@latest --loglevel=error && pacote --version"
```

- O npm do desktop (11.x) **bloqueia scripts de instalação por padrão** —
  se pnpm/esbuild quebrarem pós-install: `npm install-scripts approve pnpm`
  e reinstalar.
- O npm do desktop é lento com muitos pacotes: instalar **um por um** com
  timeout longo e validar cada `--version`. Cache corrompido uma vez
  (`TAR_ENTRY_ERROR`/`ENOTEMPTY`): resolver com `npm cache clean --force`.
- Shims antigos do Chocolatey (`C:\ProgramData\chocolatey\bin\claude.exe`)
  **sombreiam** o npm global — removê-los se conflitarem.

---

## 🔍 Verificação

**1. Log local:**
```bash
tail -20 dist-cron/cron.log
```

**2. Nuvem (Supabase) — quanto importou:**
```sql
-- no SQL Editor do Supabase
select count(*) from songs;
select platform, imported, duplicates, errors, duration_ms, ran_at
from cron_log order by ran_at desc limit 10;
select count(*) from cron_imports;  -- histórico anti-duplicidade
```

**3. Rodada manual imediata:**
```bash
npm run cron:test
```

---

## 🗑 Desinstalar

```bash
npm run cron:uninstall      # ou: bash scripts/cron/uninstall.sh
rm -rf dist-cron            # opcional — apaga bundle/.env/logs locais
```

O histórico na nuvem (`cron_imports`/`cron_log`) **não é apagado** — ao
reinstalar em outra máquina, a varredura continua de onde parou.

---

## 🧠 Como funciona (para não duplicar nada)

- **Cursor persistente** (`scrape_state`): cada rodada processa artistas
  completos e salva onde parou; na próxima, continua. Ao fim da lista,
  recomeça para pegar músicas novas.
- **Dedupe em 3 camadas**: (1) histórico `cron_imports` (chave normalizada
  `título|artista`) → nunca reimporta, mesmo com a nuvem fora; (2) acervo
  atual de `songs`; (3) memória da rodada.
- **Histórico** (`cron_log`): o que cada rodada importou/pulou/errou.
- **Resiliência**: fetch com timeout de 15s + retry educado (429/503);
  orçamento de tempo respeitado; erro num link não derruba a rodada.

### ⚠️ Pré-requisito único: o schema

Antes da 1ª execução, rode **uma vez** o `supabase/schema.sql` no SQL Editor
do Supabase (cria `songs`, `cron_imports`, `cron_log`, `scrape_state`, RLS).
Sem ele o cron **continua funcionando** (importa e dedupa via `songs`), mas
sem histórico/cursor persistente.

---

## 💡 Dicas

- **2+ máquinas**: não precisa defasar agendamentos — o **lease atômico**
  garante que só uma execução processa por vez (a que perde aguarda a
  próxima rodada). O dedupe em 3 camadas é a rede final de segurança.
- **Orçamento**: aumente `CRON_TIME_BUDGET_MS` se quiser sincronizar mais
  rápido (respeitando o site de origem); reduza se a máquina for fraca.
- **Log rotativo**: o `cron.log` cresce pouco; se incomodar, adicione
  `>> cron.log 2>&1` com `logrotate` ou limpe manualmente.
