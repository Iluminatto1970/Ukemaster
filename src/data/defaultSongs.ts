/**
 * Acervo inicial/semente: músicas e playlists padrão usadas no primeiro carregamento (fallback sem nuvem).
 */
import { Song, Playlist, StrummingPattern } from '../types';

export const DEFAULT_SONGS: Song[] = [
  {
    id: 'song-1',
    title: 'Anunciação',
    artist: 'Alceu Valença',
    key: 'G',
    tempo: 105,
    strummingPattern: '↓  ↓ ↑  ↑ ↓ ↑',
    difficulty: 'Simplificado',
    category: 'MPB',
    youtubeId: '9vK6G6K7aSo',
    youtubeUrl: 'https://www.youtube.com/watch?v=9vK6G6K7aSo',
    tags: ['MPB', 'Nacional', 'Popular'],
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    content: `[Intro]
[G] [Am] [C] [G]

[Verso 1]
Na [G]bruma leve das paixões que vem de [Am]dentro
Tu [C]vens chegando pra brincar no meu [G]quintal
No [G]teu cavalo, peito nu, cabelo ao [Am]vento
O [C]sol quartando a nossa roupa no [G]varal

[Refrão]
[G]Tu vieste ver, [Am]tu vieste ver
[C]A bruma leve que passa por [G]aqui
[G]Tu vieste ver, [Am]tu vieste ver
[C]A bruma leve que passa por [G]aqui

[Verso 2]
A [G]sua voz na noite fria me a[Am]calma
Eu [C]escuto a sinfonia lá do [G]mar
A [G]noite passa, a madrugada se apro[Am]xima
E o [C]sino da matriz vai ba[G]tear

[Refrão]
[G]Tu vieste ver, [Am]tu vieste ver
[C]A bruma leve que passa por [G]aqui
[G]Tu vieste ver, [Am]tu vieste ver
[C]A bruma leve que passa por [G]aqui
`,
  },
  {
    id: 'song-2',
    title: 'Somewhere Over the Rainbow / What a Wonderful World',
    artist: "Israel Kamakawiwo'ole",
    key: 'C',
    tempo: 88,
    strummingPattern: '↓  ↓ ↑  ↑ ↓ ↑',
    difficulty: 'Médio',
    category: 'Internacional',
    youtubeId: 'V1bFr2SWP1I',
    youtubeUrl: 'https://www.youtube.com/watch?v=V1bFr2SWP1I',
    tags: ['Clássico', 'Hawaii', 'Internacional'],
    createdAt: '2026-01-16T10:00:00Z',
    updatedAt: '2026-01-16T10:00:00Z',
    content: `[Intro]
[C] [Em] [F] [C] [F] [E7] [Am] [F]

[Verso 1]
Oooo... [C] [Em] [F] [C]
Oooo... [F] [C] [G] [Am] [F]

[Refrão 1]
[C]Somewhere [Em]over the rainbow [F]way up [C]high
[F]And the [C]dreams that you dream of [G]once in a lulla[Am]by [F]
[C]Somewhere [Em]over the rainbow [F]bluebirds [C]fly
[F]And the [C]dreams that you dream of, [G]dreams really do come [Am]true [F]

[Verso 2]
Someday I'll [C]wish upon a star
And [G]wake up where the clouds are far be[Am]hind [F]me
Where [C]troubles melt like lemon drops
[G]High above the chimney tops that's [Am]where you'll [F]find me

[Refrão 2]
[C]Somewhere [Em]over the rainbow [F]bluebirds [C]fly
[F]And the [C]there you dare to, oh [G]why, oh why can't [Am]I? [F]

[Ponte - What a Wonderful World]
I see [C]trees of [Em]green, [F]red roses [C]too
[F]I watch them [C]bloom, for [E7]me and [Am]you
And I [F]think to myself, [G]what a wonderful [Am]world [F]
I see [C]skies of [Em]blue and [F]clouds of [C]white
The [F]bright blessed [C]day, the [E7]dark sacred [Am]night
And I [F]think to myself, [G]what a wonderful [C]world [F] [C]
`,
  },
  {
    id: 'song-3',
    title: 'Riptide',
    artist: 'Vance Joy',
    key: 'Am',
    tempo: 102,
    strummingPattern: '↓  ↓ ↑  ↓ ↑',
    difficulty: 'Simplificado',
    category: 'Pop',
    youtubeId: 'uJ_1HMAGb4k',
    youtubeUrl: 'https://www.youtube.com/watch?v=uJ_1HMAGb4k',
    tags: ['Indie', 'Pop', 'Internacional'],
    createdAt: '2026-01-17T10:00:00Z',
    updatedAt: '2026-01-17T10:00:00Z',
    content: `[Intro]
[Am] [G] [C] (x2)

[Verso 1]
[Am]I was scared of [G]dentists and the [C]dark
[Am]I was scared of [G]pretty girls and [C]starting conversations
[Am]Oh, all my [G]friends are turning [C]green
[Am]You're the magician's [G]assistant in their [C]dreams

[Refrão]
Ooh, [Am]ooh, [G]ooh [C]
Ooh, [Am]ooh and they [G]come unstuck [C]
Lady, [Am]running down to the [G]riptide, taken away to the [C]dark side
I [Am]wanna be your [G]right hand [C]man
I love [Am]you when you're singing that [G]song and, I got a lump in my [C]throat 'cause
You're [Am]gonna sing the [G]words wrong [C]

[Verso 2]
[Am]There's this movie [G]that I think you'll [C]like
[Am]This guy decides to [G]quit his job and [C]heads to New York City
[Am]This cowboy's [G]running from himself [C]
And [Am]she's been living on the [G]highest shelf [C]

[Refrão]
Lady, [Am]running down to the [G]riptide, taken away to the [C]dark side
I [Am]wanna be your [G]right hand [C]man
I love [Am]you when you're singing that [G]song and, I got a lump in my [C]throat 'cause
You're [Am]gonna sing the [G]words wrong [C]
`,
  },
  {
    id: 'song-4',
    title: 'Girassol',
    artist: 'Priscilla Alcantara & Whindersson Nunes',
    key: 'C',
    tempo: 75,
    strummingPattern: '↓ ↑↓↑  ↓ ↑↓↑',
    difficulty: 'Médio',
    category: 'Gospel',
    youtubeId: '3CGr_B2K2yM',
    youtubeUrl: 'https://www.youtube.com/watch?v=3CGr_B2K2yM',
    tags: ['Gospel', 'Pop', 'Nacional'],
    createdAt: '2026-01-18T10:00:00Z',
    updatedAt: '2026-01-18T10:00:00Z',
    content: `[Intro]
[C] [G] [Am] [F]

[Verso 1]
Eu [C]quero ser a cura, eu quero [G]ser a paz
Eu quero [Am]ser o abraço que con[F]sola os pais
Eu [C]quero ser a mão que estende ao [G]caído
O a[Am]migo que escuta o seu a[F]migo

[Refrão]
E se eu [C]for girassol, seja o meu [G]sol
Pra onde eu [Am]olhar, eu veja a Tua [F]luz
E se a [C]noite chegar, seja o [G]farol
Que me [Am]guia de volta pro abraço de [F]Jesus

[Verso 2]
Se eu [C]tiver um teto, que ele a[G]brigue quem não tem
Se eu [Am]tiver a mesa cheia, que eu di[F]vida com alguém
Se a [C]vida for um sopro, que eu a[G]proveite cada dia
Prai[Am]ando esperança e transbor[F]dando de alegria

[Refrão]
E se eu [C]for girassol, seja o meu [G]sol
Pra onde eu [Am]olhar, eu veja a Tua [F]luz
E se a [C]noite chegar, seja o [G]farol
Que me [Am]guia de volta pro abraço de [F]Jesus
`,
  },
  {
    id: 'song-5',
    title: 'Vou Deixar',
    artist: 'Skank',
    key: 'D',
    tempo: 120,
    strummingPattern: '↓ ↑ X ↑  ↓ ↑ X ↑',
    difficulty: 'Avançado',
    category: 'Rock',
    youtubeId: 'qfE8WwXzN6I',
    youtubeUrl: 'https://www.youtube.com/watch?v=qfE8WwXzN6I',
    tags: ['Rock', 'Nacional', 'Anos 2000'],
    createdAt: '2026-01-19T10:00:00Z',
    updatedAt: '2026-01-19T10:00:00Z',
    content: `[Intro]
[D] [Bm] [G] [A] (x2)

[Verso 1]
[D]Vou deixar a vida me [Bm]levar
Pra onde [G]ela quiser ir [A]
[D]Vou deixar meu coração [Bm]falar
Quando [G]for pra me ouvir [A]

[Refrão]
[D]Vou deixar, vou dei[Bm]xar
[G]A vida me le[A]var
[D]Vou deixar, vou dei[Bm]xar
[G]A vida me le[A]var

[Verso 2]
[D]Se tudo der certo no fi[Bm]nal
[G]Não precisa preocupar [A]
[D]Se der errado tudo [Bm]bem
A gente [G]torna a tentar [A]

[Refrão]
[D]Vou deixar, vou dei[Bm]xar
[G]A vida me le[A]var
[D]Vou deixar, vou dei[Bm]xar
[G]A vida me le[A]var
`,
  },
];

export const DEFAULT_PLAYLISTS: Playlist[] = [
  {
    id: 'pl-1',
    title: '⭐ Favoritas do Ukulele',
    description: 'Músicas essenciais e gostosas de tocar.',
    category: 'Pop',
    difficulty: 'Simplificado',
    songIds: ['song-1', 'song-2', 'song-3'],
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'pl-2',
    title: '🇧🇷 MPB & Nacionais',
    description: 'Clássicos e sucessos em português.',
    category: 'MPB',
    difficulty: 'Médio',
    songIds: ['song-1', 'song-4', 'song-5'],
    createdAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 'pl-3',
    title: '🚀 Para Iniciantes',
    description: 'Músicas fáceis com 3 a 4 acordes abertos.',
    category: 'Pop',
    difficulty: 'Simplificado',
    songIds: ['song-1', 'song-3', 'song-5'],
    createdAt: '2026-01-03T00:00:00Z',
  },
];

export const DEFAULT_STRUMMING_PATTERNS: StrummingPattern[] = [
  {
    id: 'strum-1',
    name: 'Batida Pop Básica (Calypso / Pop-Rock)',
    timeSignature: '4/4',
    pattern: '↓  ↓ ↑  ↑ ↓ ↑',
    description: 'A batida mais famosa do ukulele! Usada em Riptide, Somewhere Over the Rainbow, etc.',
    genre: 'Pop / Folk / Rock',
    beats: ['down', 'down', 'up', 'up', 'down', 'up'],
  },
  {
    id: 'strum-2',
    name: 'Reggae / Ska Offbeat',
    timeSignature: '4/4',
    pattern: 'X ↑ X ↑ X ↑ X ↑',
    description: 'Acentua o contratempo (upstrokes) com abafamento nos tempos fortes.',
    genre: 'Reggae / Ska',
    beats: ['mute', 'up', 'mute', 'up', 'mute', 'up', 'mute', 'up'],
  },
  {
    id: 'strum-3',
    name: 'Samba / Choro Suave',
    timeSignature: '2/4',
    pattern: '↓  ↑↓↑  ↓  ↑↓↑',
    description: 'Batida com balanço brasileiro e batida rápida nas cordas agudas.',
    genre: 'MPB / Samba / Bossa',
    beats: ['down', 'up', 'down', 'up', 'down', 'up', 'down', 'up'],
  },
  {
    id: 'strum-4',
    name: 'Valsa / 3/4 Suave',
    timeSignature: '3/4',
    pattern: '↓  ↓ ↑  ↓ ↑',
    description: 'Usada em baladas, sertanejo e canções em tempo ternário (1 2 3).',
    genre: 'Balada / Valsa',
    beats: ['down', 'down', 'up', 'down', 'up'],
  },
  {
    id: 'strum-5',
    name: 'Dedilhado PIMA (1-2-3-4)',
    timeSignature: '4/4',
    pattern: 'P - I - M - A - M - I',
    description: 'Com o polegar no G/C, indicador no E e médio no A, selecione nota por nota.',
    genre: 'Fingerstyle / Acústico',
    beats: ['down', 'up', 'down', 'up', 'down', 'up'],
  },
];
