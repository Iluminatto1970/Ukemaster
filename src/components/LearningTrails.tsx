/**
 * Trilhas de Aprendizado: caminhos guiados de ukulele (iniciante → avançado).
 * Cada trilha é uma sequência de passos — DICAS (teoria/prática) e MÚSICAS
 * (abrem a cifra do acervo). O progresso fica no localStorage por dispositivo
 * (chave ukemaster_trails_progress_v1) e pode ser resetado pelo usuário.
 *
 * Ao concluir 100% de uma trilha, o usuário pode EMITIR UM CERTIFICADO de
 * conclusão (CertificateModal) — o certificado fica salvo em localStorage
 * (ukemaster_certificates_v1) e pode ser revisto/re-baixado em "Meus
 * certificados".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Song } from '../types';
import {
  LEARNING_TRAILS,
  LearningTrail,
  TrailLevel,
  trailTotalMinutes,
} from '../data/learningTrails';
import { CertificateModal, CertificateData } from './CertificateModal';
import { useT } from '../lib/i18n';
import {
  GraduationCap,
  Check,
  ChevronRight,
  ChevronLeft,
  Play,
  Clock,
  Lightbulb,
  Music,
  RotateCcw,
  Trophy,
  Award,
  X,
} from 'lucide-react';

const PROGRESS_KEY = 'ukemaster_trails_progress_v1';
const CERTIFICATES_KEY = 'ukemaster_certificates_v1';

interface LearningTrailsProps {
  songs: Song[];
  onSelectSong: (song: Song) => void;
  /** Nome do usuário logado (pré-preenche o certificado). */
  userName?: string;
}

/** Hash djb2 simples (escolha determinística estável entre renders). */
const hashStr = (str: string): number => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h;
};

/**
 * Busca a música no acervo:
 * - com songCategory (≠ 'Todos'): filtra a categoria e escolhe uma cifra de forma
 *   determinística (nunca "falha" se a categoria tiver músicas);
 * - com 'Todos'/sem categoria: escolhe qualquer música do acervo;
 * - com título/artista: match case-insensitive (exato, depois includes).
 */
const findSongInCatalog = (
  songs: Song[],
  title?: string,
  artist?: string,
  category?: string,
  seed?: string
): Song | null => {
  const norm = (s: string) => s.trim().toLowerCase();
  if (category && category !== 'Todos') {
    const pool = songs.filter(
      (s) => (s.category || '').trim().toLowerCase() === category.toLowerCase()
    );
    if (pool.length > 0) return pool[hashStr(`${seed ?? ''}|${category}`) % pool.length];
    return null;
  }
  if (songs.length > 0 && !title) return songs[hashStr(seed ?? '') % songs.length];
  if (!title || !artist) return null;
  return (
    songs.find(
      (s) => norm(s.title) === norm(title) && norm(s.artist) === norm(artist)
    ) ??
    songs.find(
      (s) => norm(s.title).includes(norm(title)) && norm(s.artist).includes(norm(artist))
    ) ??
    null
  );
};

const LEVEL_STYLES: Record<TrailLevel, { gradient: string; text: string; dot: string }> = {
  iniciante: {
    gradient: 'from-[#0E7C7B] to-[#25D366]',
    text: 'text-emerald-600',
    dot: 'bg-[#25D366]',
  },
  intermediario: {
    gradient: 'from-[#F26419] to-[#F6AE2D]',
    text: 'text-[#F26419]',
    dot: 'bg-[#F26419]',
  },
  avancado: {
    gradient: 'from-[#1D2D44] to-[#6C4AB6]',
    text: 'text-[#6C4AB6]',
    dot: 'bg-[#6C4AB6]',
  },
};

export const LearningTrails: React.FC<LearningTrailsProps> = ({
  songs,
  onSelectSong,
  userName = '',
}) => {
  const { t } = useT();

  // Progresso por trilha: { [trailId]: string[] } — ids dos passos concluídos
  const [progress, setProgress] = useState<Record<string, string[]>>(() => {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch {
      // cota cheia/privado — progresso fica só na sessão
    }
  }, [progress]);

  // Certificados emitidos: { [trailId]: CertificateData }
  const [certificates, setCertificates] = useState<Record<string, CertificateData>>(() => {
    try {
      const raw = localStorage.getItem(CERTIFICATES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CERTIFICATES_KEY, JSON.stringify(certificates));
    } catch {
      // cota cheia/privado — fica só na sessão
    }
  }, [certificates]);

  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  const [certModalTrailId, setCertModalTrailId] = useState<string | null>(null);
  const [showMyCertificates, setShowMyCertificates] = useState<boolean>(false);

  const selectedTrail = useMemo(
    () => LEARNING_TRAILS.find((tr) => tr.id === selectedTrailId) ?? null,
    [selectedTrailId]
  );
  const certModalTrail = useMemo(
    () => LEARNING_TRAILS.find((tr) => tr.id === certModalTrailId) ?? null,
    [certModalTrailId]
  );

  const toggleStep = (trailId: string, stepId: string) => {
    setProgress((prev) => {
      const done = prev[trailId] ?? [];
      const next = done.includes(stepId)
        ? done.filter((id) => id !== stepId)
        : [...done, stepId];
      return { ...prev, [trailId]: next };
    });
  };

  const resetTrail = (trailId: string) => {
    setProgress((prev) => ({ ...prev, [trailId]: [] }));
  };

  const progressFor = (trail: LearningTrail) => (progress[trail.id] ?? []).length;
  const isTrailDone = (trail: LearningTrail) => progressFor(trail) === trail.steps.length;
  const hasCertificate = (trail: LearningTrail) => !!certificates[trail.id];

  const emitCertificate = (trailId: string, data: CertificateData) => {
    setCertificates((prev) => ({ ...prev, [trailId]: data }));
  };

  // ── Trilha aberta: sequência de passos ─────────────────────────────────
  if (selectedTrail) {
    const trail = selectedTrail;
    const doneCount = progressFor(trail);
    const pct = Math.round((doneCount / trail.steps.length) * 100);
    const style = LEVEL_STYLES[trail.level];
    const allDone = isTrailDone(trail);

    return (
      <div className="space-y-5 max-w-4xl mx-auto">
        {/* Voltar + título da trilha */}
        <button
          onClick={() => setSelectedTrailId(null)}
          className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[#0E7C7B] transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" /> {t('trails.backToTrails')}
        </button>

        <div
          className={`rounded-2xl bg-gradient-to-br ${style.gradient} text-white p-5 shadow-lg`}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl">{trail.emoji}</span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/80">
                {t(`trails.level.${trail.level}`)}
              </p>
              <h2 className="text-lg font-black leading-tight">{t(trail.titleKey)}</h2>
              <p className="text-xs text-white/90 mt-0.5">{t(trail.descriptionKey)}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-white/25 overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-black whitespace-nowrap">
              {doneCount}/{trail.steps.length}
            </span>
          </div>
        </div>

        {allDone && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-bold text-amber-700 min-w-0">
              <Trophy className="w-4 h-4 shrink-0 text-amber-500" /> {t('trails.completedTrail')}
            </span>
            <button
              onClick={() => setCertModalTrailId(trail.id)}
              className={`ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black tracking-wider uppercase shadow-sm transition-all cursor-pointer ${
                hasCertificate(trail)
                  ? 'bg-[#0E7C7B] hover:bg-[#0A5F5E] text-white'
                  : 'bg-[#F26419] hover:bg-[#D9530D] text-white'
              }`}
            >
              <Award className="w-4 h-4" />
              {hasCertificate(trail) ? t('cert.view') : t('cert.get')}
            </button>
          </div>
        )}

        {/* Passos */}
        <ol className="space-y-3">
          {trail.steps.map((step, idx) => {
            const isDone = (progress[trail.id] ?? []).includes(step.id);
            const song = findSongInCatalog(
              songs,
              step.songTitle,
              step.songArtist,
              step.songCategory,
              step.id
            );
            const isTip = step.type === 'tip';
            return (
              <li
                key={step.id}
                className={`rounded-2xl border p-4 transition-all ${
                  isDone
                    ? 'border-emerald-300 bg-emerald-50/70'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Número do passo + check */}
                  <button
                    onClick={() => toggleStep(trail.id, step.id)}
                    title={t('trails.markDone')}
                    aria-pressed={isDone}
                    className={`mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      isDone
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 text-slate-400 hover:bg-emerald-100 hover:text-emerald-600 border border-slate-200'
                    }`}
                  >
                    {isDone ? <Check className="w-4 h-4" /> : <span className="text-xs font-black">{idx + 1}</span>}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                          isTip
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {isTip ? (
                          <>
                            <Lightbulb className="w-3 h-3" /> {t('trails.tip')}
                          </>
                        ) : (
                          <>
                            <Music className="w-3 h-3" /> {t('trails.song')}
                          </>
                        )}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400">
                        <Clock className="w-3 h-3" /> {step.minutes} {t('trails.min')}
                      </span>
                    </div>

                    <h3
                      className={`mt-1.5 text-sm font-extrabold leading-snug ${
                        isDone ? 'text-emerald-800' : 'text-[#1D2D44]'
                      }`}
                    >
                      {t(step.titleKey)}
                    </h3>

                    {isTip && step.textKey && (
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                        {t(step.textKey)}
                      </p>
                    )}

                    {!isTip && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => song && onSelectSong(song)}
                          disabled={!song}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black tracking-wider uppercase transition-all cursor-pointer ${
                            song
                              ? 'bg-[#F26419] hover:bg-[#D9530D] text-white shadow-sm active:scale-[0.98]'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" /> {t('trails.toPlay')}
                        </button>
                        {song ? (
                          <span className="text-[11px] font-semibold text-slate-500 truncate">
                            {song.title} — {song.artist}
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-600">
                            {t('trails.songNotFound')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Botão concluído (texto) — alternativa ao círculo */}
                  <button
                    onClick={() => toggleStep(trail.id, step.id)}
                    className={`shrink-0 self-start text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                      isDone
                        ? 'bg-emerald-500 text-white'
                        : 'text-slate-400 hover:text-[#0E7C7B]'
                    }`}
                  >
                    {isDone ? t('trails.done') : t('trails.markDoneShort')}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        {/* Resetar progresso */}
        <div className="flex justify-end">
          <button
            onClick={() => resetTrail(trail.id)}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-[#F26419] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> {t('trails.reset')}
          </button>
        </div>

        {/* Modal do certificado */}
        <CertificateModal
          isOpen={!!certModalTrail}
          trail={certModalTrail}
          existing={certModalTrail ? certificates[certModalTrail.id] ?? null : null}
          defaultName={userName}
          onEmit={(data) => certModalTrail && emitCertificate(certModalTrail.id, data)}
          onClose={() => setCertModalTrailId(null)}
        />
      </div>
    );
  }

  // ── Lista de trilhas ────────────────────────────────────────────────────
  const issuedCount = Object.keys(certificates).length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-11 h-11 rounded-2xl bg-[#0E7C7B]/10 text-[#0E7C7B] flex items-center justify-center">
          <GraduationCap className="w-6 h-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-[#1D2D44] leading-tight">
            {t('trails.title')}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 max-w-xl leading-relaxed">
            {t('trails.subtitle')}
          </p>
        </div>
        {issuedCount > 0 && (
          <button
            onClick={() => setShowMyCertificates(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F6AE2D]/15 text-[#F26419] text-[11px] font-black uppercase tracking-wider hover:bg-[#F6AE2D]/25 transition-colors cursor-pointer"
          >
            <Award className="w-4 h-4" /> {t('cert.myCertificates')}
            <span className="px-1.5 py-0.5 rounded-full bg-[#F26419] text-white text-[9px] font-mono font-bold">
              {issuedCount}
            </span>
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {LEARNING_TRAILS.map((trail) => {
          const style = LEVEL_STYLES[trail.level];
          const doneCount = progressFor(trail);
          const pct = Math.round((doneCount / trail.steps.length) * 100);
          const done = isTrailDone(trail);
          const certified = hasCertificate(trail);
          return (
            <button
              key={trail.id}
              onClick={() => setSelectedTrailId(trail.id)}
              className="group text-left rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br ${style.gradient} flex items-center justify-center text-2xl shadow-sm`}
                >
                  {trail.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[9px] font-black uppercase tracking-widest ${style.text}`}>
                    {t(`trails.level.${trail.level}`)}
                  </p>
                  <h3 className="text-sm font-black text-[#1D2D44] leading-tight">
                    {t(trail.titleKey)}
                  </h3>
                </div>
                {certified && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-wider px-2 py-1">
                    <Award className="w-3 h-3" /> {t('cert.certificate')}
                  </span>
                )}
                {!certified && done && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-wider px-2 py-1">
                    <Trophy className="w-3 h-3" /> {t('trails.done')}
                  </span>
                )}
              </div>

              <p className="mt-2.5 text-xs text-slate-500 leading-relaxed line-clamp-2">
                {t(trail.descriptionKey)}
              </p>

              <div className="mt-3.5 flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      done ? 'bg-emerald-500' : 'bg-[#F26419]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] font-black text-slate-400 whitespace-nowrap">
                  {doneCount}/{trail.steps.length} · {trailTotalMinutes(trail)} {t('trails.min')}
                </span>
              </div>

              <div className="mt-3.5 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#0E7C7B] group-hover:gap-2.5 transition-all">
                  {doneCount > 0 ? t('trails.continue') : t('trails.start')}
                  <ChevronRight className="w-4 h-4" />
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  {trail.steps.length} {t('trails.steps')}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Modal "Meus certificados" */}
      {showMyCertificates && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm"
            onClick={() => setShowMyCertificates(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F6AE2D]/15 text-[#F26419] flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-black text-[#1D2D44]">{t('cert.myCertificates')}</h3>
              </div>
              <button
                onClick={() => setShowMyCertificates(false)}
                title={t('cert.close')}
                className="p-2 rounded-xl text-slate-400 hover:text-[#F26419] hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 max-h-[65vh] overflow-y-auto space-y-2.5">
              {issuedCount === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8 px-4 leading-relaxed">
                  {t('cert.noCertificates')}
                </p>
              ) : (
                LEARNING_TRAILS.filter((tr) => certificates[tr.id]).map((tr) => {
                  const cert = certificates[tr.id];
                  return (
                    <div
                      key={tr.id}
                      className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3.5"
                    >
                      <span className="shrink-0 w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl">
                        {tr.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-[#1D2D44] truncate">
                          {t(tr.titleKey)}
                        </p>
                        <p className="text-[11px] text-slate-500 truncate">
                          {cert.name} · {cert.number}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {t('cert.issuedOn')}{' '}
                          {new Date(`${cert.date}T12:00:00`).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setShowMyCertificates(false);
                          setCertModalTrailId(tr.id);
                        }}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0E7C7B] hover:bg-[#0A5F5E] text-white text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        <Award className="w-3.5 h-3.5" /> {t('cert.view')}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal do certificado (quando abre a partir de "Meus certificados") */}
      <CertificateModal
        isOpen={!!certModalTrail}
        trail={certModalTrail}
        existing={certModalTrail ? certificates[certModalTrail.id] ?? null : null}
        defaultName={userName}
        onEmit={(data) => certModalTrail && emitCertificate(certModalTrail.id, data)}
        onClose={() => setCertModalTrailId(null)}
      />
    </div>
  );
};
