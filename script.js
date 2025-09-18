const portfolioData = [
  {
    name: 'Prisma Case',
    type: 'Case',
    description: '5000x · Normal Grade Container',
    quantity: 5000,
    unitPrice: 1.89,
    currency: 'USD',
    changeValue: -125.0,
    image: 'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_fr3AV6aD8O6BpdKKQVmPEwr1zs-c8Tnngl09w52zTmY2sc3jBag8jXpohE_lK7Ede7E2Kfw/360fx360f',
    marketUrl: 'https://steamcommunity.com/market/listings/730/Prisma%20Case',
    marketHashName: 'Prisma Case'
  },
  {
    name: 'Glove Case',
    type: 'Case',
    description: '3x · Extraordinary Gloves Collection',
    quantity: 3,
    unitPrice: 2.55,
    currency: 'EUR',
    changeValue: 3.75,
    image: 'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGJKz2lu_XsnXwtmkJjSU91dh8bj35VTqVBP4io_frHcVuPaoafU1JqiVWWSVkux15OQ8Giiylk0k5mvTnIqpd3PCaQIhWMYkE_lK7EcNeCKW-w/360fx360f',
    marketUrl: 'https://steamcommunity.com/market/listings/730/Glove%20Case',
    marketHashName: 'Glove Case'
  },
  {
    name: 'M4A1-S | Leaded Glass (Fabrikneu)',
    type: 'Rifle Skin',
    description: '1x · Factory New',
    quantity: 1,
    unitPrice: 17.85,
    currency: 'EUR',
    changeValue: 1.12,
    image: 'https://community.akamai.steamstatic.com/economy/image/i0CoZ81Ui0m-9KwlBY1L_18myuGuq1wfhWSaZgMttyVfPaERSR0Wqmu7LAocGIGz3UqlXOLrxM-vMGmW8VNxu5Dx60noTyL8ypexwjFS4_ega6F_H_eAMWrEwL9Jo-loWz22hyIrujqNjsH8dn6ePwB2DpEmFuAMt0HulYa1Nu2z4QWPjt9NnCX63H9M5ys96r1QT-N7rZDTLd1E/360fx360f',
    marketUrl: 'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Leaded%20Glass%20(Factory%20New)',
    marketHashName: 'M4A1-S | Leaded Glass (Factory New)'
  }
];

const USD_TO_EUR = 0.92;
const MARKET_PRICE_PROXY = '';

const getPriceInEur = (price, currency = 'EUR') => {
  if (currency === 'USD') {
    return price * USD_TO_EUR;
  }
  return price;
};

const formatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR'
});

const formatCurrency = (value) => formatter.format(value).replace(/\u00A0/g, '');

const formatChange = (value, percent) => {
  const sign = value > 0 ? '+' : '';
  const percentSign = percent > 0 ? '+' : '';
  return `${sign}${formatCurrency(value)} (${percentSign}${percent.toFixed(1)}%)`;
};

const buildMarketPriceUrl = (params) => {
  const baseUrl = `https://steamcommunity.com/market/priceoverview/?${params.toString()}`;

  if (!MARKET_PRICE_PROXY) {
    return baseUrl;
  }

  if (MARKET_PRICE_PROXY.includes('{url}')) {
    return MARKET_PRICE_PROXY.replace('{url}', encodeURIComponent(baseUrl));
  }

  if (MARKET_PRICE_PROXY.endsWith('?')) {
    return `${MARKET_PRICE_PROXY}${encodeURIComponent(baseUrl)}`;
  }

  return `${MARKET_PRICE_PROXY}${baseUrl}`;
};

const parsePriceString = (priceString) => {
  if (!priceString) {
    return null;
  }

  const normalized = priceString
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const fetchLowestPrice = async (item) => {
  if (!item.marketHashName) {
    return item;
  }

  try {
    const params = new URLSearchParams({
      appid: '730',
      currency: '3',
      market_hash_name: item.marketHashName
    });

    const response = await fetch(buildMarketPriceUrl(params));

    if (!response.ok) {
      throw new Error(`Steam API responded with ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.lowest_price) {
      const price = parsePriceString(data.lowest_price);

      if (price !== null) {
        return {
          ...item,
          unitPrice: price,
          currency: 'EUR'
        };
      }
    }
  } catch (error) {
    console.error(`Preis konnte für ${item.name} nicht geladen werden:`, error);
  }

  return item;
};

const portfolioRows = document.getElementById('portfolioRows');
const totalValueEl = document.getElementById('totalValue');
const totalChangeEl = document.getElementById('totalChange');
const lastUpdatedEl = document.getElementById('lastUpdated');
const itemsCountEl = document.getElementById('itemsCount');
const casesCountEl = document.getElementById('casesCount');

const renderPortfolio = (items) => {
  portfolioRows.innerHTML = '';

  const totalValue = items.reduce(
    (sum, item) => sum + getPriceInEur(item.unitPrice, item.currency) * item.quantity,
    0
  );

  const totalChangeValue = items.reduce((sum, item) => sum + item.changeValue, 0);
  const basePortfolioValue = totalValue - totalChangeValue;
  const totalChangePercent = basePortfolioValue !== 0 ? (totalChangeValue / basePortfolioValue) * 100 : 0;

  const caseItems = items.filter((item) => item.type === 'Case');
  const totalCases = caseItems.reduce((sum, item) => sum + item.quantity, 0);

  items.forEach((item) => {
    const row = document.createElement('a');
    row.href = item.marketUrl;
    row.target = '_blank';
    row.rel = 'noopener';
    row.className = 'table__row';

    const unitPriceEur = getPriceInEur(item.unitPrice, item.currency);
    const totalItemValue = unitPriceEur * item.quantity;
    const allocation = totalValue !== 0 ? (totalItemValue / totalValue) * 100 : 0;
    const isPositive = item.changeValue >= 0;
    const previousValue = totalItemValue - item.changeValue;
    const changePercent = previousValue !== 0 ? (item.changeValue / previousValue) * 100 : 0;

    row.innerHTML = `
      <span class="table__col table__col--item">
        <span class="item__image">
          <img src="${item.image}" alt="${item.name}" loading="lazy" />
        </span>
        <span class="item__meta">
          <span class="item__title">${item.name}</span>
          <span class="item__subtitle">${item.description}</span>
        </span>
      </span>
      <span class="table__col amount">${item.quantity.toLocaleString('de-DE')}</span>
      <span class="table__col value">${formatCurrency(totalItemValue)} (${formatCurrency(unitPriceEur)})</span>
      <span class="table__col change" data-positive="${isPositive}">${formatChange(item.changeValue, changePercent)}</span>
      <span class="table__col allocation">
        <span class="allocation__progress"><span style="width: ${allocation.toFixed(1)}%"></span></span>
        <span class="allocation__label">${allocation.toFixed(1)}%</span>
      </span>
    `;

    portfolioRows.appendChild(row);
  });

  totalValueEl.textContent = formatCurrency(totalValue);

  totalChangeEl.textContent = formatChange(totalChangeValue, totalChangePercent);
  totalChangeEl.dataset.positive = totalChangeValue >= 0;

  itemsCountEl.textContent = `${items.length} Positionen`;
  casesCountEl.textContent = `${totalCases.toLocaleString('de-DE')} Cases insgesamt`;

  const updated = new Date();
  lastUpdatedEl.textContent = updated.toLocaleString('de-DE', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const initialize = async () => {
  const itemsWithLivePrices = await Promise.all(portfolioData.map(fetchLowestPrice));
  renderPortfolio(itemsWithLivePrices);
};

initialize();
