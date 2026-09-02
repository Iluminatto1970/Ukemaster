-- Migration: enforce non-anonymous inserts on song_comments
-- Idempotent: drop existing policy and recreate with role check
DROP POLICY IF EXISTS "song_comments_insert" ON public.song_comments;
CREATE POLICY "song_comments_insert" ON public.song_comments
  FOR INSERT WITH CHECK (auth.role() <> 'anonymous');
