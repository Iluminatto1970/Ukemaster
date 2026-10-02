// src/services/__tests__/search.test.js
// Cobertura do serviço de busca (RPC search_songs + fallback ilike).
// Diagnóstico: docs/diagnostico-busca-2026-09-19.md

const mockFetch = jest.fn();
global.fetch = mockFetch;

const HEADERS_COUNT = new Map([['content-range', '0-0/42']]);

function respostaJson(data, headers = new Map(), ok = true) {
  return {
    ok,
    json: async () => data,
    headers: { get: k => headers.get(k) || null },
  };
}

function carregarModulo() {
  let mod;
  jest.isolateModules(() => {
    mod = require('../search.js');
  });
  return mod;
}

describe('searchSongs', () => {
  let searchSongs;

  beforeAll(() => {
    ({ searchSongs } = carregarModulo());
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('não chama a API com termo vazio', async () => {
    const r = await searchSongs('   ');
    expect(r.items).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('usa a RPC search_songs como caminho primário', async () => {
    mockFetch.mockResolvedValueOnce(respostaJson([{ id: 'a', title: 'A' }]));
    const r = await searchSongs('legiao urbana', { limite: 5 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/rest/v1/rpc/search_songs');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ q: 'legiao urbana', lim: 5, off: 0 });
    expect(r.items).toHaveLength(1);
  });

  it('cai para o fallback ilike quando a RPC não existe (404/PGRST202)', async () => {
    mockFetch
      .mockResolvedValueOnce(respostaJson({ code: 'PGRST202' }, new Map(), false)) // RPC ausente
      .mockResolvedValueOnce(respostaJson([{ id: 'b' }])); // fallback

    const r = await searchSongs('Valença');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const urlFallback = decodeURIComponent(mockFetch.mock.calls[1][0]);
    expect(urlFallback).toContain('/rest/v1/songs?');
    expect(urlFallback).toContain('title.ilike.*Valença*');
    expect(urlFallback).toContain('title.ilike.*Valenca*'); // variante sem acento
    expect(urlFallback).toContain('artist.ilike.*Valenca*');
    expect(r.items).toHaveLength(1);
  });

  it('fallback ilike: aplica limite customizado e contagem via Content-Range', async () => {
    mockFetch
      .mockResolvedValueOnce(respostaJson({ code: 'PGRST202' }, new Map(), false))
      .mockResolvedValueOnce(respostaJson([{ id: 'x' }]))
      .mockResolvedValueOnce(respostaJson([], HEADERS_COUNT));

    const r = await searchSongs('legiao', { limite: 5, comCont: true });

    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(42);
    const urlContagem = decodeURIComponent(mockFetch.mock.calls[2][0]);
    expect(urlContagem).toContain('select=id');
    expect(urlContagem).not.toContain('order=');
  });

  it('retorna vazio em falha de rede', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    const r = await searchSongs('teste');
    expect(r.items).toEqual([]);
  });
});

describe('createDebouncedSearcher (debounce)', () => {
  let mod;

  beforeAll(() => {
    mod = carregarModulo();
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('aguarda o intervalo e devolve resultados uma única vez', async () => {
    const fn = jest.fn();
    const buscar = mod.createDebouncedSearcher(fn, 300);

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(respostaJson([{ id: 'a', title: 'A' }]));

    buscar('legiao');
    buscar('legiao ');
    buscar('legiao u');
    expect(fn).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(350);
    expect(mockFetch).toHaveBeenCalledTimes(1); // RPC: apenas 1 chamada
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].items).toHaveLength(1);
  });

  it('deduplica termo idêntico já buscado', async () => {
    const fn = jest.fn();
    const buscar = mod.createDebouncedSearcher(fn, 50);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(respostaJson([]));

    buscar('rock');
    await jest.advanceTimersByTimeAsync(60);
    buscar('rock'); // igual ao anterior → ignorado
    await jest.advanceTimersByTimeAsync(60);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
