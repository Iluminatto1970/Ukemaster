import express from 'express';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'URL inválida ou ausente.' });
    return;
  }

  const targetUrl = url.startsWith('http') ? url : `https://${url}`;
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept': '*/*',
      },
    });
    const html = await response.text();
    res.status(200).json({ ok: true, html });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
