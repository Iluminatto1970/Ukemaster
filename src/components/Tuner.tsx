/**
 * Afinador: microfone + detecção de pitch em tempo real, com indicação de afinação por corda (G C E A).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { autoCorrelate, analyzePitch, PitchResult, TARGET_STRINGS, TARGET_STRINGS_LOW_G } from '../utils/pitchDetector';
import { startContinuousTone, stopContinuousTone, playPluckedNote } from '../utils/audio';
import { useT } from '../lib/i18n';
import { useToolSeo } from '../hooks/useToolSeo';
import { Mic, MicOff, Volume2, Radio, CheckCircle2, AlertCircle, RotateCcw, VolumeX } from 'lucide-react';

export const Tuner: React.FC = () => {
  const { t } = useT();

  // SEO: JSON-LD WebApplication para afinador
  useToolSeo({
    slug: 'afinador',
    title: 'Afinador de Ukulele Online Grátis',
    description: 'Afinador de ukulele online com microfone em tempo real. Afine seu ukulele pelas notas G, C, E, A com precisão. Alto-falante de referência incluído.',
    url: `${window.location.origin}/afinador`,
    applicationCategory: 'MultimediaApplication',
  });

  const [tunerMode, setTunerMode] = useState<'mic' | 'reference'>('mic');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isLowG, setIsLowG] = useState<boolean>(false);
  const [selectedStringLock, setSelectedStringLock] = useState<number | null>(null); // null = auto detect

  // Pitch results state
  const [pitchResult, setPitchResult] = useState<PitchResult | null>(null);
  const [activeRefString, setActiveRefString] = useState<number | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  // Audio Context & Stream Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Request microphone permission exactly once on mount; reuse the stream forever.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
      } catch (err) {
        if (!cancelled) {
          console.error('Microphone permission denied:', err);
          setMicError(t('tuner.micError'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targets = isLowG ? TARGET_STRINGS_LOW_G : TARGET_STRINGS;

  const stopListening = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsListening(false);
    setPitchResult(null);
  }, []);

  // Full cleanup: stops mic tracks and closes audio context. Used on unmount.
  const releaseMic = useCallback(() => {
    stopListening();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, [stopListening]);

  const startListening = async () => {
    setMicError(null);
    try {
      // Assume stream already requested on mount
      const stream = streamRef.current;
      if (!stream) {
        setMicError(t('tuner.micError'));
        setIsListening(false);
        return;
      }
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsListening(true);

      const buffer = new Float32Array(analyser.fftSize);

      const updatePitch = () => {
        if (!analyserRef.current || ctx.state === 'closed') return;
        analyserRef.current.getFloatTimeDomainData(buffer);

        const { pitch } = autoCorrelate(buffer, ctx.sampleRate);
        if (pitch !== -1) {
          const res = analyzePitch(pitch, isLowG, selectedStringLock || undefined);
          if (res) {
            setPitchResult(res);
          }
        } else {
          setPitchResult((prev) => (prev ? { ...prev, clarity: 0 } : null));
        }
        animFrameRef.current = requestAnimationFrame(updatePitch);
      };

      updatePitch();
    } catch (err) {
      console.error('Microphone access error:', err);
      setMicError(t('tuner.micError'));
      setIsListening(false);
    }
  };

  useEffect(() => {
    return () => {
      releaseMic();
      stopContinuousTone();
    };
  }, [releaseMic]);

  // Handle reference tone play
  const handleToggleRefTone = (stringNum: number, freq: number) => {
    if (activeRefString === stringNum) {
      stopContinuousTone();
      setActiveRefString(null);
    } else {
      stopContinuousTone();
      startContinuousTone(freq);
      setActiveRefString(stringNum);
    }
  };

  const handlePluckRefNote = (freq: number) => {
    playPluckedNote(freq, 1.8, 0.7);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header & Mode Switcher */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-stone-100 flex items-center gap-2">
            <Radio className="w-6 h-6 text-amber-500 animate-pulse" />
            {t('tuner.title')}
          </h2>
          <p className="text-stone-400 text-sm mt-1">
            {t('tuner.subtitle')}
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex bg-stone-950 p-1.5 rounded-xl border border-stone-800 shrink-0">
          <button
            onClick={() => {
              setTunerMode('mic');
              stopContinuousTone();
              setActiveRefString(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tunerMode === 'mic'
                ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Mic className="w-4 h-4" /> {t('tuner.mic')}
          </button>
          <button
            onClick={() => {
              setTunerMode('reference');
              stopListening();
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tunerMode === 'reference'
                ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Volume2 className="w-4 h-4" /> {t('tuner.ear')}
          </button>
        </div>
      </div>

      {/* Main Tuner Card */}
      {tunerMode === 'mic' ? (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 text-center">
          {/* Tuning Options Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-stone-950 p-3 rounded-xl border border-stone-800/80">
            {/* Low G option */}
            <label className="flex items-center gap-2 text-xs font-semibold text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isLowG}
                onChange={(e) => setIsLowG(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
              {t('tuner.lowG')}
            </label>

            {/* String selector lock */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-stone-400 font-medium mr-1">{t('tuner.targetString')}</span>
              <button
                onClick={() => setSelectedStringLock(null)}
                className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                  selectedStringLock === null
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                }`}
              >
                {t('tuner.auto')}
              </button>
              {targets.map((tg) => (
                <button
                  key={tg.stringNumber}
                  onClick={() => setSelectedStringLock(tg.stringNumber)}
                  className={`px-2.5 py-1 rounded text-xs font-bold font-mono cursor-pointer ${
                    selectedStringLock === t.stringNumber
                      ? 'bg-amber-500 text-stone-950'
                      : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  {tg.stringNumber}ª ({tg.noteName[0]})
                </button>
              ))}
            </div>
          </div>

          {/* Tuner Gauge Display */}
          <div className="relative py-8 flex flex-col items-center justify-center">
            {/* Needle Gauge SVG */}
            <div className="relative w-full max-w-[320px] h-40">
              <svg viewBox="0 0 200 110" className="w-full h-full overflow-visible">
                {/* Arc Background */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#152138"
                  strokeWidth="12"
                  strokeLinecap="round"
                />

                {/* Target In-Tune Zone (centro) */}
                <path
                  d="M 92 21 A 80 80 0 0 1 108 21"
                  fill="none"
                  stroke="#0E7C7B"
                  strokeWidth="14"
                  strokeLinecap="round"
                  className="drop-shadow-[0_0_8px_rgba(14,124,123,0.5)]"
                />

                {/* Ticks */}
                {[-50, -30, -10, 0, 10, 30, 50].map((c) => {
                  const angle = (c / 50) * 70; // -70 deg to +70 deg
                  const rad = (angle - 90) * (Math.PI / 180);
                  const x1 = 100 + 70 * Math.cos(rad);
                  const y1 = 100 + 70 * Math.sin(rad);
                  const x2 = 100 + 82 * Math.cos(rad);
                  const y2 = 100 + 82 * Math.sin(rad);
                  return (
                    <line
                      key={c}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={c === 0 ? '#0E7C7B' : '#6C7E93'}
                      strokeWidth={c === 0 ? 3 : 1.5}
                    />
                  );
                })}

                {/* Needle */}
                {pitchResult && isListening && pitchResult.clarity > 0 && (
                  <g
                    style={{
                      transform: `rotate(${ (pitchResult.cents / 50) * 70 }deg)`,
                      transformOrigin: '100px 100px',
                      transition: 'transform 0.1s ease-out',
                    }}
                  >
                    <line
                      x1="100"
                      y1="100"
                      x2="100"
                      y2="24"
                      stroke={
                        pitchResult.isInTune
                          ? '#0E7C7B'
                          : Math.abs(pitchResult.cents) < 18
                          ? '#F6AE2D'
                          : '#C13B2C'
                      }
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                    <circle cx="100" cy="100" r="7" fill="#F6AE2D" />
                  </g>
                )}
              </svg>

              {/* Pitch status text inside gauge */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
                {pitchResult && isListening && pitchResult.clarity > 0 ? (
                  <>
                    <span
                      className={`text-4xl font-black font-mono tracking-tight ${
                        pitchResult.isInTune
                          ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(14,124,123,0.8)]'
                          : 'text-amber-400'
                      }`}
                    >
                      {pitchResult.targetNote}
                    </span>
                    <span className="text-xs text-stone-400 font-mono mt-1">
                      {pitchResult.frequency} Hz • {pitchResult.cents > 0 ? `+${pitchResult.cents}` : pitchResult.cents} cents
                    </span>
                  </>
                ) : (
                  <span className="text-stone-500 text-sm font-medium">
                    {isListening ? t('tuner.pluckString') : t('tuner.micOff')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Feedback Status Box */}
          {pitchResult && isListening && pitchResult.clarity > 0 ? (
            <div
              className={`p-4 rounded-xl border flex items-center justify-center gap-3 ${
                pitchResult.isInTune
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : pitchResult.cents < 0
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              {pitchResult.isInTune ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-sm">
                    {t('tuner.inTune').replace('{n}', String(pitchResult.stringNumber)).replace('{note}', pitchResult.targetNote)}
                  </span>
                </>
              ) : pitchResult.cents < 0 ? (
                <>
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                  <span className="font-bold text-sm">
                    {t('tuner.below').replace('{n}', String(pitchResult.stringNumber)).replace('{note}', pitchResult.targetNote)}
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                  <span className="font-bold text-sm">
                    {t('tuner.above').replace('{n}', String(pitchResult.stringNumber)).replace('{note}', pitchResult.targetNote)}
                  </span>
                </>
              )}
            </div>
          ) : null}

          {/* Mic Toggle Button */}
          <div className="pt-2 flex flex-col items-center">
            {isListening ? (
              <button
                onClick={stopListening}
                className="px-6 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm transition-all shadow-lg flex items-center gap-2 cursor-pointer"
              >
                <MicOff className="w-4 h-4" /> {t('tuner.disableMic')}
              </button>
            ) : (
              <button
                onClick={startListening}
                className="px-8 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-base transition-all shadow-xl shadow-amber-500/20 flex items-center gap-2 cursor-pointer scale-105"
              >
                <Mic className="w-5 h-5" /> {t('tuner.startTuning')}
              </button>
            )}

            {micError && (
              <p className="text-rose-400 text-xs mt-3 bg-rose-500/10 p-3 rounded-lg border border-rose-500/20 max-w-md">
                {micError}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Reference Tone Mode */
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="text-center max-w-md mx-auto">
            <h3 className="text-xl font-bold text-stone-100">{t('tuner.referenceTitle')}</h3>
            <p className="text-stone-400 text-xs mt-1">
              {t('tuner.referenceSubtitle')}
            </p>
          </div>

          {/* Ukulele Headstock UI Representation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto py-4">
            {targets.map((tg) => {
              const isActive = activeRefString === tg.stringNumber;
              return (
                <div
                  key={tg.stringNumber}
                  className={`bg-stone-950 border rounded-2xl p-5 flex items-center justify-between transition-all ${
                    isActive
                      ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10 scale-102'
                      : 'border-stone-800 hover:border-amber-500/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-bold text-lg font-mono">
                        {tg.noteName}
                      </span>
                      <span className="text-xs bg-stone-800 text-stone-300 px-2 py-0.5 rounded font-mono">
                        {tg.freq} Hz
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 mt-1 font-medium">{tg.display}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Pluck Once button */}
                    <button
                      onClick={() => handlePluckRefNote(tg.freq)}
                      title={t('tuner.pluck')}
                      className="p-2.5 rounded-xl bg-stone-900 text-stone-300 hover:bg-stone-800 hover:text-amber-400 transition-colors cursor-pointer border border-stone-800"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>

                    {/* Continuous Tone Toggle */}
                    <button
                      onClick={() => handleToggleRefTone(tg.stringNumber, tg.freq)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                        isActive
                          ? 'bg-amber-500 text-stone-950 animate-pulse'
                          : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                      }`}
                    >
                      {isActive ? (
                        <>
                          <VolumeX className="w-4 h-4" /> {t('tuner.stop')}
                        </>
                      ) : (
                        <>
                          <Radio className="w-4 h-4" /> {t('tuner.continuous')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center">
            {activeRefString && (
              <button
                onClick={() => {
                  stopContinuousTone();
                  setActiveRefString(null);
                }}
                className="text-xs text-stone-400 hover:text-amber-400 underline font-medium cursor-pointer"
              >
                {t('tuner.stopAll')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Conteúdo editorial educativo — guia completo de afinação (AdSense: substantial original content, 1000+ words) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-6">
        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <Radio className="w-5 h-5 text-amber-500" /> Como Afinar seu Ukulele — Guia Completo
        </h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-amber-800">🎵 Afinação Padrão (GCEA)</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              A afinação padrão do ukulele soprano, concert e tenor é <strong>G-C-E-A</strong> (Sol, Dó, Mi, Lá) —
              da 4ª corda (mais grossa) para a 1ª (mais fina). O sol (G) da 4ª corda pode ser
              <strong> agudo (High G)</strong> ou <strong>grave (Low G)</strong> dependendo do cordame.
              Cada corda deve vibrar em uma frequência exata para que o instrumento soe harmonioso.
              Uma afinação incorreta de apenas uma corda faz todos os acordes soarem desafinados,
              mesmo que as outras três estejam perfeitas. Por isso, afinar é a primeira coisa
              que todo ukulelist deve aprender antes de tocar qualquer música.
            </p>
          </div>

          <div className="bg-[#0E7C7B]/5 border border-[#0E7C7B]/20 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-[#0E7C7B]">🎸 High G vs Low G</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              O <strong>High G</strong> (sol agudo) é o padrão — dá aquele som "ukulele" característico,
              com a 4ª corda soando mais aguda que a 3ª. O <strong>Low G</strong> (sol grave) expande a
              faixa de notas e permite baixos mais profundos, ideal para fingerstyle e solos.
              No modo Low G, a 4ª corda soa uma oitava abaixo, criando um efeito mais parecido
              com uma guitarra. Muitos profissionais preferem o Low G para performances
              solo, enquanto o High G é perfeito para accompany (acompanhamento vocal).
              Ative a opção &quot;Low G&quot; acima para alternar e ouvir a diferença.
            </p>
          </div>

          <div className="bg-orange-50/80 border border-orange-200 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-orange-800">💡 Dicas para Afinar Bem</h4>
            <ul className="text-xs text-slate-600 leading-relaxed space-y-1.5 list-disc list-inside">
              <li><strong>Ambiente silencioso:</strong> ruídos interferem na detecção pelo microfone. Desligue ventiladores, TV e converse baixo.</li>
              <li><strong>Cordas novas:</strong> levam 1-2 semanas para estabilizar. Afine várias vezes ao dia nos primeiros dias.</li>
              <li><strong>Ordem correta:</strong> afine de BAIXO para CIMA (4ª → 3ª → 2ª → 1ª corda) para não sobrecarregar o cravo.</li>
              <li><strong>Tensão da corda:</strong> puxe com firmeza e constância — soltar no meio faz o afinador perder a referência.</li>
              <li><strong>Nunca afine para CIMA:</strong> se passou da nota, volte um pouco e suba devagar. Ajustar só para cima tensiona demais a corda e pode quebrá-la.</li>
              <li><strong>Verifique o cravo e o pestana:</strong> se o ukulele não "segura" a afinação, o cravo pode estar solto ou a pestana desgastada.</li>
            </ul>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-slate-800">🔊 Tabela de Frequências</h4>
            <p className="text-[10px] text-slate-500 leading-relaxed mb-2">
              Frequências exatas para afinação por afinador digital ou por ouvido com referência de 440 Hz:
            </p>
            <div className="space-y-1">
              {[
                { note: '4ª corda — G (Sol)', freq: '392 Hz', hz: '392.00', nota: 'G4' },
                { note: '3ª corda — C (Dó)', freq: '262 Hz', hz: '261.63', nota: 'C4' },
                { note: '2ª corda — E (Mi)', freq: '330 Hz', hz: '329.63', nota: 'E4' },
                { note: '1ª corda — A (Lá)', freq: '440 Hz', hz: '440.00', nota: 'A4' },
              ].map((s) => (
                <div key={s.note} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">{s.note}</span>
                  <span className="font-mono font-bold text-slate-800">{s.freq} <span className="text-slate-400">({s.hz} Hz, {s.nota})</span></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-xl p-5 space-y-3">
          <h4 className="text-sm font-extrabold text-amber-900">🏆 Como Afinar Passo a Passo (Para Iniciantes)</h4>
          <ol className="text-xs text-slate-700 leading-relaxed space-y-2 list-decimal list-inside">
            <li><strong>Abra este afinador</strong> e clique em "Iniciar Microfone". Conceda permissão quando o navegador pedir.</li>
            <li><strong>Comece pela 4ª corda (G/Sol)</strong> — puxe a corda com o polegar, segurando por 2-3 segundos com constância.</li>
            <li><strong>Observe o indicador:</strong> se estiver vermelho para a esquerda, a corda está "mole" (abaixar a tensão). Se estiver vermelho para a direita, está "apertada" (afrouxar).</li>
            <li><strong>Ajuste o tarraxa</strong> lentamente — giros pequenos de 1/4 de volta. Cada tarraxa controla uma corda: girar no sentido horário aperta (sobe a nota), anti-horário afrouxa (desce).</li>
            <li><strong>Quando o indicador ficar verde</strong> no centro, a corda está afinada! Passe para a próxima.</li>
            <li><strong>Repita para todas as 4 cordas</strong> na ordem: G → C → E → A. Depois, volte e verifique a G novamente — as cordas interferem umas nas outras.</li>
            <li><strong>Teste acordes:</strong> toque C (apenas 3ª corda, casa 3) e Am (apenas 4ª corda, casa 2). Se soarem limpos e harmoniosos, seu ukulele está pronto!</li>
          </ol>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-blue-800">🔄 Por que o Ukulele Desafina Tanto?</h4>
            <ul className="text-xs text-slate-600 leading-relaxed space-y-1.5 list-disc list-inside">
              <li><strong>Cordas de nylon:</strong> são mais elásticas que as de aço e esticam mais com mudanças de temperatura e umidade.</li>
              <li><strong>Novidade:</strong> cordas recém-colocadas podem levar até 2 semanas para "assentar" — é normal afinar várias vezes ao dia.</li>
              <li><strong>Temperatura:</strong> calor expande o braço e desce a afinação; frio contrai e sobe.</li>
              <li><strong>Umidade:</strong> o corpo de madeira absorve e libera umidade, alterando a tensão das cordas.</li>
              <li><strong>Cravo:</strong> se o cravo não encaixa firme no tampo, ele pode "escorregar" e soltar as cordas.</li>
            </ul>
          </div>

          <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-purple-800">🎵 Afinações Alternativas</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Além da padrão GCEA, existem outras afinações populares para ukulele:
            </p>
            <ul className="text-xs text-slate-600 leading-relaxed space-y-1.5 list-disc list-inside">
              <li><strong>D-Tuning (ADF#B):</strong> uma terça acima da padrão — som mais brilliante e agudo, comum em ukuleles antigos.</li>
              <li><strong>Baritone (D-G-B-E):</strong> afinação igual às 4 cordas graves da guitarra — ideal para quem troca de instrumento.</li>
              <li><strong>C-Tuning com Low G:</strong> a padrão mas com a 4ª corda uma oitava abaixo — mais versátil para solos.</li>
            </ul>
          </div>
        </div>

        <div className="bg-stone-900 rounded-xl p-4 text-center">
          <p className="text-xs text-stone-400 leading-relaxed max-w-2xl mx-auto">
            <strong className="text-amber-400">Modo Referência:</strong> Use os tons de referência para afinar
            pelo ouvido — toque o som da corda desejada e compare com o que toca no seu ukulele.
            Desenvolver o ouvido é a habilidade mais importante para todo músico. Comece tocando
            a nota de referência e depois reproduza no instrumento — com prática, você vai perceber
            pequenas diferenças que o microfone não pega.
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <h4 className="text-sm font-extrabold text-slate-800 mb-2">❓ Perguntas Frequentes</h4>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-700">Posso usar este afinador no celular?</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">Sim! Este afinador funciona em qualquer dispositivo com navegador moderno (Chrome, Safari, Firefox). Basta permitir o acesso ao microfone.</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700">Meu ukulele não afina — o que fazer?</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">Verifique se o cravo está bem encaixado no tampo e se a pestana não está danificada. Cordas muito velhas também perdem a capacidade de segurar afinação — troque-as a cada 3-6 meses.</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700">Qual a diferença entre afinador online e de aparelho?</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">Afinadores de aparelho (clip-on) usam vibração no braço, enquanto os online usam o microfone. Os online são mais precisos em ambientes silenciosos, mas os clip-on funcionam melhor em locais barulhentos.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
