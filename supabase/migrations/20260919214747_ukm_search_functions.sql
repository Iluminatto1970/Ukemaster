-- Restaurada do histórico do banco (aplicada em 2026-09-19)
-- =============================================================
-- UkeMaster Pro: funções de normalização para busca (títulos/artistas
-- sem acento consistente no banco). Usadas pela RPC search_songs.
-- =============================================================

-- 1) Extensões: unaccent (remove acentos) + pg_trgm (busca fuzzy/trigram)
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- 2) unaccent em forma IMMUTABLE (a original é STABLE por depender de
--    search_path do dicionário — exigência do Postgres p/ usar em índice)
create or replace function public.ukm_immutable_unaccent(txt text)
returns text
language sql
immutable
parallel safe
set search_path = extensions, public
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, txt);
$$;

-- 3) Normalização padrão de termos: minúsculas + sem acento + espaços colapsados
create or replace function public.ukm_norm(term text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(
           regexp_replace(
             coalesce(public.ukm_immutable_unaccent(lower(term)), ''),
             '\s+', ' ', 'g'
           )
         );
$$;

-- 4) Texto pesquisável de uma música (mesma expressão usada no índice GIN).
--    ASSINATURA FIXA: a RPC e o índice devem usar exatamente esta função.
create or replace function public.ukm_song_search_text(
  p_title   text,
  p_artist  text,
  p_category text,
  p_tags    jsonb,
  p_lang    text
)
returns text
language sql
immutable
parallel safe
as $$
  select public.ukm_norm(
    coalesce(p_title, '')    || ' ' ||
    coalesce(p_artist, '')   || ' ' ||
    coalesce(p_category, '') || ' ' ||
    coalesce(p_tags::text, '') || ' ' ||
    coalesce(p_lang, '')
  );
$$;
