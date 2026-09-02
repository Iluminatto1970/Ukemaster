/**
 * Metrônomo do UkeMaster — som via Web Audio (sem arquivos), BPM com tap
 * tempo, subdivisões (semínima, colcheia, tercina, semicolcheia), compassos
 * (2/4, 3/4, 4/4, 6/8) e pulso visual. O áudio só inicia após um gesto do
 * usuário (requisito dos navegadores).
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Timer, HeartPulse } from 'lucide-react';
import { useT } from '../lib/i18n';
import { useToolSeo } from '../hooks/useToolSeo';

const clampBpm = (bpm: number) => Math.max(30, Math.min(240, bpm));

export const Metronome: React.FC = () => {
  const { t } = useT();

  // SEO: JSON-LD WebApplication para metrônomo
  useToolSeo({
    slug: 'metronomo',
    title: 'Metrônomo Online Grátis para Ukulele',
    description: 'Metrônomo online gratuito com BPM ajustável, subdivisions (semínima, colcheia, tercina) e compassos 2/4, 3/4, 4/4, 6/8. Ideal para praticar ukulele.',
    url: `${window.location.origin}/ritmos`,
    applicationCategory: 'MultimediaApplication',
  });

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
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
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
              <Timer className="w-6 h-6 text-[#F26419]" /> {t('metronome.title')}
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-1">
              {t('metronome.subtitle')}
            </p>
          </div>
          <span
            className={`px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5 transition-all ${
              isRunning
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse'
                : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            <HeartPulse className="w-3.5 h-3.5" /> {isRunning ? t('metronome.playing') : t('metronome.stopped')}
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
            {isRunning ? t('metronome.pause') : t('metronome.start')}
          </button>
          <button
            onClick={handleTap}
            className="px-5 py-3 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 hover:border-orange-400 font-bold text-xs transition-colors cursor-pointer"
            title={t('metronome.tapTitle')}
          >
            {t('metronome.tap')}
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
            title={t('metronome.resetTitle')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Subdivisões + compasso */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block mb-2">
              {t('metronome.subdivision')}
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
              {t('metronome.timeSig')}
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
        {t('metronome.tip')}
      </p>

      {/* Conteúdo editorial educativo — guia completo de metrônomo e prática (AdSense: substantial original content, 1000+ words) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-2xs space-y-6">
        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <Timer className="w-5 h-5 text-[#0E7C7B]" /> Metrônomo: Como Usar para Evoluir Rápido
        </h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-[#0E7C7B]/5 border border-[#0E7C7B]/20 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-[#0E7C7B]">🎯 Por que Usar Metrônomo?</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              O metrônomo é a ferramenta mais importante para desenvolver <strong>timing</strong> — a
              capacidade de manter o ritmo constante. Músicos com bom timing tocam melhor em
              banda, gravam mais fácil e impressionam mais o público. Pratique com metrônomo
              <strong> todos os dias</strong>, mesmo que por 5 minutos. Estudos mostram que músicos
              que praticam com metrônomo evoluem 2-3x mais rápido que tocam "só no feeling".
              O metrônomo expõe fraquezas que passam despercebidas — e só quem enxerga seus erros
              pode corrigi--lo. Grandes virtuoses como Paul McCartney e Tommy Emmanuel praticam
              com metrônomo até hoje.
            </p>
          </div>

          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-amber-800">⚡ Faixas de BPM por Gênero</h4>
            <p className="text-[10px] text-slate-500 leading-relaxed mb-1">
              BPM (Batidas Por Minuto) — a velocidade do andamento. Use estas referências para
              posicionar o metrônomo antes de tocar:
            </p>
            <div className="space-y-1">
              {[
                { genre: 'Balada / Lenta', bpm: '60–80 BPM', color: 'text-blue-600' },
                { genre: 'Pop / Ukulele', bpm: '90–120 BPM', color: 'text-green-600' },
                { genre: 'Reggae / Samba', bpm: '100–130 BPM', color: 'text-amber-600' },
                { genre: 'Rock / Sertanejo', bpm: '120–160 BPM', color: 'text-orange-600' },
                { genre: 'Funk / Rap', bpm: '80–110 BPM', color: 'text-purple-600' },
              ].map((g) => (
                <div key={g.genre} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">{g.genre}</span>
                  <span className={`font-mono font-bold ${g.color}`}>{g.bpm}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-orange-50/80 border border-orange-200 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-orange-800">📈 Método de Prática com Metrônomo</h4>
            <p className="text-[10px] text-slate-500 leading-relaxed mb-1">
              O método progressivo é o mais eficiente para desenvolver velocidade e precisão sem
              formar vícios:
            </p>
            <ol className="text-xs text-slate-600 leading-relaxed space-y-1.5 list-decimal list-inside">
              <li>Comece <strong>lento</strong> (60-70 BPM) — toque a música inteira sem erro.</li>
              <li>Aumente <strong>5 BPM</strong> por vez e repita até errar.</li>
              <li>Volte 10 BPM e pratique novamente nesse nível.</li>
              <li>Use <strong>subdivisões</strong> (colcheia, tercina) para ritmos mais complexos.</li>
              <li>Tente <strong>tap tempo</strong> (clique no botão) para descobrir o BPM de qualquer música.</li>
            </ol>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-slate-800">🎵 Compassos Comuns no Ukulele</h4>
            <ul className="text-xs text-slate-600 leading-relaxed space-y-1.5 list-disc list-inside">
              <li><strong>4/4</strong> — O mais comum: pop, rock, sertanejo, samba.</li>
              <li><strong>3/4</strong> — Valso e baladas: "um-dois-três, um-dois-três".</li>
              <li><strong>2/4</strong> — Marcha e frevo: "um-dois, um-dois".</li>
              <li><strong>6/8</strong> — Bossa nova e baladas românticas: dois grupos de três.</li>
            </ul>
          </div>
        </div>

        <div className="bg-gradient-to-r from-[#0E7C7B]/5 to-teal-50 border border-[#0E7C7B]/20 rounded-xl p-5 space-y-3">
          <h4 className="text-sm font-extrabold text-[#0E7C7B]">🥁 Como Usar o Metrônomo Passo a Passo</h4>
          <ol className="text-xs text-slate-700 leading-relaxed space-y-2 list-decimal list-inside">
            <li><strong>Escolha o BPM correto:</strong> pesquise o andamento da música ou use o botão Tap Tempo para descobrir. Comece sempre 20 BPM mais lento que o original.</li>
            <li><strong>Ative o acento:</strong> o primeiro beat de cada compasso deve ser mais forte (o metrônomo marca com um som diferente). Isso ajuda a sentir o "um" do compasso.</li>
            <li><strong>Conte em voz alta:</strong> antes de tocar, conte "um-dois-três-quatro" em voz alta com o metrônomo. Isso sincroniza seu corpo com o andamento.</li>
            <li><strong>Comece com batidas simples:</strong> toque apenas palmas ou batidas no corpo do ukulele no tempo — sem acordes ainda. Sinta o ritmo primeiro.</li>
            <li><strong>Adicione os acordes:</strong> quando estiver confortável com as batidas, troque por acordes. Mantenha o metrônomo alto o suficiente para ouvir sobre sua execução.</li>
            <li><strong>Registre seu progresso:</strong> anote o BPM máximo que você consegue tocar uma música sem errar. Toda semana, tente aumentar 5 BPM.</li>
          </ol>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-blue-800">🧠 Por que o Ritmo é Mais Importante que a Velocidade?</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Muitos iniciantes cometem o erro de tentar tocar rápido antes de dominar o ritmo.
              A realidade é que <strong>um acorde perfeitamente no tempo soa melhor que 10 acordes
              desafinados</strong>. O público percebe quando o ritmo "flui" — isso é o que faz
              uma música ser envolvente. Um solo técnico sem groove não prende atenção;
              uma levada simples e firme faz qualquer pessoa querer dançar. Por isso,
              profissionais priorizam timing acima de qualquer técnica avançada.
            </p>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Experimente: toque uma música que você domina bem com o metrônomo em 80% da
              velocidade original. Você vai perceber que soa MELHOR que tocar no ritmo original
              com hesitações e erros.
            </p>
          </div>

          <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-4 space-y-2">
            <h4 className="text-sm font-extrabold text-purple-800">🥁 Levadas Populares no Ukulele</h4>
            <div className="space-y-2">
              <div className="bg-white/80 rounded-lg p-2">
                <p className="text-[10px] font-bold text-slate-700">Island Strum (Mais Popular)</p>
                <p className="text-[10px] text-slate-500 font-mono">↓ ↓ ↑ . ↑ ↓ ↑</p>
                <p className="text-[10px] text-slate-600">Pausa no 3º tempo — "down-down-up, up-down-up"</p>
              </div>
              <div className="bg-white/80 rounded-lg p-2">
                <p className="text-[10px] font-bold text-slate-700">Pop Rock</p>
                <p className="text-[10px] text-slate-500 font-mono">↓ ↓ ↑ ↑ ↓ ↑</p>
                <p className="text-[10px] text-slate-600">Simétrico e firme — ideal para rock e sertanejo.</p>
              </div>
              <div className="bg-white/80 rounded-lg p-2">
                <p className="text-[10px] font-bold text-slate-700">Reggae / Ska</p>
                <p className="text-[10px] text-slate-500 font-mono">. ↑ . ↑ . ↑ . ↑</p>
                <p className="text-[10px] text-slate-600">Só no tempo fraco — "chuck" no 2 e 4.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-400 leading-relaxed max-w-2xl mx-auto">
            <strong className="text-[#0E7C7B]">Dica Pro:</strong> Grave-se tocando com o metrônomo e
            ouça depois. Você vai perceber onde "sai do tempo" — isso é o caminho para a
            <strong className="text-white"> precision</strong> que separa amadores de profissionais.
            Tente tocar com fones de ouvido para isolar o som do metrônomo e concentra-se
            em fazer o palhetto cair exatamente quando o "clique" soa.
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <h4 className="text-sm font-extrabold text-slate-800 mb-2">❓ Perguntas Frequentes</h4>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-slate-700">Qual BPM devo usar para começar?</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">Comece sempre entre 60-70 BPM. É mais lento que parece, mas é o ritmo onde você desenvolve precisão. Muitos músicos profissionais praticam em 60 BPM para aquecer.</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700">O metrônomo "mata" a musicalidade?</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">Não — o contrário! Quando você domina o timing, pode decidir INTENCIONALMENTE adiantar ou atrasar notas (rubato) para criar emoção. Sem timing, essas nuances são acidentes.</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-700">Devo praticar sempre com metrônomo?</p>
              <p className="text-[11px] text-slate-600 leading-relaxed">Não necessariamente 100% do tempo. Use o metrônomo para técnica e precisão, mas reserve tempo para tocar livre ("no feeling") para desenvolver expressão e phrasing.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
