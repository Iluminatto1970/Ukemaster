# Supabase — UkeMaster Pro

## Estado (2026-09-29)

O banco remoto (projeto `UkemasterPro`, ref `asvjdjawaenxrlwdyziy`) está
**sincronizado** com `supabase/migrations/` — `supabase db push` responde
"Database is up to date".

## Ordem de aplicação em banco NOVO

1. `schema.sql` — tabelas base (o CLI não gerencia este arquivo; rode no SQL Editor).
2. `security-policies.sql` — políticas iniciais de RLS (⚠️ contém o modelo antigo
   de escrita aberta; as migrations 20260929210000_* aplicadas depois corrigem
   songs e chord_dictionary).
3. `supabase db push` — aplica todas as migrations em ordem (as 13 do dia
   19/09 criam a stack de busca ukm_*/search_songs; as duas de 29/09 criam
   search_artists e fecham o RLS).

## Rotina de desenvolvimento

```bash
supabase link --project-ref asvjdjawaenxrlwdyziy   # uma vez (login já feito)
supabase db pull        # ✗ NÃO funciona neste projeto: o histórico do banco foi
                        #   criado fora do CLI (db pull diverge); migrations do
                        #   banco são extraídas de supabase_migrations.schema_migrations
supabase db push --yes  # aplica migrations novas do repo
supabase db query --linked "SELECT 1"   # SQL direto no remoto
```

## Arquivos legados (referência — não gerenciados pelo CLI)

- `schema.sql` / `security-policies.sql` — schema de referência para banco novo.
  `security-policies.sql` descreve o modelo antigo (escrita aberta); o modelo
  atual vale o que está nas migrations + Dashboard.

## Migrations

| Arquivo | O que fez |
|---|---|
| `20260919214747_ukm_search_functions.sql` … `20260919224843_*` (13) | Stack de busca: `ukm_norm`, `ukm_immutable_unaccent`, `search_songs`, correção de acentos, índices trigram/norm |
| `20260929210000_search_artists_e_rls_chord_dictionary.sql` | RPC `search_artists`, RLS do `chord_dictionary` (escrita aberta, delete só admin), grants de songs fechados ao anon + policies explícitas |
| `20260929220000_chord_dictionary_policies_legadas.sql` | Remove policies legadas que furavam o delete exclusivo do admin |

## Verificação pós-migração (validada em 2026-09-29)

```
POST rpc/search_artists {q:"clapton",lim:5} → 200  [{"artist":"Eric Clapton","songs_count":170}]
POST chord_dictionary (anon)                → 201
PATCH songs (anon)                          → 401
POST rpc/search_songs {q,lim,off}           → 200 (intacta)
policies songs           = select_public / insert_auth / update_auth / delete_admin
policies chord_dictionary = select / insert / update / delete_admin (sem ALL)
```
