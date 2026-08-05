# Login com Google (Supabase OAuth) — Guia de Configuração

O app já tem o botão **"Continuar com Google"** no modal de login/cadastro
(`src/components/AuthModal.tsx`). Ele usa o fluxo OAuth PKCE nativo do Supabase
(`/auth/v1/authorize?provider=google`), então **nenhuma dependência ou chave
precisa ficar no código**. Só falta habilitar o provider Google nos dois painéis
abaixo — ~5 minutos, uma única vez.

---

## Passo 1 — Criar as credenciais no Google Cloud Console

1. Acesse <https://console.cloud.google.com/apis/credentials> (logado na conta
   Google que será a "dona" do login).
2. **Crie um projeto** (ou selecione um existente) no seletor no topo.
3. Clique em **+ Criar credenciais → ID do cliente OAuth**.
4. Se o aviso "Precisa configurar a tela de consentimento" aparecer, clique em
   **Configurar tela de consentimento**:
   - User Type: **Externo**
   - Preencha nome do app (ex.: "UkeMaster Pro") e o e-mail de suporte
   - Em "Escopos", adicione: `.../auth/userinfo.email` e `.../auth/userinfo.profile`
   - Em "Usuários de teste" pode deixar vazio (em produção fica aberto) e salvar
5. De volta em **Criar credenciais → ID do cliente OAuth**:
   - Application type: **Aplicativo da web**
   - **URIs de redirecionamento autorizados** — adicione EXATAMENTE:
     ```
     https://asvjdjawaenxrlwdyziy.supabase.co/auth/v1/callback
     http://localhost:3000/auth/v1/callback
     ```
   - Clique em **Criar**
6. Copie o **ID do cliente** e o **Segredo do cliente** (aparecem no popup/lista).

> O URI de redirecionamento SEMPRE aponta para o Supabase
> (`https://SEU_REF.supabase.co/auth/v1/callback`) — é o Supabase quem recebe o
> code do Google e devolve para o app. **Não** coloque o domínio do site aqui.

---

## Passo 2 — Ativar o Google no painel do Supabase

1. Acesse <https://supabase.com/dashboard> → projeto **asvjdjawaenxrlwdyziy**.
2. Menu lateral: **Authentication → Providers**.
3. Encontre **Google** e clique em **Ativar (Enable)**.
4. Cole o **Client ID** e o **Client Secret** do passo 1.
5. Salve (o "Skip non-email characters" pode ficar desligado).

---

## Passo 3 — Adicionar a Redirect URL do app

1. No mesmo painel: **Authentication → URL Configuration**.
2. Em **Redirect URLs**, adicione:
   ```
   https://ukemasterpro.vercel.app/auth/callback
   http://localhost:3000/auth/callback
   ```
3. Salve. Sem isso o Supabase rejeita o retorno com `Invalid redirect`.

---

## Passo 4 — Desligar a confirmação de e-mail (recomendado)

O cadastro por e-mail + senha só entra direto se **"Confirm email"** estiver
**desligado** em **Authentication → Sign In / Up → Email**. Isso não afeta o
Google (OAuth sempre autentica na hora), mas é necessário para o fluxo de
e-mail/senha não exigir clicar em link de confirmação.

---

## Como funciona (para referência)

1. Usuário clica em **Continuar com Google** no modal.
2. O app gera um `code_verifier` (PKCE), guarda no localStorage e redireciona
   para `https://asvjdjawaenxrlwdyziy.supabase.co/auth/v1/authorize?provider=google&...`.
3. O Google pede a permissão; o Supabase recebe o code e devolve o navegador
   para `https://ukemasterpro.vercel.app/auth/callback?code=...`.
4. O `AuthProvider` detecta o `?code=`, troca pela sessão
   (`POST /auth/v1/token?grant_type=pkce`), salva no localStorage, limpa a URL
   e autentica — o usuário entra sem cadastrar senha.

**Verificação rápida:** após configurar, abra o site → Entrar → Continuar com
Google. Se voltar logado com o nome/avatar, está funcionando. O novo usuário
aparece em **Authentication → Users** no Supabase.
