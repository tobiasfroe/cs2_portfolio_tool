'use strict';

const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const STEAM_PRICE_ENDPOINT = 'https://steamcommunity.com/market/priceoverview/';
const STEAM_LISTING_BASE = 'https://steamcommunity.com/market/listings/730/';
const PORTFOLIO_DATA_PATH = path.join(__dirname, 'data', 'portfolio.json');
const PORTFOLIO_HISTORY_PATH = path.join(__dirname, 'data', 'history.json');
const IMAGE_CACHE_TTL = 1000 * 60 * 60 * 24 * 30; // 30 days
const IMAGE_CACHE_DIR = path.join(__dirname, 'cached_images');
const IMAGE_CACHE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const imageCache = new Map();
const priceCache = new Map();
const PRICE_CACHE_TTL = 1000 * 60 * 15; // 15 minutes
const HISTORY_LENGTH = 90;
const USD_TO_EUR = 0.92;

let portfolioDefinition = [];

app.use(express.static(path.join(__dirname)));

if (!fs.existsSync(IMAGE_CACHE_DIR)) {
  fs.mkdirSync(IMAGE_CACHE_DIR, { recursive: true });
}

const loadPortfolioDefinition = async () => {
  try {
    const definitionRaw = await fsPromises.readFile(PORTFOLIO_DATA_PATH, 'utf8');
    portfolioDefinition = JSON.parse(definitionRaw);
  } catch (error) {
    console.error('Failed to load portfolio definition:', error);
    portfolioDefinition = [];
  }
};

const ensureHistoryFile = async () => {
  try {
    await fsPromises.access(PORTFOLIO_HISTORY_PATH, fs.constants.F_OK);
  } catch (error) {
    await fsPromises.mkdir(path.dirname(PORTFOLIO_HISTORY_PATH), { recursive: true });
    await fsPromises.writeFile(PORTFOLIO_HISTORY_PATH, '[]');
  }
};

const readPortfolioHistory = async () => {
  try {
    const historyRaw = await fsPromises.readFile(PORTFOLIO_HISTORY_PATH, 'utf8');
    return JSON.parse(historyRaw);
  } catch (error) {
    console.error('Failed to read portfolio history:', error);
    return [];
  }
};

const writePortfolioHistory = async (history) => {
  await fsPromises.writeFile(PORTFOLIO_HISTORY_PATH, JSON.stringify(history, null, 2));
};

const toDateKey = (timestamp) => timestamp.slice(0, 10);

const upsertHistoryEntry = async (totalValue, timestampIso) => {
  await ensureHistoryFile();
  const history = await readPortfolioHistory();
  const dateKey = toDateKey(timestampIso);
  const next = history.slice();
  const existingIndex = next.findIndex((entry) => entry.date === dateKey);

  if (existingIndex >= 0) {
    next[existingIndex] = {
      ...next[existingIndex],
      value: Number(totalValue.toFixed(2)),
      timestamp: timestampIso
    };
  } else {
    next.push({ date: dateKey, value: Number(totalValue.toFixed(2)), timestamp: timestampIso });
  }

  next.sort((a, b) => new Date(a.date) - new Date(b.date));

  while (next.length > HISTORY_LENGTH) {
    next.shift();
  }

  await writePortfolioHistory(next);
  return next;
};

const hashMarketHashName = (marketHashName) =>
  crypto.createHash('sha1').update(marketHashName).digest('hex');

const convertToEur = (price, currency = 'EUR') => {
  if (price === null || price === undefined) {
    return null;
  }

  if (currency === 'USD') {
    return price * USD_TO_EUR;
  }

  return price;
};

const parsePriceString = (priceString) => {
  if (!priceString) {
    return null;
  }

  const normalized = priceString
    .trim()
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const fetchLivePrice = async (marketHashName) => {
  if (!marketHashName) {
    return null;
  }

  const cached = priceCache.get(marketHashName);

  if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
    return cached.price;
  }

  const params = new URLSearchParams({
    appid: '730',
    currency: '3',
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

    if (!data.success) {
      throw new Error('Steam API indicated failure');
    }

    const priceString = data.lowest_price ?? data.median_price ?? null;
    const parsedPrice = parsePriceString(priceString);

    if (parsedPrice === null) {
      throw new Error('Could not parse Steam price');
    }

    const price = { value: parsedPrice, currency: 'EUR' };
    priceCache.set(marketHashName, { price, timestamp: Date.now() });
    return price;
  } catch (error) {
    console.error(`Steam price fetch failed for ${marketHashName}:`, error);
    return null;
  }
};

const resolvePortfolioSnapshot = async () => {
  if (!portfolioDefinition.length) {
    await loadPortfolioDefinition();
  }

  const enrichedItems = await Promise.all(
    portfolioDefinition.map(async (item) => {
      const livePrice = await fetchLivePrice(item.marketHashName);
      const baselineUnitPriceEur = convertToEur(item.baselineUnitPrice, item.baselineCurrency) ?? 0;
      const unitPrice = livePrice?.value ?? baselineUnitPriceEur;
      const currency = livePrice?.currency ?? 'EUR';
      const unitPriceEur = convertToEur(unitPrice, currency) ?? 0;
      const changePerUnit = unitPriceEur - baselineUnitPriceEur;
      const changeValue = changePerUnit * item.quantity;
      const changePercent =
        baselineUnitPriceEur !== 0 ? (changePerUnit / baselineUnitPriceEur) * 100 : 0;

      return {
        ...item,
        unitPrice: Number(unitPriceEur.toFixed(2)),
        currency: 'EUR',
        baselineUnitPrice: Number(baselineUnitPriceEur.toFixed(2)),
        changeValue: Number(changeValue.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        priceSource: livePrice ? 'live' : 'baseline'
      };
    })
  );

  const totalValue = enrichedItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );
  const baselineValue = enrichedItems.reduce(
    (sum, item) => sum + item.baselineUnitPrice * item.quantity,
    0
  );
  const totalChangeValue = totalValue - baselineValue;
  const totalChangePercent = baselineValue !== 0 ? (totalChangeValue / baselineValue) * 100 : 0;
  const totalCases = enrichedItems
    .filter((item) => item.type === 'Case')
    .reduce((sum, item) => sum + item.quantity, 0);

  const snapshot = {
    success: true,
    lastUpdated: new Date().toISOString(),
    totals: {
      value: Number(totalValue.toFixed(2)),
      baseline: Number(baselineValue.toFixed(2)),
      changeValue: Number(totalChangeValue.toFixed(2)),
      changePercent: Number(totalChangePercent.toFixed(2)),
      casesCount: totalCases,
      itemsCount: enrichedItems.length
    },
    items: enrichedItems
  };

  await upsertHistoryEntry(snapshot.totals.value, snapshot.lastUpdated);
  return snapshot;
};

loadPortfolioDefinition().catch((error) => {
  console.error('Initial portfolio load failed:', error);
});

ensureHistoryFile().catch((error) => {
  console.error('Initial history preparation failed:', error);
});

const resolveCachedImagePath = async (marketHashName) => {
  const hash = hashMarketHashName(marketHashName);

  for (const ext of IMAGE_CACHE_EXTENSIONS) {
    const filePath = path.join(IMAGE_CACHE_DIR, `${hash}${ext}`);

    try {
      await fsPromises.access(filePath, fs.constants.F_OK);
      return filePath;
    } catch (error) {
      // Continue searching other extensions
    }
  }

  return null;
};

const contentTypeToExtension = (contentType = '') => {
  if (contentType.includes('png')) {
    return '.png';
  }

  if (contentType.includes('webp')) {
    return '.webp';
  }

  if (contentType.includes('jpeg')) {
    return '.jpeg';
  }

  if (contentType.includes('jpg')) {
    return '.jpg';
  }

  return '.png';
};

const removeStaleImageVariants = async (hash, extensionToKeep) => {
  await Promise.all(
    IMAGE_CACHE_EXTENSIONS.filter((ext) => ext !== extensionToKeep).map(async (ext) => {
      const variantPath = path.join(IMAGE_CACHE_DIR, `${hash}${ext}`);

      try {
        await fsPromises.unlink(variantPath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn(`Failed to remove cached variant ${variantPath}:`, error);
        }
      }
    })
  );
};

const persistImageToCache = async (marketHashName, buffer, contentType) => {
  const hash = hashMarketHashName(marketHashName);
  const extension = contentTypeToExtension(contentType);
  const filePath = path.join(IMAGE_CACHE_DIR, `${hash}${extension}`);

  await removeStaleImageVariants(hash, extension);
  await fsPromises.writeFile(filePath, buffer);

  return filePath;
};

const toWebPath = (absolutePath) => `/${path.relative(__dirname, absolutePath).replace(/\\/g, '/')}`;

const downloadAndCacheImage = async (marketHashName, imageUrl) => {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'cs2-portfolio-tool/1.0',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Steam image responded with ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type') || '';

  const cachedPath = await persistImageToCache(marketHashName, buffer, contentType);
  return toWebPath(cachedPath);
};

app.get('/api/portfolio', async (req, res) => {
  try {
    const snapshot = await resolvePortfolioSnapshot();
    return res.json(snapshot);
  } catch (error) {
    console.error('Failed to resolve portfolio snapshot:', error);
    return res.status(500).json({ success: false, error: 'portfolio_snapshot_failed' });
  }
});

app.get('/api/history', async (req, res) => {
  try {
    await ensureHistoryFile();
    const history = await readPortfolioHistory();
    const limitParam = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 30;
    const startIndex = Math.max(history.length - limit, 0);
    return res.json({ success: true, entries: history.slice(startIndex) });
  } catch (error) {
    console.error('Failed to load history:', error);
    return res.status(500).json({ success: false, error: 'history_load_failed' });
  }
});

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

  const cachedImagePath = await resolveCachedImagePath(marketHashName);

  if (cachedImagePath) {
    const webPath = toWebPath(cachedImagePath);
    imageCache.set(marketHashName, { image: webPath, timestamp: Date.now() });
    res.set('Cache-Control', 'public, max-age=86400');
    return res.json({ success: true, image: webPath });
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

    if (!image) {
      imageCache.set(marketHashName, { image: null, timestamp: Date.now() });
      return res.status(404).json({ success: false, error: 'image_not_found' });
    }

    try {
      const cachedPath = await downloadAndCacheImage(marketHashName, image);
      imageCache.set(marketHashName, { image: cachedPath, timestamp: Date.now() });
      res.set('Cache-Control', 'public, max-age=86400');
      return res.json({ success: true, image: cachedPath });
    } catch (downloadError) {
      console.error('Failed to persist Steam image locally:', downloadError);
      imageCache.set(marketHashName, { image, timestamp: Date.now() });
      return res.json({ success: true, image });
    }
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
