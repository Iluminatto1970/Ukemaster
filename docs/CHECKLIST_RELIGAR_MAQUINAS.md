# 🖥️ Checklist — Religar o Acer e o Windows com o bundle novo

As máquinas estão paradas (última atividade: **06/08 ~08:34 UTC**). Este guia
religa cada uma, atualiza o bundle do cron e valida que voltaram a trabalhar
— usando a **fila `worker_commands`** (comando de rodada imediata já
enfileirado com `target=all` — a primeira máquina com o bundle novo que rodar
vai pegá-lo automaticamente).

> ⏱️ Tempo total: ~10 min por máquina. Sem risco: o lease atômico + dedupe em
> 3 camadas impedem duplicação mesmo com as duas ligadas ao mesmo tempo.

---

## 0) Estado atual (07/08)

- **Acervo**: 5.276 músicas (353 com conteúdo vazio — serão reparadas nas
  próximas rodadas de atualização)
- **Cursor da fila**: artista 15 (as máquinas continuam daí)
- **Comando na fila**: 1 × `pending` (`target=all`, rodada completa)
- **Vercel**: cron diário registrado, mas **não dispara** (plano Hobby) — as
  máquinas são o motor principal

---

## 1) Ligar a máquina e checar pré-requisitos

| Item | Como verificar |
|---|---|
| Máquina ligada + internet | ping no Supabase: `curl -s https://asvjdjawaenxrlwdyziy.supabase.co > /dev/null && echo OK` |
| Node ≥ 18 | `node -v` (se faltar: https://nodejs.org) |
| Projeto clonado | `cd /CAMINHO/UkeMaster` (ou copie a pasta `dist-cron/` de outra máquina) |

---

## 2) Atualizar o código e gerar o bundle NOVO

**Atenção**: o `install.sh` só gera o bundle se ele **não existir** — para
atualizar, rode o build manualmente:

```bash
# na raiz do projeto:
git pull                                  # traz a feature nova (fila + status)
npm install                               # só se o node_modules estiver incompleto
npm run build:cron                        # gera dist-cron/ukemaster-cron.mjs NOVO
```

Confira que o bundle é novo (o tamanho agora é ~134 KB):

```bash
ls -la dist-cron/ukemaster-cron.mjs
```

---

## 3) Configurar o `dist-cron/.env`

Confira (e ajuste se faltar) as linhas abaixo — **sem espaços ao redor do `=`**:

```bash
nano dist-cron/.env    # ou notepad dist-cron\.env no Windows
```

```text
NEXT_PUBLIC_SUPABASE_URL=https://asvjdjawaenxrlwdyziy.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-chave
CRON_UKEMATER_EMAIL=ukemaster@ukemasterpro.com.br
CRON_UKEMATER_PASSWORD=senha-da-conta-ukemaster
CRON_TIME_BUDGET_MS=900000

# NOME DESTA MÁQUINA — obrigatório para o painel identificá-la:
CRON_WORKER_NAME=acer        # ← no Acer
# CRON_WORKER_NAME=windows   # ← no Windows

# Divisão por idioma (opcional — deixa vazio para rodar tudo):
# CRON_PLATFORMS=cifraclub-br,ufret-ja     # Acer: pt + japonês
# CRON_PLATFORMS=ukutabs-en,guitaretab-int # Windows: en + internacional
```

> O `install.sh` pode regerar esse arquivo a partir do `.env.local` do projeto
> (`bash scripts/cron/install.sh`), mas se o `.env` já existir ele **não
> sobrescreve** — edite à mão com os valores acima.

---

## 4) Garantir o agendamento (roda a cada 30 min)

**Acer (Linux/macOS)** — confira a linha do crontab:

```bash
crontab -l | grep ukemaster
# deve aparecer: */30 * * * * cd "/CAMINHO/dist-cron" && node ukemaster-cron.mjs >> cron.log 2>&1
```

Se não existir, instale: `bash scripts/cron/install.sh`

**Windows** — confira a tarefa:

```bat
schtasks /Query /TN UkeMasterCron
```

Se não existir, instale pelo Git Bash como Administrador:
`bash scripts/cron/install.sh`

---

## 5) Teste de login UkeMaster (o cron precisa autenticar)

```bash
node scripts/cron/test-ukemaster-login.mjs
# Esperado: "✅ Login OK" com o e-mail ukemaster@ukemasterpro.com.br
```

Se falhar, confira `CRON_UKEMATER_EMAIL/PASSWORD` no `dist-cron/.env`
(acumulado daí em diante a fila não funciona — o cron degrada e roda com anon).

---

## 6) Rodada manual de validação (opcional, mas recomendado)

Roda 1 vez na hora, sem esperar o agendamento (a 1ª execução também já pega o
**comando pendente** da fila):

```bash
cd dist-cron && node ukemaster-cron.mjs --fast --budget 20000
```

Saída esperada **com o bundle novo** — uma destas:

```json
{ "worker": "acer", "commandsProcessed": 1, "message": "Comandos do painel processados..." }
//   ↑ PAGOU o comando de rodada imediata — o fluxo normal fica para a próxima rodada
```

ou (se o comando já foi consumido pela outra máquina):

```json
{ "ok": true, "worker": "acer", "totalImported": ..., "artistsProcessed": ... }
```

---

## 7) Validar que a máquina está de volta (2 locais)

**A) No painel admin** (`ukemasterpro.vercel.app` → Área do Administrador →
**Status das Máquinas**):
- A máquina religada deve aparecer como **🟢 ATIVA** (última atividade recente)
- A linha da outra máquina deve continuar **🔴 PARADA** até ela ser religada
- Na seção **Rodada Imediata**: o comando enfileirado deve estar **`done`**
  com o resumo (ex.: `+12 novas, 0 atualizadas, 0 dup, 3 err`)

**B) No Supabase** (SQL Editor) — confirme o worker gravado:

```sql
select ran_at, worker, artist_url, imported, errors
from cron_log order by ran_at desc limit 10;
-- Esperado: linhas com worker = 'acer' e/ou 'windows' (não mais null)
```

---

## 8) Liberar o próximo passo (opcional)

Assim que as duas estiverem ATIVAS, você pode paralelizar por idioma usando
`CRON_PLATFORMS` (passo 3) — ou deixar as duas rodando tudo (o **lease**
alterna quem processa a cada 30 min, sem duplicar).

---

## 🛟 Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Nada acontece ao rodar o bundle | `.env` sem `CRON_UKEMATER_*` | passo 3 + passo 5 |
| Comando da fila continua `pending` | bundle antigo (sem suporte à fila) | refazer `npm run build:cron` (passo 2) |
| `ERR_MODULE_NOT_FOUND` | bundle desatualizado | `git pull && npm run build:cron` |
| `schtasks` pede senha/nega | precisa de Administrador | abrir Git Bash como Admin |
| Máquina roda mas log fica com `worker=null` | bundle antigo | `npm run build:cron` de novo |
| Painel mostra lease preso | máquina caiu no meio | expira sozinho em 25 min (TTL) |
