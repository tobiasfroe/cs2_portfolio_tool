const PORTFOLIO_ENDPOINT = '/api/portfolio';
const HISTORY_ENDPOINT = '/api/history';
const ITEM_META_PROXY = '/api/item-meta';
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

const formatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR'
});

const formatCurrency = (value) => formatter.format(value).replace(/\u00A0/g, '');

const formatChange = (value, percent) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safePercent = Number.isFinite(percent) ? percent : 0;
  const sign = safeValue > 0 ? '+' : '';
  const percentSign = safePercent > 0 ? '+' : '';
  return `${sign}${formatCurrency(safeValue)} (${percentSign}${safePercent.toFixed(1)}%)`;
};

const portfolioRows = document.getElementById('portfolioRows');
const totalValueEl = document.getElementById('totalValue');
const totalChangeEl = document.getElementById('totalChange');
const lastUpdatedEl = document.getElementById('lastUpdated');
const itemsCountEl = document.getElementById('itemsCount');
const casesCountEl = document.getElementById('casesCount');
const historyCanvas = document.getElementById('historyChart');
const historyTooltip = document.getElementById('historyTooltip');
const historyRangeEl = document.getElementById('historyRange');
const historyEmptyEl = document.getElementById('historyEmpty');

const imageCache = new Map();
const chartState = {
  entries: [],
  points: [],
  dpr: window.devicePixelRatio || 1
};

const fetchJson = async (url) => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} responded with ${response.status}`);
  }

  return response.json();
};

const fetchPortfolioSnapshot = () => fetchJson(PORTFOLIO_ENDPOINT);
const fetchHistoryEntries = () => fetchJson(HISTORY_ENDPOINT);

const fetchItemImage = async (marketHashName) => {
  if (!marketHashName) {
    return null;
  }

  if (imageCache.has(marketHashName)) {
    const cachedValue = imageCache.get(marketHashName);

    if (cachedValue === null) {
      return null;
    }

    if (typeof cachedValue === 'string' && !cachedValue.startsWith('http')) {
      return cachedValue;
    }
  }

  if (!ITEM_META_PROXY) {
    imageCache.set(marketHashName, null);
    return null;
  }

  try {
    const params = new URLSearchParams({ marketHashName });
    const response = await fetch(`${ITEM_META_PROXY}?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Steam item meta responded with ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.image) {
      imageCache.set(marketHashName, data.image);
      return data.image;
    }
  } catch (error) {
    console.error(`Bild konnte für ${marketHashName} nicht geladen werden:`, error);
  }

  imageCache.set(marketHashName, null);
  return null;
};

const renderPortfolio = (snapshot) => {
  const items = snapshot?.items ?? [];
  const totals = snapshot?.totals ?? {};
  const totalValue = Number.isFinite(totals.value)
    ? totals.value
    : items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * (item.quantity ?? 0), 0);
  const baselineTotal = items.reduce(
    (sum, item) => sum + (item.baselineUnitPrice ?? item.unitPrice ?? 0) * (item.quantity ?? 0),
    0
  );
  const totalChangeValue = Number.isFinite(totals.changeValue)
    ? totals.changeValue
    : totalValue - baselineTotal;
  const totalChangePercent = Number.isFinite(totals.changePercent)
    ? totals.changePercent
    : baselineTotal !== 0
    ? (totalChangeValue / baselineTotal) * 100
    : 0;

  const totalCases = Number.isFinite(totals.casesCount)
    ? totals.casesCount
    : items
        .filter((item) => item.type === 'Case')
        .reduce((sum, item) => sum + (item.quantity ?? 0), 0);

  portfolioRows.innerHTML = '';

  items.forEach((item) => {
    if (item.marketHashName && item.image && !imageCache.has(item.marketHashName)) {
      imageCache.set(item.marketHashName, item.image);
    }

    const row = document.createElement('a');
    row.href = item.marketUrl;
    row.target = '_blank';
    row.rel = 'noopener';
    row.className = 'table__row';

    const cachedImage = item.marketHashName ? imageCache.get(item.marketHashName) : null;
    const imageUrl = cachedImage || item.image || BLANK_IMAGE;
    const unitPrice = item.unitPrice ?? 0;
    const baselineUnitPrice = item.baselineUnitPrice ?? unitPrice;
    const quantity = item.quantity ?? 0;
    const totalItemValue = unitPrice * quantity;
    const previousValue = baselineUnitPrice * quantity;
    const changeValue = Number.isFinite(item.changeValue)
      ? item.changeValue
      : totalItemValue - previousValue;
    const changePercent = Number.isFinite(item.changePercent)
      ? item.changePercent
      : previousValue !== 0
      ? ((totalItemValue - previousValue) / previousValue) * 100
      : 0;
    const allocation = totalValue !== 0 ? (totalItemValue / totalValue) * 100 : 0;
    const isPositive = changeValue >= 0;

    row.innerHTML = `
      <span class="table__col table__col--item">
        <span class="item__image">
          <img src="${imageUrl}" alt="${item.name}" loading="lazy" />
        </span>
        <span class="item__meta">
          <span class="item__title">${item.name}</span>
          <span class="item__subtitle">${item.description}</span>
        </span>
      </span>
      <span class="table__col amount">${quantity.toLocaleString('de-DE')}</span>
      <span class="table__col value">${formatCurrency(totalItemValue)} (${formatCurrency(unitPrice)})</span>
      <span class="table__col change" data-positive="${isPositive}">${formatChange(changeValue, changePercent)}</span>
      <span class="table__col allocation">
        <span class="allocation__progress"><span style="width: ${allocation.toFixed(1)}%"></span></span>
        <span class="allocation__label">${allocation.toFixed(1)}%</span>
      </span>
    `;

    const imgEl = row.querySelector('img');
    const shouldFetchImage = Boolean(item.marketHashName) &&
      (cachedImage === undefined || (typeof cachedImage === 'string' && cachedImage.startsWith('http')));

    if (shouldFetchImage) {
      fetchItemImage(item.marketHashName).then((fetchedImage) => {
        if (fetchedImage && fetchedImage !== imgEl.src) {
          imgEl.src = fetchedImage;
        }
      });
    }

    portfolioRows.appendChild(row);
  });

  totalValueEl.textContent = formatCurrency(totalValue);
  totalChangeEl.textContent = formatChange(totalChangeValue, totalChangePercent);
  totalChangeEl.dataset.positive = totalChangeValue >= 0;

  const itemsCount = totals.itemsCount ?? items.length;
  itemsCountEl.textContent = `${itemsCount} Positionen`;
  casesCountEl.textContent = `${totalCases.toLocaleString('de-DE')} Cases insgesamt`;

  const updated = snapshot?.lastUpdated ? new Date(snapshot.lastUpdated) : new Date();
  lastUpdatedEl.textContent = updated.toLocaleString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const updateHistoryRange = (entries) => {
  if (!historyRangeEl) {
    return;
  }

  if (!entries.length) {
    historyRangeEl.textContent = '–';
    return;
  }

  const firstDate = new Date(entries[0].date);
  const lastDate = new Date(entries[entries.length - 1].date);
  const sameYear = firstDate.getFullYear() === lastDate.getFullYear();

  const startLabel = firstDate.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: sameYear ? undefined : 'numeric'
  });

  const endLabel = lastDate.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  historyRangeEl.textContent = `${startLabel} – ${endLabel}`;
};

const drawHistoryChart = () => {
  if (!historyCanvas) {
    return;
  }

  const ctx = historyCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  chartState.dpr = dpr;

  const width = historyCanvas.clientWidth * dpr;
  const height = historyCanvas.clientHeight * dpr;

  if (historyCanvas.width !== width || historyCanvas.height !== height) {
    historyCanvas.width = width;
    historyCanvas.height = height;
  }

  ctx.clearRect(0, 0, width, height);

  if (!chartState.entries.length) {
    if (historyEmptyEl) {
      historyEmptyEl.hidden = false;
    }
    chartState.points = [];
    return;
  }

  if (historyEmptyEl) {
    historyEmptyEl.hidden = true;
  }

  const padding = {
    top: 24 * dpr,
    right: 36 * dpr,
    bottom: 44 * dpr,
    left: 68 * dpr
  };

  const chartWidth = Math.max(width - padding.left - padding.right, 1);
  const chartHeight = Math.max(height - padding.top - padding.bottom, 1);
  const values = chartState.entries.map((entry) => entry.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const gridLines = 4;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1 * dpr;
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridLines; i += 1) {
    const ratio = i / gridLines;
    const y = padding.top + ratio * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    const value = maxValue - ratio * range;
    ctx.fillStyle = 'rgba(244, 247, 255, 0.55)';
    ctx.font = `${12 * dpr}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(formatCurrency(value), padding.left - 12 * dpr, y);
  }

  ctx.setLineDash([]);

  const points = chartState.entries.map((entry, index) => {
    const ratio = chartState.entries.length > 1 ? index / (chartState.entries.length - 1) : 0;
    const x = padding.left + ratio * chartWidth;
    const y = padding.top + (1 - (entry.value - minValue) / range) * chartHeight;
    return { x, y, entry };
  });

  const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, 'rgba(79, 138, 255, 0.35)');
  gradient.addColorStop(1, 'rgba(79, 138, 255, 0.05)');

  ctx.beginPath();
  ctx.moveTo(points[0].x, height - padding.bottom);
  points.forEach((point) => {
    ctx.lineTo(point.x, point.y);
  });
  ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = '#4f8aff';
  ctx.lineWidth = 2 * dpr;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = '#0b1023';
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.fillStyle = '#0b1023';
  });

  chartState.points = points;
};

const renderHistoryChart = (entries) => {
  chartState.entries = entries ?? [];
  updateHistoryRange(chartState.entries);
  drawHistoryChart();
};

const formatTooltip = (entry) => {
  const date = new Date(entry.timestamp ?? entry.date);
  const dateLabel = date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  return `<strong>${formatCurrency(entry.value)}</strong><span>${dateLabel}</span>`;
};

const handleHistoryHover = (event) => {
  if (!historyCanvas || !historyTooltip || !chartState.points.length) {
    return;
  }

  const rect = historyCanvas.getBoundingClientRect();
  const dpr = chartState.dpr;
  const pointerX = (event.clientX - rect.left) * dpr;
  let nearest = null;
  let minDistance = Number.POSITIVE_INFINITY;

  chartState.points.forEach((point) => {
    const distance = Math.abs(point.x - pointerX);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = point;
    }
  });

  if (!nearest || minDistance > 32 * dpr) {
    historyTooltip.hidden = true;
    return;
  }

  historyTooltip.hidden = false;
  historyTooltip.style.left = `${nearest.x / dpr}px`;
  historyTooltip.style.top = `${nearest.y / dpr}px`;
  historyTooltip.innerHTML = formatTooltip(nearest.entry);
};

const resetHistoryTooltip = () => {
  if (historyTooltip) {
    historyTooltip.hidden = true;
  }
};

const initialize = async () => {
  try {
    const [snapshot, history] = await Promise.all([
      fetchPortfolioSnapshot(),
      fetchHistoryEntries()
    ]);

    if (snapshot?.success) {
      renderPortfolio(snapshot);
    } else {
      console.warn('Portfolio snapshot konnte nicht geladen werden.');
    }

    if (history?.success) {
      renderHistoryChart(history.entries);
    } else {
      console.warn('Historische Daten konnten nicht geladen werden.');
      renderHistoryChart([]);
    }
  } catch (error) {
    console.error('Initialisierung fehlgeschlagen:', error);
  }
};

if (historyCanvas) {
  historyCanvas.addEventListener('mousemove', handleHistoryHover);
  historyCanvas.addEventListener('mouseleave', resetHistoryTooltip);
  window.addEventListener('resize', () => {
    drawHistoryChart();
    resetHistoryTooltip();
  });
}

initialize();
