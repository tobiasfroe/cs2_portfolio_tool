'use strict';

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const STEAM_PRICE_ENDPOINT = 'https://steamcommunity.com/market/priceoverview/';

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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CS2 Portfolio server listening on port ${PORT}`);
});
