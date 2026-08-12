# ✅ Checklist — Conta UkeMaster (CRON_UKEMATER_EMAIL/PASSWORD)

O cron do UkeMaster escreve no acervo **autenticado como a conta `UkeMaster`**
do Supabase Auth** (não usa mais o papel anônimo). Isso faz o RLS tratar o
cron como um usuário logado (`auth.uid() = UkeMaster`) — e garante a regra
**"nunca contribuir sem login"**.

Sem as vars `CRON_UKEMATER_EMAIL/PASSWORD`, o cron **degrada para a anon key**
e passa a **falhar** nas escritas assim que o RLS de `songs` exigir login.
Este checklist cobre as **3 frentes** (local/Desktop/Acer + Vercel), o teste
de login e a rodada de validação do cron autenticado.

---

## 0) Pré-requisitos

- [ ] A conta `UkeMaster` **existe** no Supabase Auth.
      Como verificar: Dashboard do Supabase → **Authentication → Users** →
      procurar `ukemaster@ukemasterpro.com.br`.
- [ ] Se **não existir**: criar **uma vez** pelo cadastro do app
      (ukemasterpro.vercel.app → Cadastrar, com esse e-mail + senha forte)
      ou pelo SQL Editor:
      ```sql
      select * from auth.users where email = 'ukemaster@ukemasterpro.com.br';
      ```
      E **confirmar o e-mail** (o password grant falha com e-mail não
      confirmado — `Email not confirmed`).
- [ ] Saber a **senha** da conta (peça ao proprietário se não tiver).
      ⚠️ A senha vive **só** em `.env`/env vars — **nunca** no código,
      no git ou em mensagens de chat.

---

## 1) Máquina de desenvolvimento (Windows — esta)

| # | Passo | Comando |
|---|---|---|
| 1.1 | Editar `.env` (ou `.env.local`) e preencher as duas vars | `CRON_UKEMATER_EMAIL="ukemaster@ukemasterpro.com.br"` e `CRON_UKEMATER_PASSWORD="<senha>"` |
| 1.2 | **Testar o login** (mesmo fluxo do cron) | `node scripts/cron/test-ukemater-login.mjs` |
| 1.3 | Conferir saída | `✅ Login OK — JWT emitido` |

> ✅ = JWT emitido → credenciais corretas e conta confirmada.
> ❌ HTTP 400 → senha errada, conta inexistente ou e-mail não confirmado.

- [ ] **1.1** vars preenchidas no `.env`
- [ ] **1.2** login testado com sucesso

---

## 2) Build + rodada de validação do cron (autenticado)

Com o login OK, gere o bundle e rode uma rodada real **autenticada**:

| # | Passo | Comando |
|---|---|---|
| 2.1 | Gerar o bundle do cron | `npm run build:cron` |
| 2.2 | Rodar uma rodada de validação (rápida, `--fast`, orçamento 20s) | `npm run cron:test` |
| 2.3 | Conferir o log | `tail -20 dist-cron/cron.log` |

O que garante que o cron escreveu **autenticado**:

- [ ] No log, **ausência** de `[cron-auth] login UkeMaster falhou` e de
      `usando anon key` (se aparecerem, as credenciais não chegaram ao .env
      do dist-cron — vá ao passo 3/4).
- [ ] No Supabase (SQL Editor):
      ```sql
      select platform, imported, duplicates, errors, ran_at
      from cron_log order by ran_at desc limit 5;
      ```
      com uma linha nova de `ran_at` agora.
- [ ] **Conferência extra (prova de autenticação)** — no SQL Editor:
      ```sql
      select created_by, count(*) from songs
      where created_by is not null
      group by created_by order by count(*) desc;
      ```
      Deve aparecer o `auth.uid()` do UkeMaster nas linhas novas (o uid fica
      gravado quando o cron escreve logado).

---

## 3) Vercel (produção — cron diário da plataforma)

| # | Passo | Comando |
|---|---|---|
| 3.1 | Adicionar as vars em **Production** (e Preview, se quiser) | `npx vercel env add CRON_UKEMATER_EMAIL production` → colar o valor |
| 3.2 | Idem para a senha | `npx vercel env add CRON_UKEMATER_PASSWORD production` |
| 3.3 | Conferir que estão lá (mostra só o nome, nunca o valor) | `npx vercel env ls` |
| 3.4 | **Redeploy** para as vars entrarem em produção | `npx vercel deploy --prod --yes --project ukemaster` |

- [ ] **3.1/3.2** vars adicionadas (Production)
- [ ] **3.3** visíveis em `vercel env ls`
- [ ] **3.4** redeploy feito
- [ ] **3.5** cron da Vercel rodou e logou: Dashboard da Vercel →
      **Deployments** → rodada do cron (ou aguarde o próximo horário) → no
      Supabase, nova linha em `cron_log` com `source='vercel'`/`ran_at` recente.

> Os crons da Vercel usam `x-vercel-cron: 1`; o middleware já deixa passar.
> O horário do cron está em `vercel.json` (`crons`).

---

## 4) Acer (Linux) — máquina 24/7

| # | Passo | Comando |
|---|---|---|
| 4.1 | Na pasta do projeto no Acer, editar o `.env` do cron | `nano dist-cron/.env` (ou `vi`) |
| 4.2 | Preencher (se ainda não vieram do clone) | `CRON_UKEMATER_EMAIL=ukemaster@ukemasterpro.com.br` e `CRON_UKEMATER_PASSWORD=<senha>` |
| 4.3 | Testar o login no próprio Acer | `node dist-cron/ukemaster-cron.mjs --fast --budget 10000` (ou copiar o `scripts/cron/test-ukemater-login.mjs` e rodar) |
| 4.4 | Conferir o log | `tail -20 dist-cron/cron.log` |
| 4.5 | Garantir o agendamento | `crontab -l \| grep ukemaster` (deve haver a linha `*/30 * * * * ...`) |

- [ ] **4.2** vars preenchidas no `.env` do Acer
- [ ] **4.3** login testado no Acer (sem `falhou`)
- [ ] **4.4** log sem `usando anon key`
- [ ] **4.5** crontab ativo

> 💡 Se o Acer usa o mesmo repositório, lembre-se de **puxar as mudanças**
> (`git pull`) para pegar o `test-ukemater-login.mjs` novo; ou rode o teste
> direto do bundle com `--fast`.

---

## 5) Desktop (Linux Mint) — 2ª máquina (Tailscale, ex-Windows)

Mesmos passos do Acer (crontab — não há mais Agendador de Tarefas):

| # | Passo | Comando |
|---|---|---|
| 5.1 | Editar `dist-cron/.env` | `nano dist-cron/.env` |
| 5.2 | Preencher `CRON_UKEMATER_EMAIL/PASSWORD` | idem 4.2 |
| 5.3 | Testar login | `node dist-cron/ukemaster-cron.mjs --fast --budget 10000` |
| 5.4 | Conferir agendamento | `crontab -l \| grep ukemaster` (idem Acer) |

- [ ] **5.2** vars preenchidas
- [ ] **5.3** login testado
- [ ] **5.4** crontab ativo

> A máquina era Windows (`ilumi`) e migrou para **Linux Mint** — usuário
> `iluminatto` / senha `1a7g3c`, mesmo nome no Tailscale (`desktop`). A tarefa
> antiga do `schtasks` não roda mais; o agendamento é via crontab.
>
> Se as duas máquinas dividem plataformas (`CRON_PLATFORMS`), cada uma só
> precisa das vars — a divisão continua funcionando.

---

## 6) Teste end-to-end (tudo junto)

| # | Verificação | Como |
|---|---|---|
| 6.1 | Login UkeMaster OK | `node scripts/cron/test-ukemater-login.mjs` (exit 0) |
| 6.2 | Cron local escreve autenticado | `npm run cron:test` → log sem `anon key` + `created_by` do UkeMaster nas linhas novas |
| 6.3 | Vercel tem as vars | `npx vercel env ls` |
| 6.4 | Cron da Vercel roda | nova linha em `cron_log` após o horário do cron |
| 6.5 | Acer/Desktop rodam | `cron_log` com entradas das máquinas (quem processou cada artista) |

---

## 🧯 Troubleshooting

| Sintoma | Causa provável | Correção |
|---|---|---|
| `login UkeMaster falhou (HTTP 400)` | Senha errada / e-mail não confirmado | Reenviar confirmação em Authentication → Users; trocar a senha |
| `Invalid login credentials` | E-mail digitado diferente do cadastro | Conferir o e-mail exato (case-sensitive no banco) |
| `usando anon key` no log | Vars não chegaram ao `.env` do `dist-cron` | Recopiar do `.env` (o bundle lê `dist-cron/.env` na máquina) |
| Cron da Vercel sem logs novos | Redeploy não foi feito após adicionar vars | `npx vercel deploy --prod --yes --project ukemaster` |
| 429 no login repetido | Password grant com rate limit do Supabase | O cron já espera 5 min entre retries; não fique testando em loop |

---

## 🔁 Resumo dos comandos-chave

```bash
# Teste de login (mesmo fluxo do cron)
node scripts/cron/test-ukemater-login.mjs

# Rodada de validação (20s, sem delays)
npm run cron:test
tail -20 dist-cron/cron.log

# Vercel
npx vercel env add CRON_UKEMATER_EMAIL production
npx vercel env add CRON_UKEMATER_PASSWORD production
npx vercel env ls
npx vercel deploy --prod --yes --project ukemaster

# Acer/Desktop (na máquina)
nano dist-cron/.env            # CRON_UKEMATER_* 
node dist-cron/ukemaster-cron.mjs --fast --budget 10000
crontab -l | grep ukemaster   # Linux (Acer e Desktop)
# schtasks /query /tn UkeMasterCron   # só se ainda houver resquício do Windows
```
