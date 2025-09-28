'use strict';

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const STEAM_PRICE_ENDPOINT = 'https://steamcommunity.com/market/priceoverview/';
const STEAM_LISTING_BASE = 'https://steamcommunity.com/market/listings/730/';
const IMAGE_CACHE_TTL = 1000 * 60 * 60; // 1 hour
const imageCache = new Map();

app.use(express.static(path.join(__dirname)));

app.get('/api/price', async (req, res) => {
  const appId = (req.query.appid || '730').toString();
  const currency = (req.query.currency || '3').toString();
  const marketHashName = req.query.marketHashName;

  if (!marketHashName) {
    return res.status(400).json({ success: false, error: 'missing_market_hash_name' });
  }

  const params = new URLSearchParams({
    appid: appId,
    currency,
    market_hash_name: marketHashName
  });

  try {
    const response = await fetch(`${STEAM_PRICE_ENDPOINT}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'cs2-portfolio-tool/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Steam responded with ${response.status}`);
    }

    const data = await response.json();
    res.set('Cache-Control', 'public, max-age=60');
    return res.json(data);
  } catch (error) {
    console.error('Steam price fetch failed:', error);
    return res.status(502).json({ success: false, error: 'steam_price_fetch_failed' });
  }
});

const decodeSteamImageUrl = (value) => {
  if (!value) {
    return null;
  }

  try {
    const normalized = value.replace(/"/g, '\"');
    return JSON.parse(`"${normalized}"`);
  } catch (error) {
    return value
      .replace(/\\\//g, '/')
      .replace(/\\u0026/g, '&')
      .replace(/&amp;/g, '&');
  }
};

const extractSteamImageUrl = (html) => {
  const metaMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);

  if (metaMatch && metaMatch[1]) {
    return decodeSteamImageUrl(metaMatch[1]);
  }

  const genericMatch = html.match(/https:\/\/[^"\\]*economy\/image\/[^"\\]*/);

  if (genericMatch && genericMatch[0]) {
    return decodeSteamImageUrl(genericMatch[0]);
  }

  return null;
};

app.get('/api/item-meta', async (req, res) => {
  const marketHashName = req.query.marketHashName;

  if (!marketHashName) {
    return res.status(400).json({ success: false, error: 'missing_market_hash_name' });
  }

  const cached = imageCache.get(marketHashName);
  if (cached && Date.now() - cached.timestamp < IMAGE_CACHE_TTL) {
    return res.json({ success: Boolean(cached.image), image: cached.image });
  }

  const encodedName = encodeURIComponent(marketHashName);

  try {
    const response = await fetch(`${STEAM_LISTING_BASE}${encodedName}`, {
      headers: {
        'User-Agent': 'cs2-portfolio-tool/1.0',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`Steam listing responded with ${response.status}`);
    }

    const html = await response.text();
    const image = extractSteamImageUrl(html);

    imageCache.set(marketHashName, { image, timestamp: Date.now() });

    if (image) {
      res.set('Cache-Control', 'public, max-age=3600');
      return res.json({ success: true, image });
    }

    return res.status(404).json({ success: false, error: 'image_not_found' });
  } catch (error) {
    console.error('Steam item meta fetch failed:', error);
    imageCache.set(marketHashName, { image: null, timestamp: Date.now() });
    return res.status(502).json({ success: false, error: 'steam_item_meta_fetch_failed' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CS2 Portfolio server listening on port ${PORT}`);
});
