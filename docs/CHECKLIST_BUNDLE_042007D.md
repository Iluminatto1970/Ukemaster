# 📦 Checklist — Atualizar Acer + Desktop com o bundle novo (042007d)

> **O que muda neste bundle**: extrator do **Ultimate-Guitar** (nova plataforma EN ativada), **hard cap de 120 músicas/artista no modo fast** (B'z não pendura mais) e suporte a **worker `desktop`** (Linux Mint — a 2ª máquina migrou de Windows).
>
> Bundle: `dist-cron/ukemaster-cron.mjs` — **142,5 KB** · md5 **`317a2cdeec77894920fbb531d57ad1d0`** (antigo: `4a94d695…`)
> Commit: `042007d` (branch `analysis-work`)

---

## 1) Copiar o bundle para as máquinas

O bundle já foi regenerado na máquina de desenvolvimento. Escolha UMA das opções por máquina:

**Opção A — copiar o arquivo (rápido):**
```bash
# na máquina de desenvolvimento:
scp dist-cron/ukemaster-cron.mjs iluminatto@<ip-acer>:~/ukemaster-cron/
scp dist-cron/ukemaster-cron.mjs iluminatto@<ip-desktop>:~/ukemaster-cron/
```

**Opção B — git pull + build na própria máquina (recomendado se clonou o repo):**
```bash
cd /CAMINHO/UkeMaster
git pull origin analysis-work
npm install          # só se o node_modules estiver incompleto
npm run build:cron
```

Confira o md5 nas duas:
```bash
md5sum ~/ukemaster-cron/ukemaster-cron.mjs
# Esperado: 317a2cdeec77894920fbb531d57ad1d0
```

---

## 2) Conferir o `.env` do `dist-cron` (ou `~/ukemaster-cron/.env`)

```bash
nano dist-cron/.env    # em cada máquina
```

```text
NEXT_PUBLIC_SUPABASE_URL=https://asvjdjawaenxrlwdyziy.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sua-chave
CRON_UKEMATER_EMAIL=ukemaster@ukemasterpro.com.br
CRON_UKEMATER_PASSWORD=senha-da-conta-ukemaster
CRON_TIME_BUDGET_MS=900000

# NOME DESTA MÁQUINA — obrigatório para o painel identificá-la:
CRON_WORKER_NAME=acer        # ← no Acer
# CRON_WORKER_NAME=desktop   # ← no Desktop (Linux Mint)

# Divisão por idioma (opcional — deixa vazio para rodar tudo):
# CRON_PLATFORMS=cifraclub-br,ufret-ja     # Acer: pt + japonês
# CRON_PLATFORMS=ultimate-guitar-en,guitaretab-int # Desktop: EN + internacional
```

> O **Desktop** pode rodar SEM `CRON_WORKER_NAME` — o painel e a fila já normalizam o hostname `desktop-qkmmsjr` → `desktop` por prefixo. Mas defini-lo deixa o card do painel mais limpo.
>
> 💡 **Sugestão de divisão agora**: com o Ultimate-Guitar ativo (EN), coloque `CRON_PLATFORMS=ultimate-guitar-en,guitaretab-int` no Desktop e deixe o Acer com `cifraclub-br,ufret-ja`.

---

## 3) Garantir o agendamento (crontab — as duas são Linux)

```bash
crontab -l | grep ukemaster
# deve aparecer: */30 * * * * cd "/CAMINHO/dist-cron" && node ukemaster-cron.mjs >> cron.log 2>&1
```

Se não existir: `bash scripts/cron/install.sh`

> No Desktop, se ainda houver a tarefa antiga do Windows (`schtasks /TN UkeMasterCron`), ela **não roda mais** — pode remover ou ignorar.

---

## 4) Teste de login UkeMaster (o cron precisa autenticar)

```bash
node scripts/cron/test-ukemaster-login.mjs
# Esperado: "✅ Login OK" com ukemaster@ukemasterpro.com.br
```

Se falhar, confira `CRON_UKEMATER_EMAIL/PASSWORD` no `.env`.

---

## 5) Rodada de validação em cada máquina

Roda 1 artista com o bundle novo, sem esperar o agendamento:

**Acer** (valida o extrator U-FRET — o hard cap do B'z):
```bash
cd dist-cron && node ukemaster-cron.mjs --platform ufret-ja --artist "https://www.ufret.jp/artist.php?data=B'z" --budget 120000
```
> O B'z tem 477 músicas. **Antes** do hard cap, o modo fast pendurava até o fim. **Agora** encerra em até 120 links/artista. Confira que a rodada **termina** (não fica presa) e que o JSON final aparece com `ok: true`.

**Desktop** (valida o extrator Ultimate-Guitar — EN):
```bash
cd dist-cron && node ukemaster-cron.mjs --platform ultimate-guitar-en --artist "https://www.ultimate-guitar.com/tabs/adele_tabs.htm" --budget 180000
```
> Valida a paginação (6 páginas) + letra completa. Esperado: dezenas de duplicatas (já existem no acervo) e poucas novas.

Saída esperada (JSON no fim):
```json
{ "ok": true, "worker": "<acer|desktop>", "totalImported": ..., "totalDuplicates": ..., "totalErrors": ... }
```

> ⚠️ **Sem `--fast`**: use delays normais nas máquinas (qualidade > pressa e respeito ao site de origem).

---

## 6) Validar no painel admin (ukemasterpro.vercel.app → Área do Administrador)

- **Status das Máquinas**: Acer e Desktop devem aparecer 🟢 ATIVA (última atividade recente). O Desktop aparece como **`desktop`** (mesmo rodando com hostname `desktop-qkmmsjr`).
- **Cron de Plataformas**: o card **Ultimate-Guitar (EN)** deve estar **Ativa • 25 artistas** (verde).
- **Rodada Imediata**: dispare "Rodar no Acer" ou "Rodar no Desktop" — o comando deve virar `done` na próxima execução (até 30 min).

No Supabase (SQL Editor):
```sql
select ran_at, worker, platform, imported, errors
from cron_log order by ran_at desc limit 15;
-- Esperado: linhas com worker 'acer' e 'desktop', incluindo plataforma
-- 'Ultimate-Guitar (EN — maior acervo do mundo)'
```

---

## 🛟 Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| md5 não bate | bundle antigo na máquina | recopiar (passo 1) |
| `ERR_MODULE_NOT_FOUND` | bundle desatualizado/corrompido | `git pull && npm run build:cron` |
| Rodada do B'z presa | bundle antigo (sem hard cap) | conferir md5 = `317a2cde…` |
| UG não importa nada | bundle antigo (sem extrator) | conferir md5 + card "Ativa" no painel |
| `worker=null` no log | bundle antigo | refazer build (passo 1) |
| Comando da fila fica `pending` | máquina sem o bundle novo | passos 1–2 |
