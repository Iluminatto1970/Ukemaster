# Backup e Restauração dos MCPs

Se o PC der pau, você trocar de máquina ou quiser levar as configurações
(MCPs + tokens) para outro ambiente, use os scripts desta pasta.

**Resumo:** `scripts/backup-mcp.mjs` junta TUDO num único JSON; `scripts/restore-mcp.mjs` aplica na máquina nova com merge (não apaga o que já existe) e backup `.bak` de segurança.

**Destino recomendado:** repositório **privado** `Iluminatto1970/ukemaster-mcp-backup`
(GitHub) — os backups são enviados para lá com `scripts/push-mcp-backup.mjs`.
A pasta `mcp-backup/` do projeto é um repo git próprio (ignorado pelo git
principal), apontando para esse destino.

---

## O que é coletado

| Fonte | Arquivo | Como entra no backup |
|---|---|---|
| **Projeto** | `.mcp.json` (na raiz do repo) | `mcpServers` (Supabase, Context7, Hostinger DNS/Domains) |
| **Claude Code** | `~/.claude.json` | só o bloco `mcpServers` (nunca o histórico/estado) |
| **Claude Desktop** | `claude_desktop_config.json` | arquivo inteiro |
| **VS Code** | `User/mcp.json` | arquivo inteiro (servers + inputs) |
| **Env vars** | shell + `.env.local` do projeto | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `HOSTINGER_API_TOKEN`, `CTX7_API_KEY` |

> ⚠️ **O backup contém TOKENS SECRETOS** (Supabase, Hostinger, Context7).
> Guarde o arquivo em local seguro: pendrive, cofre de senhas ou repositório
> **privado criptografado**. **NUNCA** envie para o git — a pasta
> `mcp-backup/` está no `.gitignore` justamente para isso.

---

## Como fazer o backup (nesta máquina)

**1. Backup + envio automático (recomendado):**

```bash
node scripts/push-mcp-backup.mjs
```

Gera `mcp-backup/mcp-backup-<data>.json` e faz commit + push no repositório
privado `ukemaster-mcp-backup`. Use `--dry-run` para só gerar sem enviar.

**2. Só gerar o arquivo local:**

```bash
node scripts/backup-mcp.mjs
```

Gera `mcp-backup/mcp-backup-<data>.json` (a pasta é criada automaticamente e
é ignorada pelo git).

**Opções:**

| Flag | Efeito |
|---|---|
| `--out <caminho>` | Salva em outro local (ex.: pendrive `D:/backups/mcp.json`) |
| `--mask` | Mascara os tokens — **não restaurável** (útil só para inspecionar sem expor segredos) |

**Outro destino (pendrive, nuvem criptografada):**

```bash
node scripts/backup-mcp.mjs --out "D:/backups/mcp-ukemaster.json"
```

---

## Como restaurar (em outra máquina / PC novo)

### Passo 1 — Clone o projeto e tenha o arquivo do backup

```bash
git clone <url-do-repo-ukemaster>
cd UkeMaster
# opção A: puxe o backup do repositório privado
cd mcp-backup && git pull && cd ..
# opção B: copie o backup de um pendrive
cp "D:/backups/mcp-ukemaster.json" ./
```

### Passo 2 — Rode o restore

```bash
node scripts/restore-mcp.mjs mcp-ukemaster.json
```

O script:
1. **Valida** o formato (recusa backups com `--mask` — tokens ocultos não são restauráveis);
2. **Calcula os caminhos na máquina atual** (funciona em Windows, macOS e Linux);
3. **Faz merge**:
   - `.mcp.json` do projeto e `~/.claude.json` → mescla `mcpServers` por nome (servidores do backup vencem; os que você já tinha e não estão no backup ficam);
   - Claude Desktop e VS Code → merge top-level (chaves do backup vencem);
4. **Salva um `.bak-<timestamp>`** de cada arquivo antes de alterar (se algo der errado, dá para voltar);
5. **Mostra** as env vars que ficaram de fora (não são gravadas por padrão).

### Passo 3 — Env vars (tokens `${...}`)

Os MCPs do projeto usam placeholders `${SUPABASE_ACCESS_TOKEN}` etc. no
`.mcp.json`. Depois do restore você precisa das env vars:

**Opção A — automática (recomendada):** grava as env vars do backup no
`.env.local` do projeto:

```bash
node scripts/restore-mcp.mjs mcp-ukemaster.json --env-local
```

**Opção B — manual:** configure no seu ambiente (ex. `.bashrc`, painel da
Vercel, ou em cada app):

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...
export SUPABASE_PROJECT_REF=asvjdjawaenxrlwdyziy
export HOSTINGER_API_TOKEN=...
export CTX7_API_KEY=...
```

> Para **outros apps fora do projeto** (Claude Code/Desktop/VS Code globais),
> o restore já escreve as configs nos arquivos globais de cada um — só as env
> vars que dependem do ambiente você ajusta na mão (ou pelo seu gerenciador
> de segredos).

### Passo 4 — Reinicie os apps

**Claude Code, Claude Desktop e VS Code carregam os MCPs apenas no início da
sessão** — feche e abra o app para as configurações valerem.

---

## Testar antes (modo seguro)

Não quer mexer em nada ainda? Veja o que o restore faria:

```bash
node scripts/restore-mcp.mjs mcp-ukemaster.json --dry-run
```

Imprime cada arquivo que seria criado/mesclado e onde, **sem escrever nada**.

---

## FAQ

**O backup com `--mask` dá para restaurar?**
Não — o script recusa. Gere um backup completo (sem `--mask`).

**O restore apaga minhas configs atuais?**
Não. É sempre **merge**: as chaves do backup vencem, mas o que você já tinha
(e não está no backup) permanece. E ainda salva `.bak-<timestamp>` de cada
arquivo antes de tocar.

**Posso rodar o restore mais de uma vez?**
Sim. É idempotente (merge por nome), e cada execução salva um `.bak` novo.

**E se eu só quiser levar os MCPs, sem o resto do projeto?**
Copie apenas o arquivo JSON do backup — os scripts lêem o backup de qualquer
lugar (`--out` / caminho do arquivo). Mas o restore do `.mcp.json` do projeto
precisa estar dentro do repo (ele escreve na raiz).
