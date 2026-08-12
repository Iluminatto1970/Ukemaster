# ☁️ Supabase — Sincronização em Nuvem do UkeMaster Pro

O app **continua 100% funcional sem Supabase** (tudo em `localStorage`). Ao
configurar as 2 chaves abaixo, o acervo público (músicas, playlists,
repertórios públicos e leads) passa a ser **compartilhado em nuvem** entre
todos os usuários e dispositivos — e é sincronizado de forma transparente,
com fallback automático para local se a nuvem estiver fora.

---

## Passo a passo (5 minutos)

### 1. Crie o projeto grátis

1. Acesse **[supabase.com](https://supabase.com/)** → **Start your project** (grátis, sem cartão).
2. Escolha uma região próxima (ex.: `South America (São Paulo)`), defina uma senha forte e crie.

### 2. Rode o SQL das tabelas

1. No painel do Supabase, vá em **SQL Editor → New query**.
2. Cole o conteúdo de **[`supabase/schema.sql`](supabase/schema.sql)** e clique em **Run**.
   - Cria as tabelas: `leads`, `songs`, `playlists`, `repertoires`.
   - Habilita RLS com políticas **abertas** (dados públicos — todo mundo lê e escreve) e
     `leads` **só aceita INSERT** (captura, sem leitura anônima).

### 3. Copie as chaves

1. No painel: **Project Settings → API**.
2. Copie **Project URL** → `VITE_SUPABASE_URL`
3. Copie a **anon public key** (ou a **publishable key** `sb_publishable_...`)
   → `VITE_SUPABASE_ANON_KEY`

> O app aceita tanto a chave anon antiga (`eyJ...`) quanto a nova
> **publishable key** (`sb_publishable_...`) — e também os nomes no padrão
> Next.js (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`),
> já que o `vite.config.ts` expõe ambos os prefixos ao cliente.

### 4. Configure no seu computador (dev local)

Crie/edite o arquivo **`.env.local`** na raiz do projeto:

```bash
VITE_SUPABASE_URL="https://SEU-PROJETO.supabase.co"
VITE_SUPABASE_ANON_KEY="sb_publishable_..."
```

> **Projeto atual do UkeMaster Pro:** `https://asvjdjawaenxrlwdyziy.supabase.co`
> (chaves já configuradas no `.env.local` local).

Reinicie o servidor de dev (`npm run dev`) e pronto — o app passa a sincronizar.

### 5. Configure na Vercel (produção)

1. Em **[vercel.com](https://vercel.com/) → Seu Projeto → Settings → Environment Variables**.
2. Adicione as **mesmas variáveis** — de preferência com os nomes que o
   Supabase já te deu (`NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) ou os equivalentes `VITE_*`.
3. Faça um **Deploy** (ou `npx vercel --prod --yes`).

---

## Como funciona a sincronização

| Dado | Tabela | Comportamento |
|---|---|---|
| Músicas do acervo | `songs` | Nuvem substitui o local se houver dados; alterações são enviadas (debounce 1s) |
| Playlists | `playlists` | Idem acima |
| Repertório por usuário | `repertoires` | Uma linha por `user_id` do Clerk; ao trocar de conta, carrega o daquela conta |
| Repertório público (comunidade) | `repertoires` (`is_public = true`) | A seção "Repertórios Públicos" lê da nuvem (fallback: registro local) |
| Leads do cadastro | `leads` | INSERT na nuvem; fallback local se falhar |

**Detalhe importante:** como as políticas são abertas (dados públicos), o
repertório de cada usuário fica identificado pelo `user_id` — se você não
quiser que os repertórios privados fiquem legíveis por qualquer pessoa com
a anon key, troque a policy `repertoires_all` por uma que só permita leitura
de `is_public = true`. Para o estágio atual (tudo aberto), está assim mesmo.

## Verificação rápida

1. Abra o site, edite/adicione uma música → em 1s ela sobe para a nuvem.
2. Abra em **outro navegador/dispositivo** (anônimo) → a música aparece no acervo.
3. `Supabase → Table Editor → songs` → veja as linhas chegando em tempo real.

## Desativar

Basta remover as 2 variáveis de ambiente (ou apagá-las do `.env.local` e da
Vercel) e fazer deploy — o app volta ao modo 100% local sem perder nada.
