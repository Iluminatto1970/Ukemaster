/**
 * Metrônomo do UkeMaster — som via Web Audio (sem arquivos), BPM com tap
 * tempo, subdivisões (semínima, colcheia, tercina, semicolcheia), compassos
 * (2/4, 3/4, 4/4, 6/8) e pulso visual. O áudio só inicia após um gesto do
 * usuário (requisito dos navegadores).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Timer, HeartPulse } from 'lucide-react';

const clampBpm = (bpm: number) => Math.max(30, Math.min(240, bpm));

export const Metronome: React.FC = () => {
  const [bpm, setBpm] = useState<number>(90);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [subdivision, setSubdivision] = useState<string>('1/4');
  const [timeSig, setTimeSig] = useState<{ beats: number; unit: number }>({ beats: 4, unit: 4 });
  const [beat, setBeat] = useState<number>(-1); // -1 = parado

  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextTimeRef = useRef<number>(0);
  const currentStepRef = useRef<number>(0);
  const bpmRef = useRef(bpm);
  const subRef = useRef(subdivision);
  const sigRef = useRef(timeSig);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);
  useEffect(() => {
    subRef.current = subdivision;
  }, [subdivision]);
  useEffect(() => {
    sigRef.current = timeSig;
  }, [timeSig]);

  const getCtx = (): AudioContext => {
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as any).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  };

  const subdivisionsPerBeat: Record<string, number> = {
    '1/4': 1,
    '1/8': 2,
    '1/8T': 3,
    '1/16': 4,
  };

  // Passo atual em frações de compasso: [0, total-1]. Em ref para o
  // scheduler ler o valor ATUAL mesmo com compasso/subdivisão trocados em
  // plena execução (sem closure stale).
  const totalStepsRef = useRef(timeSig.beats * subdivisionsPerBeat[subdivision]);
  useEffect(() => {
    totalStepsRef.current = timeSig.beats * subdivisionsPerBeat[subdivision];
  }, [timeSig, subdivision]);

  const click = useCallback((ctx: AudioContext, at: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1568 : 1046; // G6 agudo p/ tempo forte
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.08);
  }, []);

  const scheduleStep = useCallback(() => {
    const ctx = getCtx();
    const step = currentStepRef.current;
    const subCount = subdivisionsPerBeat[subRef.current] || 1;
    const isDownbeat = step % subCount === 0;
    const beatIndex = Math.floor(step / subCount);
    const accent = isDownbeat && beatIndex === 0;
    click(ctx, nextTimeRef.current, accent);
    setBeat(isDownbeat ? beatIndex : -2); // -2 = subdivisão (pulso fraco)

    // Próximo passo
    const beatDuration = 60 / bpmRef.current; // segundos por batida
    nextTimeRef.current += beatDuration / subCount;
    currentStepRef.current = (currentStepRef.current + 1) % totalStepsRef.current;
  }, [click]);

  const start = useCallback(() => {
    const ctx = getCtx();
    if (ctx.state === 'suspended') void ctx.resume();
    nextTimeRef.current = ctx.currentTime + 0.06;
    currentStepRef.current = 0;
    setIsRunning(true);
    scheduleStep();
    timerRef.current = window.setInterval(scheduleStep, 40); // scheduler leve
  }, [scheduleStep]);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRunning(false);
    setBeat(-1);
  }, []);

  useEffect(() => () => stop(), [stop]);

  // Tap tempo: calcula a média dos últimos intervalos
  const tapsRef = useRef<number[]>([]);
  const handleTap = () => {
    const now = performance.now();
    const taps = tapsRef.current;
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 2) {
      const diffs = taps
        .slice(1)
        .map((t, i) => t - taps[i])
        .filter((d) => d > 150 && d < 2000);
      if (diffs.length > 0) {
        const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        setBpm(clampBpm(Math.round(60000 / avg)));
      }
    }
  };

  // Indicador visual por batida
  const beatDots = Array.from({ length: timeSig.beats }, (_, i) => i);

  return (
    <div className="space-y-6 text-slate-900">
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-2xs max-w-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-6">
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Timer className="w-6 h-6 text-[#F26419]" /> Metrônomo
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              O ritmo da sua música em suas mãos — pratique com precisão.
            </p>
          </div>
          <span
            className={`px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5 transition-all ${
              isRunning
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            <HeartPulse className="w-3.5 h-3.5" /> {isRunning ? 'TOCANDO' : 'PARADO'}
          </span>
        </div>

        {/* BPM */}
        <div className="text-center mb-6">
          <div className="text-7xl font-black text-[#1D2D44] font-mono tabular-nums tracking-tight">
            {bpm}
            <span className="text-2xl text-slate-400 font-bold ml-1">BPM</span>
          </div>
          <input
            type="range"
            min="30"
            max="240"
            value={bpm}
            onChange={(e) => setBpm(clampBpm(parseInt(e.target.value, 10)))}
            className="w-full max-w-sm accent-[#F26419] cursor-pointer mt-3"
          />
          <div className="flex justify-center gap-2 mt-2 flex-wrap">
            {[60, 80, 90, 100, 120, 140].map((b) => (
              <button
                key={b}
                onClick={() => setBpm(b)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-colors cursor-pointer border ${
                  bpm === b
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-orange-400'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Pulso visual */}
        <div className="flex justify-center gap-3 mb-6">
          {beatDots.map((i) => (
            <div
              key={i}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-100 ${
                isRunning && beat === i
                  ? 'bg-[#F26419] text-white scale-110 shadow-lg shadow-[#F26419]/40'
                  : isRunning && beat === -2
                  ? 'bg-orange-100 text-orange-400 scale-90'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Controles */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
          <button
            onClick={() => (isRunning ? stop() : start())}
            className={`px-8 py-3 rounded-2xl text-white font-black text-sm flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
              isRunning
                ? 'bg-[#1D2D44] hover:bg-[#0F2537] shadow-[#1D2D44]/25'
                : 'bg-[#F26419] hover:bg-[#D9530D] shadow-[#F26419]/30 hover:scale-[1.03]'
            }`}
          >
            {isRunning ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
            {isRunning ? 'Pausar' : 'Iniciar'}
          </button>
          <button
            onClick={handleTap}
            className="px-5 py-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 hover:border-orange-400 font-bold text-xs transition-colors cursor-pointer"
            title="Toque no ritmo para descobrir o BPM"
          >
            👆 Tap Tempo
          </button>
          <button
            onClick={() => {
              stop();
              setBpm(90);
              setSubdivision('1/4');
              setTimeSig({ beats: 4, unit: 4 });
              tapsRef.current = [];
            }}
            className="p-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-500 hover:text-rose-500 hover:border-rose-300 transition-colors cursor-pointer"
            title="Resetar tudo"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Subdivisões + compasso */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
              Subdivisão
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {Object.keys(subdivisionsPerBeat).map((s) => (
                <button
                  key={s}
                  onClick={() => setSubdivision(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                    subdivision === s
                      ? 'bg-[#0E7C7B] text-white border-[#0E7C7B]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#0E7C7B]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
              Compasso
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {[
                { beats: 2, unit: 4 },
                { beats: 3, unit: 4 },
                { beats: 4, unit: 4 },
                { beats: 6, unit: 8 },
              ].map((ts) => (
                <button
                  key={`${ts.beats}/${ts.unit}`}
                  onClick={() => setTimeSig(ts)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                    timeSig.beats === ts.beats && timeSig.unit === ts.unit
                      ? 'bg-[#0E7C7B] text-white border-[#0E7C7B]'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-[#0E7C7B]'
                  }`}
                >
                  {ts.beats}/{ts.unit}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 max-w-2xl leading-relaxed flex items-start gap-1.5">
        💡 Dica: abra uma cifra com o ritmo indicado (ex.: 4/4 a 100 BPM) e treine
        junto com a batida. Para praticar com o metrônomo enquanto lê a cifra,
        abra-o em outra janela ou use o botão na página da música.
      </p>
    </div>
  );
};
