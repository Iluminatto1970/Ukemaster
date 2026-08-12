/**
 * Trilhas de Aprendizado: 60 caminhos guiados de ukulele, do iniciante ao
 * avançado, organizados em 6 grupos:
 *   1. ACORDES (10)  — um acorde por trilha (digitação, transição, progressão)
 *   2. GÊNEROS (10)  — um gênero musical por trilha (levadas + músicas do acervo)
 *   3. TÉCNICAS (10) — pestana, dedilhado, capotraste, levadas...
 *   4. MÚSICAS (10)  — "Aprenda: [música famosa]" com cifra do acervo
 *   5. ROTINA (9)    — hábitos e prática diária
 *   6. TEORIA (8)    — leitura de cifras, campo harmônico, escala...
 *
 * Cada trilha tem passos de DICA (teoria/prática) e passos de MÚSICA — que
 * abrem a cifra de uma música ESPECÍFICA (songTitle/songArtist) ou buscam uma
 * música do acervo DINAMICAMENTE pela categoria (songCategory). Os passos de
 * música dinâmicos nunca "falham": o componente escolhe uma cifra da categoria.
 *
 * O texto das trilhas novas é direto em português (a função t() do i18n
 * retorna o próprio texto quando não é uma chave — fallback pt). As 3 trilhas
 * originais (t1–t3) continuam com chaves i18n traduzidas nas 8 línguas.
 */
export type TrailLevel = 'iniciante' | 'intermediario' | 'avancado';

export interface LearningStep {
  id: string;
  type: 'tip' | 'song';
  /** Chave i18n OU texto direto do título do passo (t() resolve ambos). */
  titleKey: string;
  /** Chave i18n OU texto direto da dica (apenas passos 'tip'). */
  textKey?: string;
  /** Título da música no acervo (passos 'song' com música fixa). */
  songTitle?: string;
  /** Artista da música no acervo (passos 'song' com música fixa). */
  songArtist?: string;
  /** Categoria do acervo — busca uma música DINAMICAMENTE (passos 'song'). */
  songCategory?: string;
  /** Tempo estimado em minutos. */
  minutes: number;
}

export interface LearningTrail {
  id: string;
  level: TrailLevel;
  /** Chave i18n OU texto direto do nome da trilha. */
  titleKey: string;
  /** Chave i18n OU texto direto da descrição. */
  descriptionKey: string;
  emoji: string;
  steps: LearningStep[];
}

// ── Gerador ──────────────────────────────────────────────────────────────
type StepSeed =
  | { t: 'tip'; title: string; text: string; min: number }
  | { t: 'song'; title: string; min?: number; songTitle?: string; songArtist?: string; cat?: string };

const tip = (title: string, text: string, min: number): StepSeed => ({ t: 'tip', title, text, min });
/** Música fixa do acervo (por título/artista). */
const song = (title: string, songTitle: string, songArtist: string, min = 8): StepSeed => ({
  t: 'song',
  title,
  songTitle,
  songArtist,
  min,
});
/** Música DINÂMICA: o componente busca uma cifra da categoria no acervo. */
const songCat = (title: string, cat: string, min = 8): StepSeed => ({ t: 'song', title, cat, min });

const T = (
  id: string,
  level: TrailLevel,
  title: string,
  desc: string,
  emoji: string,
  steps: StepSeed[]
): LearningTrail => ({
  id,
  level,
  titleKey: title,
  descriptionKey: desc,
  emoji,
  steps: steps.map((s, i) =>
    s.t === 'tip'
      ? { id: `s${i + 1}`, type: 'tip', titleKey: s.title, textKey: s.text, minutes: s.min }
      : {
          id: `s${i + 1}`,
          type: 'song',
          titleKey: s.title,
          songTitle: s.songTitle,
          songArtist: s.songArtist,
          songCategory: s.cat,
          minutes: s.min ?? 8,
        }
  ),
});

/** Template das trilhas "Aprenda: [música]". */
const learnSongTrail = (
  id: string,
  level: TrailLevel,
  title: string,
  desc: string,
  emoji: string,
  songTitle: string,
  songArtist: string
): LearningTrail =>
  T(id, level, title, desc, emoji, [
    tip(
      `Ouça "${songTitle}" com atenção`,
      `Antes de tocar, ouça ${songTitle} de ${songArtist} algumas vezes: perceba o ritmo, os acordes e onde eles mudam.`,
      3
    ),
    song(`Aprenda os acordes de ${songTitle}`, songTitle, songArtist, 10),
    tip(
      'Toque o ritmo sem cantar',
      'Identifique a levada (balada, pop, reggae...) e toque os acordes no ritmo, sem cantar. Depois junte tudo.',
      5
    ),
    tip(
      'Toque do começo ao fim',
      'Toque a música inteira sem parar, mesmo com erros. A fluidez vem com a repetição.',
      8
    ),
    tip(
      'Grave e compare',
      'Grave tocando junto com a música original e compare. Ajuste o que destoar e toque de novo.',
      5
    ),
  ]);

// ── GRUPO 1: ACORDES (10) ────────────────────────────────────────────────
interface ChordSeed {
  id: string;
  level: TrailLevel;
  chord: string;
  title: string;
  desc: string;
  emoji: string;
  fingering: string;
  transition: string;
  progression: string;
}
const CHORDS: ChordSeed[] = [
  {
    id: 'acorde-c',
    level: 'iniciante',
    chord: 'C',
    title: 'Acorde C — O Primeiro',
    desc: 'O acorde mais usado do ukulele: domine o C e abra o caminho.',
    emoji: '🍀',
    fingering: 'Forme o C com o dedo anelar na 3ª casa da corda A (a mais fina). Toque as 4 cordas juntas — deve soar limpo.',
    transition: 'A transição C→G→C é a base de milhares de músicas. Alterne devagar até sair fluido.',
    progression: 'Toque a progressão C, Am, F, G — o I-vi-IV-V que domina o pop e o rock.',
  },
  {
    id: 'acorde-g',
    level: 'iniciante',
    chord: 'G',
    title: 'Acorde G — Mão Cheia',
    desc: 'Três dedos, som alegre: o G é essencial em qualquer repertório.',
    emoji: '🌞',
    fingering: 'Forme o G: dedo médio na 2ª casa da corda A, indicador na 2ª casa da corda C e anelar na 3ª casa da corda E.',
    transition: 'Pratique G→Em→G: os dois formatos são parecidos, a mão quase não muda.',
    progression: 'Toque a progressão G, Em, C, D — clássica das baladas e sertanejos.',
  },
  {
    id: 'acorde-am',
    level: 'iniciante',
    chord: 'Am',
    title: 'Acorde Am — O Clássico',
    desc: 'Um dedo só e um som doce: perfeito para começar.',
    emoji: '🌙',
    fingering: 'Forme o Am com o dedo médio na 2ª casa da corda G (a mais grossa). As outras 3 cordas ficam soltas.',
    transition: 'A transição Am→F→Am: o dedo médio desliza da 2ª casa (G) para a 2ª casa (G) com o indicador entrando na 1ª (E).',
    progression: 'Toque Am, F, C, G — a progressão de milhares de hits mundiais.',
  },
  {
    id: 'acorde-f',
    level: 'iniciante',
    chord: 'F',
    title: 'Acorde F — Pop na Veia',
    desc: 'Dois dedos e uma sonoridade que aparece em todo lugar.',
    emoji: '⭐',
    fingering: 'Forme o F: dedo médio na 2ª casa da corda G e indicador na 1ª casa da corda E.',
    transition: 'Transição F→C→F: os dois acordes mais comuns do pop. Toque devagar, 4 batidas cada.',
    progression: 'Toque F, C, Dm, Bb e sinta a cor das músicas de rádio.',
  },
  {
    id: 'acorde-d',
    level: 'intermediario',
    chord: 'D',
    title: 'Acorde D — A Fileirinha',
    desc: 'Três dedos em linha reta: um formato que abre novos sons.',
    emoji: '📐',
    fingering: 'Forme o D: dedos indicador, médio e anelar na 2ª casa das cordas G, C e E — uma "fileirinha".',
    transition: 'Transição D→Em→D: a mão "anda" uma casa de cada vez.',
    progression: 'Toque D, A, Bm, G e explore o som das músicas de viola e sertanejo.',
  },
  {
    id: 'acorde-e',
    level: 'intermediario',
    chord: 'E',
    title: 'Acorde E — O Desafiador',
    desc: 'Difícil no ukulele, mas essencial: dedos curvados e paciência.',
    emoji: '💪',
    fingering: 'Forme o E: indicador na 1ª casa (corda G), médio na 2ª casa (corda A) e anelar na 4ª casa (corda C).',
    transition: 'Transição E→Am→E: mantenha os dedos curvados e toque perto do traste para não abafar.',
    progression: 'Toque E, A, B7 — a progressão do rock de garagem.',
  },
  {
    id: 'acorde-em',
    level: 'intermediario',
    chord: 'Em',
    title: 'Acorde Em — Suave e Fácil',
    desc: 'Três dedos e um som melancólico que combina com tudo.',
    emoji: '🌧️',
    fingering: 'Forme o Em: indicador na 2ª casa da corda A, médio na 3ª casa da corda E e anelar na 4ª casa da corda C.',
    transition: 'Transição Em→G→Em: os formatos são parecidos, a mão desliza inteira.',
    progression: 'Toque Em, C, G, D — a base de inúmeras músicas de MPB e folk.',
  },
  {
    id: 'acorde-dm',
    level: 'intermediario',
    chord: 'Dm',
    title: 'Acorde Dm — Toque de Melancolia',
    desc: 'O primo triste do D: um tom a menos, uma emoção a mais.',
    emoji: '🌫️',
    fingering: 'Forme o Dm: indicador na 1ª casa da corda E, médio na 2ª casa da corda G e anelar na 2ª casa da corda C.',
    transition: 'Transição Dm→Am→Dm: pratique deslizar os dois dedos juntos.',
    progression: 'Toque Dm, Bb, F, C — muito usada em baladas e MPB.',
  },
  {
    id: 'acorde-a',
    level: 'intermediario',
    chord: 'A',
    title: 'Acorde A — Simples e Essencial',
    desc: 'Dois dedos e o som que abre o campo harmônico de Lá.',
    emoji: '🅰️',
    fingering: 'Forme o A: dedo médio na 2ª casa da corda G e indicador na 1ª casa da corda C.',
    transition: 'Transição A→D→A: uma progressão clássica de valsa.',
    progression: 'Toque A, D, E — a sequência do rock e do blues mais simples que existe.',
  },
  {
    id: 'acorde-bm',
    level: 'avancado',
    chord: 'Bm',
    title: 'Acorde Bm — Pestana na Prática',
    desc: 'O primeiro grande desafio: pestana na 2ª casa.',
    emoji: '🛡️',
    fingering: 'Forme o Bm: pestana na 2ª casa com o indicador cobrindo as 4 cordas; anelar e mindinho na 4ª casa (cordas G e C).',
    transition: 'Transição Bm→G→Bm: depois da pestana, o G parece fácil!',
    progression: 'Toque Bm, G, D, A e sinta o peso das músicas de rock e sertanejo.',
  },
];
const chordTrails: LearningTrail[] = CHORDS.map((c) =>
  T(c.id, c.level, c.title, c.desc, c.emoji, [
    tip(`Conheça o acorde ${c.chord}`, c.fingering, 5),
    songCat(`Música com o acorde ${c.chord}`, 'Todos', 8),
    tip(`Transição com ${c.chord}`, c.transition, 6),
    songCat(`Segunda música com ${c.chord}`, 'Todos', 8),
    tip(`Progressão com ${c.chord}`, c.progression, 5),
  ])
);

// ── GRUPO 2: GÊNEROS (10) ────────────────────────────────────────────────
interface GenreSeed {
  id: string;
  level: TrailLevel;
  cat: string;
  title: string;
  desc: string;
  emoji: string;
  groove: string;
  listen: string;
  practice: string;
}
const GENRES: GenreSeed[] = [
  {
    id: 'genero-mpb',
    level: 'iniciante',
    cat: 'MPB',
    title: 'MPB — Música Brasileira',
    desc: 'Letras, harmonia e suingue: o coração da música brasileira.',
    emoji: '🇧🇷',
    groove: 'A MPB valoriza a letra e a harmonia. Toque com suavidade e deixe o ukulele acompanhar a voz.',
    listen: 'Ouça Caetano Veloso, Djavan, Alceu Valença e Ivete Sangalo — cada um com um jeito único de tocar.',
    practice: 'Escolha uma MPB do acervo e toque só os acordes, no ritmo, até a letra "caber" naturalmente.',
  },
  {
    id: 'genero-pop',
    level: 'iniciante',
    cat: 'Pop',
    title: 'Pop — Refrões Inesquecíveis',
    desc: 'Simples, grudento e perfeito para tocar e cantar.',
    emoji: '✨',
    groove: 'O pop é feito de refrões. Toque as músicas completas, repetindo o refrão com energia.',
    listen: 'Preste atenção na estrutura: verso, pré-refrão, refrão. A maioria usa 3 ou 4 acordes.',
    practice: 'Pegue uma música pop do acervo e toque o refrão até sair de cor.',
  },
  {
    id: 'genero-sertanejo',
    level: 'intermediario',
    cat: 'Sertanejo',
    title: 'Sertanejo — O Tchum-Tchum',
    desc: 'A batida que emociona o Brasil inteiro.',
    emoji: '🤠',
    groove: 'O sertanejo usa a batida "tchum-tchum": toque o grave, aponte as cordas e volte suave.',
    listen: 'Ouça Chitãozinho & Xororó e Zezé Di Camargo: repare como a viola responde à voz.',
    practice: 'Toque a batida tchum-tchum em uma única música até o braço relaxar.',
  },
  {
    id: 'genero-gospel',
    level: 'intermediario',
    cat: 'Gospel',
    title: 'Gospel — Emoção e Dinâmica',
    desc: 'Crescendo do piano ao coro: dinâmica é tudo.',
    emoji: '🙏',
    groove: 'O gospel pede dinâmica: comece suave nos versos e cresça no refrão, com mais ataque.',
    listen: 'Repare como as músicas gospel constroem tensão até a explosão do refrão.',
    practice: 'Toque a mesma música 2x: uma suave e uma forte. Compare a emoção de cada versão.',
  },
  {
    id: 'genero-reggae',
    level: 'intermediario',
    cat: 'Reggae',
    title: 'Reggae — O Contratempo',
    desc: 'A levada mais relaxada do mundo: o segredo está no "e".',
    emoji: '🌴',
    groove: 'No reggae, toque no contratempo (o "e" de cada batida) — o balanço é tudo.',
    listen: 'Ouça Bob Marley e artistas nacionais: a guitarra "responde" ao bumbo.',
    practice: 'Toque só o contratempo (corda solta + acorde) até o corpo balançar sozinho.',
  },
  {
    id: 'genero-forro',
    level: 'intermediario',
    cat: 'Forró',
    title: 'Forró — O Balanço Nordestino',
    desc: 'Xote e baião: o ritmo que faz o salão inteiro dançar.',
    emoji: '🪗',
    groove: 'No forró/xote, acentue os tempos 2 e 4 com um toque leve nas cordas graves.',
    listen: 'Ouça Luiz Gonzaga: a sanfona "conversa" com a zabumba — o ukulele pode imitar a sanfona.',
    practice: 'Toque a levada de xote em Cavalo Crioulo ou outra música do gênero.',
  },
  {
    id: 'genero-internacional',
    level: 'intermediario',
    cat: 'Internacional',
    title: 'Internacional — Clássicos Mundiais',
    desc: 'De Elvis a Bruno Mars: amplie seu vocabulário com o mundo.',
    emoji: '🌎',
    groove: 'Músicas internacionais usam acordes e ritmos variados — ótimo para ampliar seu vocabulário.',
    listen: 'Repare como os clássicos (Elvis, Beatles) usam poucos acordes com muita personalidade.',
    practice: 'Escolha um clássico internacional do acervo e toque com a pronúncia certa do ritmo.',
  },
  {
    id: 'genero-infantil',
    level: 'iniciante',
    cat: 'Infantil',
    title: 'Infantil — Música para Todas as Idades',
    desc: 'Simples, repetitiva e perfeita para treinar com as crianças.',
    emoji: '🧸',
    groove: 'Músicas infantis são simples e repetitivas — perfeitas para treinar acordes novos.',
    listen: 'Toque devagar e deixe as crianças cantarem: o ritmo natural delas ensina o seu.',
    practice: 'Monte uma "rodinha": toque uma música infantil e convide todo mundo a cantar.',
  },
  {
    id: 'genero-rock',
    level: 'avancado',
    cat: 'Rock',
    title: 'Rock — Energia no Ukulele',
    desc: 'Ataque, poder e acordes que soam gigantes num instrumento pequeno.',
    emoji: '🎸',
    groove: 'No rock, o ataque é importante: toque as cordas com firmeza, perto do cavalete.',
    listen: 'Ouça músicas de rock e imagine a guitarra: o ukulele pode fazer os mesmos acordes.',
    practice: 'Toque com palhetada firme e deixe as cordas "rangendo" no momento certo.',
  },
  {
    id: 'genero-outros',
    level: 'iniciante',
    cat: 'Outros',
    title: 'Outros Gêneros — Explorando o Acervo',
    desc: 'Cada gênero ensina um jeito diferente de tocar.',
    emoji: '🧭',
    groove: 'Explore o acervo: cada gênero ensina um jeito diferente de tocar.',
    listen: 'Navegue pelas categorias e escolha músicas fora da sua zona de conforto.',
    practice: 'Toque uma música de um gênero que você nunca tocou antes.',
  },
];
const genreTrails: LearningTrail[] = GENRES.map((g) =>
  T(g.id, g.level, g.title, g.desc, g.emoji, [
    tip(`A levada de ${g.cat}`, g.groove, 5),
    songCat(`Música de ${g.cat} — parte 1`, g.cat, 8),
    tip(`Ouvindo ${g.cat}`, g.listen, 4),
    songCat(`Música de ${g.cat} — parte 2`, g.cat, 8),
    tip(`Praticando ${g.cat}`, g.practice, 5),
  ])
);

// ── GRUPO 3: TÉCNICAS (10) ───────────────────────────────────────────────
interface TechSeed {
  id: string;
  level: TrailLevel;
  title: string;
  desc: string;
  emoji: string;
  t1: [string, string];
  t2: [string, string];
  t3: [string, string];
}
const TECHS: TechSeed[] = [
  {
    id: 'tecnica-pestana',
    level: 'avancado',
    title: 'Pestana Total',
    desc: 'O dedo indicador como pestana: destrave F, Bm e muito mais.',
    emoji: '🤘',
    t1: [
      'A base da pestana',
      'Pestana é o indicador reto e firme sobre as cordas, perto do traste. Solte o peso do braço no dedo.',
    ],
    t2: [
      'Força sem dor',
      'Toque a pestana em F (1ª casa) e Bm (2ª casa) até soar sem chiado. Descanse entre as repetições.',
    ],
    t3: [
      'Pestana em movimento',
      'Ande com a pestana casa a casa: 1ª, 2ª, 3ª, 4ª — ouvindo cada posição como um novo acorde.',
    ],
  },
  {
    id: 'tecnica-dedilhado',
    level: 'intermediario',
    title: 'Dedilhado Essencial',
    desc: 'Polegar nos graves, dedos nas agudas: o dedilhado que transforma.',
    emoji: '🖐️',
    t1: [
      'Polegar nos graves',
      'Use o polegar nas cordas G e C (graves) e indicador/médio nas cordas E e A (agudas).',
    ],
    t2: [
      'O padrão clássico',
      'Padrão: polegar (G ou C), indicador (E), médio (A), indicador (E). Repita sem pressa.',
    ],
    t3: [
      'Dedilhado + acorde',
      'Mude de acorde mantendo o mesmo padrão de dedilhado — a música ganha outra vida.',
    ],
  },
  {
    id: 'tecnica-arpejos',
    level: 'avancado',
    title: 'Arpejos e Quebradas',
    desc: 'Toque as notas do acorde uma a uma, no ritmo: o arpejo.',
    emoji: '🎶',
    t1: [
      'O que é arpejo',
      'Arpejo é tocar as notas do acorde em sequência, em vez de juntas. Dá leveza e clareza.',
    ],
    t2: [
      'Arpejos em progressão',
      'Toque C, Am, F, G em arpejos, 4 notas cada, sem parar o fluxo.',
    ],
    t3: [
      'Arpejo com melodia',
      'Transforme uma música simples em arpejo e depois misture: algumas batidas cheias, outras arpejadas.',
    ],
  },
  {
    id: 'tecnica-capotraste',
    level: 'iniciante',
    title: 'Capotraste — Mudando o Tom',
    desc: 'O acessório que muda o tom sem mudar os acordes.',
    emoji: '🔩',
    t1: [
      'Para que serve',
      'O capotraste prende as cordas numa casa e SOBE o tom: C com capo na 2ª casa soa em D.',
    ],
    t2: [
      'Escolha a casa',
      'Cante uma música e descubra em que tom fica confortável; use o capo para chegar lá.',
    ],
    t3: [
      'Capo + transposição',
      'Com capo na 2ª casa, toque os acordes de G (G, C, D, Em) — você está soando em A.',
    ],
  },
  {
    id: 'tecnica-transicoes',
    level: 'intermediario',
    title: 'Transições Rápidas',
    desc: 'O segredo de tocar sem parar: mudar de acorde no tempo.',
    emoji: '⚡',
    t1: [
      'Vá devagar, sem erro',
      'Treine a transição entre 2 acordes em loop, devagar, SEM errar. Velocidade vem depois.',
    ],
    t2: [
      'O dedo-guia',
      'Perceba qual dedo "guia" a troca (ex.: médio de Am→F) e foque nele.',
    ],
    t3: [
      'Transições em sequência',
      'Monte uma sequência de 4 acordes (ex.: C G Am F) e toque em loop até sair sem pensar.',
    ],
  },
  {
    id: 'tecnica-setima',
    level: 'intermediario',
    title: 'Acordes com Sétima',
    desc: 'C7, G7, D7, A7: o tempero do blues e do choro.',
    emoji: '7️⃣',
    t1: [
      'O que muda na 7ª',
      'O acorde com 7ª (ex.: G7) adiciona tensão e movimento — é o "empurrão" para o próximo acorde.',
    ],
    t2: [
      'C7 e G7 na prática',
      'Pratique C7 (dedos 1, 2 e 3 nas cordas G, E e A) e G7 (indicador na 1ª casa, médio e anelar na 2ª).',
    ],
    t3: [
      'A progressão do blues',
      'Toque a clássica: C7, F7, C7, G7, F7, C7 — o esqueleto do blues.',
    ],
  },
  {
    id: 'tecnica-balada',
    level: 'iniciante',
    title: 'Levada de Balada',
    desc: 'A batida lenta e emocional das músicas de amor.',
    emoji: '💖',
    t1: [
      'O toque da balada',
      'Balada: toque os acordes no tempo, com leveza nas cordas graves e um "respiro" entre eles.',
    ],
    t2: [
      'Padrão ↓ ↑ ↓ ↑',
      'Toque ↓ ↑ ↓ ↑ devagar, acentuando o primeiro ↓ de cada compasso.',
    ],
    t3: [
      'Balada com emoção',
      'Escolha uma balada do acervo e toque sentindo: o ritmo acompanha a letra.',
    ],
  },
  {
    id: 'tecnica-xote',
    level: 'intermediario',
    title: 'Levada de Xote',
    desc: 'O balanço do forró: acento nos tempos 2 e 4.',
    emoji: '🕺',
    t1: [
      'O xote em 2 tempos',
      'Xote: acentue os tempos 2 e 4 com um toque leve e seco nas cordas graves.',
    ],
    t2: [
      'Padrão do xote',
      'Padrão básico: baixo (polegar), aponte, baixo, aponte — sempre alternando o acento.',
    ],
    t3: [
      'Xote com música',
      'Toque uma música de forró/xote do acervo com a levada, sem pressa no balanço.',
    ],
  },
  {
    id: 'tecnica-reggae',
    level: 'intermediario',
    title: 'Levada de Reggae',
    desc: 'Toque no "e" da batida e o corpo balança sozinho.',
    emoji: '🌊',
    t1: [
      'O contratempo',
      'No reggae, o acorde entra no "e" de cada batida (entre os tempos) — não no tempo.',
    ],
    t2: [
      'Padrão reggae',
      'Padrão: ↓ (corda solta) no tempo, ↑ com acorde no "e". O grave responde ao contratempo.',
    ],
    t3: [
      'Reggae relaxado',
      'Toque uma música de reggae do acervo com o balanço: relaxe o pulso, o ritmo faz o resto.',
    ],
  },
  {
    id: 'tecnica-dinamica',
    level: 'intermediario',
    title: 'Dinâmica — Forte e Suave',
    desc: 'O volume como emoção: o segredo dos grandes intérpretes.',
    emoji: '📊',
    t1: [
      'O que é dinâmica',
      'Dinâmica é variar o volume: suave (piano), médio (mezzo) e forte (forte). É a "emoção" da música.',
    ],
    t2: [
      'Suave e forte',
      'Toque a mesma progressão 3x: pianíssimo, mezzo e fortíssimo. Sinta a diferença de energia.',
    ],
    t3: [
      'Dinâmica na música',
      'Pegue uma música e marque: verso suave, refrão forte. Toque respeitando o roteiro.',
    ],
  },
];
const techTrails: LearningTrail[] = TECHS.map((tc) =>
  T(tc.id, tc.level, tc.title, tc.desc, tc.emoji, [
    tip(tc.t1[0], tc.t1[1], 5),
    songCat('Música para praticar', 'Todos', 8),
    tip(tc.t2[0], tc.t2[1], 6),
    songCat('Segunda música da técnica', 'Todos', 8),
    tip(tc.t3[0], tc.t3[1], 6),
  ])
);

// ── GRUPO 4: MÚSICAS (10) ────────────────────────────────────────────────
const songTrails: LearningTrail[] = [
  learnSongTrail('musica-riptide', 'iniciante', 'Aprenda: Riptide', 'Três acordes (Am, C, G) e um dos maiores hits do ukulele.', '🌊', 'Riptide', 'Vance Joy'),
  learnSongTrail('musica-rainbow', 'iniciante', 'Aprenda: Somewhere Over the Rainbow', 'A música que eternizou o ukulele nas mãos de Israel Kamakawiwo\'ole.', '🌈', 'Somewhere Over the Rainbow / What a Wonderful World', "Israel Kamakawiwo'ole"),
  learnSongTrail('musica-anunciacao', 'intermediario', 'Aprenda: Anunciação', 'O clássico de Alceu Valença: energia, ritmo e brasilidade.', '🪁', 'Anunciação', 'Alceu Valença'),
  learnSongTrail('musica-vou-deixar', 'intermediario', 'Aprenda: Vou Deixar', 'O hit do Skank: ritmo contagiante e acordes que dançam.', '🕶️', 'Vou Deixar', 'Skank'),
  learnSongTrail('musica-girassol', 'intermediario', 'Aprenda: Girassol', 'A parceria de Priscilla & Whindersson: doce e pop.', '🌻', 'Girassol', 'Priscilla Alcantara & Whindersson Nunes'),
  learnSongTrail('musica-eu-sei', 'avancado', 'Aprenda: Eu Sei Que Vou Te Amar', 'A canção de Tom Jobim & Vinícius: harmonia sofisticada.', '💞', 'Eu Sei Que Vou Te Amar', 'Ivete Sangalo'),
  learnSongTrail('musica-sorri', 'avancado', 'Aprenda: Sorri', 'O clássico de Djavan: melodias e acordes que pedem dedilhado.', '😊', 'Sorri', 'Djavan'),
  learnSongTrail('musica-um-brinde', 'avancado', 'Aprenda: Um Brinde', 'Djavan em todo o seu esplendor: harmonia rica para avançados.', '🥂', 'Um Brinde', 'Djavan'),
  learnSongTrail('musica-nao-chores', 'avancado', 'Aprenda: Não Chores Por Mim, Argentina', 'O drama da ópera-rock virou MPB nas mãos de Caetano.', '🎭', 'Não Chores Por Mim, Argentina', 'Caetano Veloso'),
  learnSongTrail('musica-onde-nasci', 'avancado', 'Aprenda: Onde Eu Nasci Passa Um Rio', 'Caetano em forma de poema: fraseado e interpretação.', '🏞️', 'Onde Eu Nasci Passa Um Rio', 'Caetano Veloso'),
];

// ── GRUPO 5: ROTINA (9) ──────────────────────────────────────────────────
interface RoutineSeed {
  id: string;
  level: TrailLevel;
  title: string;
  desc: string;
  emoji: string;
  t: [string, string][];
}
const ROUTINES: RoutineSeed[] = [
  {
    id: 'pratica-diaria',
    level: 'iniciante',
    title: 'Prática Diária — 20 Minutos',
    desc: 'Pouco todo dia vence muito uma vez por semana.',
    emoji: '📅',
    t: [
      ['Defina 20 minutos', '20 minutos por dia, no mesmo horário, criam o hábito. Menos é mais do que nada.'],
      ['Crie um ritual', 'Pegue o ukulele, sente no mesmo lugar, toque 1 música fácil para aquecer a confiança.'],
      ['O difícil primeiro', 'Treine o que você NÃO sabe nos primeiros 10 minutos, quando o cérebro está fresco.'],
      ['Termine com o que ama', 'Feche a sessão tocando algo que já sai bem — você termina feliz e volta amanhã.'],
      ['Registre o progresso', 'Anote a data e o que treinou. Em 2 semanas, olhar para trás motiva.'],
    ],
  },
  {
    id: 'pratica-aquecimento',
    level: 'iniciante',
    title: 'Aquecimento Antes de Tocar',
    desc: '5 minutos para mãos e ouvido prontos.',
    emoji: '🔥',
    t: [
      ['Alongue os dedos', 'Estique e curve cada dedo lentamente, 5 vezes, sem forçar.'],
      ['Cromático na corda', 'Toque corda por corda: 0, 1, 2, 3, 4 (casa a casa) — devagar e com som limpo.'],
      ['Arpejos lentos', 'Toque C, Am, F, G em arpejos, 4 notas cada, com metrônomo a 70 BPM.'],
      ['Acordes abertos', 'Troque C→G→Am→F devagar, 2 batidas cada, aquecendo as transições.'],
      ['Batida leve', 'Feche com 1 minuto de batida ↓↑ no acorde do dia, soltando o pulso.'],
    ],
  },
  {
    id: 'pratica-mao-direita',
    level: 'intermediario',
    title: 'Mão Direita — Ritmo',
    desc: 'O pulso que segura a música: treine a mão do ritmo.',
    emoji: '🫱',
    t: [
      ['O pulso é o chefe', 'A mão direita NÃO para: ela marca o tempo mesmo quando o acorde muda.'],
      ['Só cordas soltas', 'Treine batidas (↓ ↑ ↓↑...) em cordas soltas até o pulso ficar automático.'],
      ['Acentuações', 'Toque ↓↑↓↑ acentuando o ↓: sinta a "pegada" que dá vida ao ritmo.'],
      ['Misture padrões', 'Combine ↓, ↓↑, ↓↑↓↑ e pausas em sequências de 1 compasso cada.'],
      ['Ritmo na música', 'Escolha uma música e toque só a batida (sem acordes) junto com a original.'],
    ],
  },
  {
    id: 'pratica-mao-esquerda',
    level: 'intermediario',
    title: 'Mão Esquerda — Precisão',
    desc: 'Dedos no lugar certo, som limpo, sem chiado.',
    emoji: '🫲',
    t: [
      ['Perto do traste', 'Dedos tocam PERTO do traste (não em cima): menos força, mais som.'],
      ['Ponta dos dedos', 'Use a ponta dos dedos, curvados, para não abafar as cordas vizinhas.'],
      ['Um dedo por casa', 'Treine 1 dedo por casa (1-2-3-4) subindo e descendo a escala, devagar.'],
      ['Acorde limpo', 'Toque cada acorde e ouça corda por corda: a que chiou, ajuste o dedo.'],
      ['Sem olhar', 'Feche os olhos e forme os acordes C, G, Am, F — a memória muscular assume.'],
    ],
  },
  {
    id: 'pratica-memoria',
    level: 'iniciante',
    title: 'Memória Muscular',
    desc: 'O corpo aprende o que a mente repete: automatize os acordes.',
    emoji: '🧠',
    t: [
      ['Repetição espaçada', 'Treine 5 minutos, descanse, volte. O cérebro consolida entre as sessões.'],
      ['Olhos fechados', 'Forme acordes sem olhar: C, G, Am, F. Errou? Abra os olhos, corrige, repete.'],
      ['Velocidade gradual', 'Comece a transição em 4 batidas, depois 2, depois 1 — SEM errar.'],
      ['Sequências em loop', 'Toque C-G-Am-F em loop por 2 minutos: o corpo decora o caminho.'],
      ['Dormir ajuda', 'Treine antes de dormir: a memória se consolida durante o sono.'],
    ],
  },
  {
    id: 'pratica-ouvido',
    level: 'intermediario',
    title: 'Treinando o Ouvido',
    desc: 'Reconhecer acordes e ritmos de ouvido: o superpoder do músico.',
    emoji: '👂',
    t: [
      ['Ouça ativo', 'Escolha uma música e ouça SÓ a harmonia: tente achar quando os acordes mudam.'],
      ['Adivinhe o acorde', 'Pegue 2 acordes (ex.: C e F) e toque um deles; adivinhe qual é só pelo som.'],
      ['Cante o que toca', 'Cante a nota do acorde enquanto toca — liga o ouvido à mão.'],
      ['Compare com a original', 'Toque junto da música original e ajuste até "casar" perfeitamente.'],
      ['Transcreva 1 música', 'Escute e tente achar os acordes de uma música simples. É difícil no início — persista.'],
    ],
  },
  {
    id: 'pratica-improviso',
    level: 'avancado',
    title: 'Improviso e Criatividade',
    desc: 'Solte o freio: invente melodias sobre progressões.',
    emoji: '🎨',
    t: [
      ['Escala pentatônica', 'Aprenda a pentatônica (5 notas) e use-a sobre acordes de rock e pop.'],
      ['Comece simples', 'Improvisar é "cantar" com os dedos: frases curtas, com espaço, como uma conversa.'],
      ['Repita e varie', 'Toque uma ideia 2x e mude o final: repetição dá forma, variação dá vida.'],
      ['Siga o ritmo', 'Improviso também é RITMO: varie o tempo das notas, não só as notas.'],
      ['Grave tudo', 'Grave suas ideias: o que parecia "nada" vira material para músicas.'],
    ],
  },
  {
    id: 'pratica-composicao',
    level: 'avancado',
    title: 'Compondo Suas Primeiras Músicas',
    desc: 'Do rascunho à música: crie com 3 ou 4 acordes.',
    emoji: '✍️',
    t: [
      ['Progressão base', 'Comece com C, Am, F, G — o DNA de milhares de músicas.'],
      ['Crie um ritmo', 'Defina a batida que combina com a emoção: balada = calma, pop = pulso.'],
      ['Escreva a letra', 'Escolha um tema e escreva 2 versos + refrão. O refrão repete a ideia principal.'],
      ['Estruture a música', 'Monte: verso → pré-refrão → refrão → verso → refrão.'],
      ['Mostre para alguém', 'Toque sua composição para 1 pessoa. O retorno (mesmo tímido) ensina muito.'],
    ],
  },
  {
    id: 'pratica-apresentacao',
    level: 'intermediario',
    title: 'Tocando para o Público',
    desc: 'Do quarto para o palco: presença, confiança e música.',
    emoji: '🎤',
    t: [
      ['Escolha 3 músicas', 'Prepare 3 músicas que saem PERFEITAS — melhor 3 excelentes que 10 meia-boca.'],
      ['Toque para 1 pessoa', 'Ensaiе para alguém de confiança antes: o nervosismo some com a prática.'],
      ['Erros seguem o ritmo', 'Se errar, SEGUE em frente: o público quase nunca percebe.'],
      ['Sorria e respire', 'Respire fundo antes de começar e sorria: a plateia torce por você.'],
      ['A presença de palco', 'Olhe para as pessoas, mova-se com o ritmo e agradeça ao final.'],
    ],
  },
];
const routineTrails: LearningTrail[] = ROUTINES.map((r) =>
  T(r.id, r.level, r.title, r.desc, r.emoji, [
    ...r.t.map(([title, text], i) => tip(title, text, i < r.t.length - 1 ? 4 : 3) as StepSeed),
    songCat('Música para aplicar a rotina', 'Todos', 8),
  ])
);

// ── GRUPO 6: TEORIA (8) ──────────────────────────────────────────────────
interface TheorySeed {
  id: string;
  level: TrailLevel;
  title: string;
  desc: string;
  emoji: string;
  t: [string, string][];
}
const THEORIES: TheorySeed[] = [
  {
    id: 'teoria-cifras',
    level: 'iniciante',
    title: 'Leitura de Cifras',
    desc: 'Entenda o que está escrito: acordes, tom e compasso.',
    emoji: '📖',
    t: [
      ['O que é cifra', 'Cifra é o nome do acorde (C, Am, G7...) escrito acima da letra. Você toca onde aparece.'],
      ['Tom da música', 'O tom (ex.: Tom C) é o "centro" da música — geralmente o primeiro e último acorde.'],
      ['Acordes maiores e menores', 'Maiores (C, G, D) soam alegres; menores (Am, Em, Dm) soam tristes.'],
      ['A seta do ritmo', 'Padrões de batida (↓↑↓↑) aparecem em cima: cada símbolo é uma batida.'],
      ['Leia e toque', 'Pegue uma cifra do acervo e leia em voz alta: nome do acorde + onde muda.'],
    ],
  },
  {
    id: 'teoria-ritmo',
    level: 'iniciante',
    title: 'Ritmo e Tempo',
    desc: 'Contar, sentir e dividir o tempo: a coluna da música.',
    emoji: '⏱️',
    t: [
      ['O pulso', 'A música tem um pulso constante — como o coração. Sinta-o batendo os pés.'],
      ['Compasso 4/4', 'A maioria das músicas tem 4 batidas por compasso: 1-2-3-4, 1-2-3-4.'],
      ['Metrônomo é amigo', 'Use o Metrônomo do app a 80 BPM: toque 1 acorde por batida, sem atrasar.'],
      ['Subdivisões', 'Dentro de cada batida cabem 2 (↑) ou 4 (↑↓↑↓) toques. É o "e" do 1-e-2-e.'],
      ['Atrasar é o segredo', 'O "swing" vem de tocar levemente ATRÁS do tempo — sinta, não meça.'],
    ],
  },
  {
    id: 'teoria-afinacao',
    level: 'iniciante',
    title: 'Afinação — Ouvido Treinado',
    desc: 'Cordas afinadas, música afinada: o primeiro passo de tudo.',
    emoji: '🎛️',
    t: [
      ['Padrão GCEA', 'O ukulele afina G4-C4-E4-A4. Use o Afinador do app até o visor ficar verde.'],
      ['Afine toda sessão', 'Cordas desafinam com calor e tempo. Afine antes de CADA prática.'],
      ['Afine de ouvido', 'Toque a corda A aberta e afine a E até soar "igual" (quinta da A).'],
      ['O ouvido absoluto', 'Quanto mais você afina, mais seu ouvido memoriza os sons certos.'],
      ['Troque as cordas', 'Cordas velhas não seguram a afinação. Troque a cada 2–3 meses.'],
    ],
  },
  {
    id: 'teoria-campo-harmonico',
    level: 'intermediario',
    title: 'Campo Harmônico',
    desc: 'A família de acordes de um tom: por que C, Am, F e G "combinam".',
    emoji: '🏠',
    t: [
      ['A família do tom', 'No tom de C, os acordes "da casa" são C, Dm, Em, F, G, Am (e Bm7b5).'],
      ['I-vi-IV-V', 'Os mais usados: I (C), vi (Am), IV (F), V (G) — o DNA do pop.'],
      ['Funções: tônica, subdominante, dominante', 'C descansa (tônica), F passeia (subdominante), G puxa de volta (dominante).'],
      ['Ouça a "puxada"', 'Toque C→G→C: sinta o G "pedindo" para voltar ao C. É a resolução.'],
      ['Explore outros tons', 'Pegue uma música em D e ache a família: D, Em, F#m, G, A, Bm.'],
    ],
  },
  {
    id: 'teoria-escala',
    level: 'intermediario',
    title: 'Escala Maior',
    desc: 'As 7 notas que constroem tudo: do C ao B.',
    emoji: '🪜',
    t: [
      ['A escala de C', 'C, D, E, F, G, A, B — a escala maior natural, sem sustenidos.'],
      ['No braço', 'Toque a escala de C subindo a corda G: 0, 2, 3 e depois a corda C: 0, 1, 2...'],
      ['Intervalos', 'Maior = tom, tom, semitom, tom, tom, tom, semitom (T-T-ST-T-T-T-ST).'],
      ['Melodia com a escala', 'Improvisa uma melodia simples usando só notas da escala de C.'],
      ['Escala + acordes', 'Os acordes do tom de C saem das notas da escala — tudo se conecta.'],
    ],
  },
  {
    id: 'teoria-intervalos',
    level: 'intermediario',
    title: 'Intervalos e Sons',
    desc: 'A distância entre as notas: o vocabulário do ouvido.',
    emoji: '📏',
    t: [
      ['O que é intervalo', 'Intervalo é a distância entre 2 notas: 2ª, 3ª, 4ª, 5ª, 6ª, 7ª, 8ª.'],
      ['Uníssono e oitava', 'Mesma nota = uníssono; 8 notas acima = oitava (mesmo nome, som mais agudo).'],
      ['A quinta', 'C→G (5ª) é o intervalo mais "estável" — ouça a abertura do violão.'],
      ['A terça', 'A 3ª decide se o acorde é maior (alegre) ou menor (triste).'],
      ['A sétima', 'A 7ª cria tensão — toque C e C7 e sinta a diferença.'],
    ],
  },
  {
    id: 'teoria-harmonia',
    level: 'avancado',
    title: 'Harmonia — Progressões',
    desc: 'Conduzindo acordes: tensão, repouso e emoção.',
    emoji: '🔗',
    t: [
      ['Tensão e repouso', 'Boa música alterna tensão (acordes "instáveis") e repouso (tônica).'],
      ['Progressões clássicas', 'Estude: C-G-Am-F, F-G-C, Am-F-C-G, D-A-Bm-G.'],
      ['Acordes de passagem', 'D/F# e Am/G conectam acordes suavemente — a "ponte" entre eles.'],
      ['Dominante', 'O V7 (ex.: G7 no tom de C) é o campeão da tensão: quase sempre resolve na tônica.'],
      ['Crie sua progressão', 'Pegue 4 acordes de uma família e ordene-os como quiser. Toque e sinta.'],
    ],
  },
  {
    id: 'teoria-fraseado',
    level: 'avancado',
    title: 'Fraseado Musical',
    desc: 'Música é conversa: frases, respiração e sentido.',
    emoji: '💬',
    t: [
      ['Música é conversa', 'Uma frase musical é como uma frase falada: tem começo, meio e fim.'],
      ['Respire', 'Deixe espaços entre as frases — o silêncio também toca.'],
      ['Pergunta e resposta', 'Toque uma frase que "pergunta" (sobe) e responda (desce).'],
      ['Dinâmica na frase', 'Frases ganham vida com volume: comece piano, cresça, feche.'],
      ['Cante antes de tocar', 'Cante uma melodia e depois imite no ukulele — o fraseado vira natural.'],
    ],
  },
];
const theoryTrails: LearningTrail[] = THEORIES.map((th) =>
  T(th.id, th.level, th.title, th.desc, th.emoji, [
    ...th.t.map(([title, text], i) => tip(title, text, i < th.t.length - 1 ? 4 : 3) as StepSeed),
    songCat('Música para ouvir com a teoria', 'Todos', 8),
  ])
);

// ── LISTA FINAL: 3 originais (i18n) + 57 novas = 60 ──────────────────────
export const LEARNING_TRAILS: LearningTrail[] = [
  // Trilhas originais (chaves i18n traduzidas nas 8 línguas — ver i18n.tsx)
  {
    id: 'iniciante',
    level: 'iniciante',
    titleKey: 'trails.t1.title',
    descriptionKey: 'trails.t1.desc',
    emoji: '🎸',
    steps: [
      { id: 's1', type: 'tip', titleKey: 'trails.t1.s1', textKey: 'trails.t1.s1t', minutes: 3 },
      { id: 's2', type: 'song', titleKey: 'trails.t1.s2', songTitle: 'Riptide', songArtist: 'Vance Joy', minutes: 8 },
      { id: 's3', type: 'tip', titleKey: 'trails.t1.s3', textKey: 'trails.t1.s3t', minutes: 5 },
      { id: 's4', type: 'song', titleKey: 'trails.t1.s4', songTitle: 'Somewhere Over the Rainbow / What a Wonderful World', songArtist: "Israel Kamakawiwo'ole", minutes: 10 },
      { id: 's5', type: 'tip', titleKey: 'trails.t1.s5', textKey: 'trails.t1.s5t', minutes: 4 },
    ],
  },
  {
    id: 'intermediario',
    level: 'intermediario',
    titleKey: 'trails.t2.title',
    descriptionKey: 'trails.t2.desc',
    emoji: '🔥',
    steps: [
      { id: 's1', type: 'tip', titleKey: 'trails.t2.s1', textKey: 'trails.t2.s1t', minutes: 6 },
      { id: 's2', type: 'song', titleKey: 'trails.t2.s2', songTitle: 'Anunciação', songArtist: 'Alceu Valença', minutes: 8 },
      { id: 's3', type: 'tip', titleKey: 'trails.t2.s3', textKey: 'trails.t2.s3t', minutes: 5 },
      { id: 's4', type: 'song', titleKey: 'trails.t2.s4', songTitle: 'Girassol', songArtist: 'Priscilla Alcantara & Whindersson Nunes', minutes: 8 },
      { id: 's5', type: 'tip', titleKey: 'trails.t2.s5', textKey: 'trails.t2.s5t', minutes: 4 },
    ],
  },
  {
    id: 'avancado',
    level: 'avancado',
    titleKey: 'trails.t3.title',
    descriptionKey: 'trails.t3.desc',
    emoji: '🚀',
    steps: [
      { id: 's1', type: 'tip', titleKey: 'trails.t3.s1', textKey: 'trails.t3.s1t', minutes: 6 },
      { id: 's2', type: 'song', titleKey: 'trails.t3.s2', songTitle: 'Eu Sei Que Vou Te Amar', songArtist: 'Ivete Sangalo', minutes: 8 },
      { id: 's3', type: 'tip', titleKey: 'trails.t3.s3', textKey: 'trails.t3.s3t', minutes: 6 },
      { id: 's4', type: 'song', titleKey: 'trails.t3.s4', songTitle: 'Onde Eu Nasci Passa Um Rio', songArtist: 'Caetano Veloso', minutes: 8 },
      { id: 's5', type: 'tip', titleKey: 'trails.t3.s5', textKey: 'trails.t3.s5t', minutes: 3 },
    ],
  },
  ...chordTrails,
  ...genreTrails,
  ...techTrails,
  ...songTrails,
  ...routineTrails,
  ...theoryTrails,
];

/** Total de minutos de uma trilha (para exibir no card). */
export const trailTotalMinutes = (trail: LearningTrail): number =>
  trail.steps.reduce((acc, s) => acc + s.minutes, 0);
