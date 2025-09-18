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
    marketUrl: 'https://steamcommunity.com/market/listings/730/Prisma%20Case'
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
    marketUrl: 'https://steamcommunity.com/market/listings/730/Glove%20Case'
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
    marketUrl: 'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Leaded%20Glass%20(Factory%20New)'
  }
];

const USD_TO_EUR = 0.92;

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

const formatChange = (value, percent) => {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatter.format(value)} (${sign}${percent.toFixed(1)}%)`;
};

const portfolioRows = document.getElementById('portfolioRows');
const totalValueEl = document.getElementById('totalValue');
const totalChangeEl = document.getElementById('totalChange');
const lastUpdatedEl = document.getElementById('lastUpdated');
const itemsCountEl = document.getElementById('itemsCount');
const casesCountEl = document.getElementById('casesCount');

const totalValue = portfolioData.reduce(
  (sum, item) => sum + getPriceInEur(item.unitPrice, item.currency) * item.quantity,
  0
);
const totalChange = portfolioData.reduce((sum, item) => sum + item.changeValue, 0);

const caseItems = portfolioData.filter((item) => item.type === 'Case');
const totalCases = caseItems.reduce((sum, item) => sum + item.quantity, 0);

portfolioData.forEach((item) => {
  const row = document.createElement('a');
  row.href = item.marketUrl;
  row.target = '_blank';
  row.rel = 'noopener';
  row.className = 'table__row';

  const unitPriceEur = getPriceInEur(item.unitPrice, item.currency);
  const totalItemValue = unitPriceEur * item.quantity;
  const allocation = (totalItemValue / totalValue) * 100;
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
    <span class="table__col value">${formatter.format(totalItemValue)}</span>
    <span class="table__col change" data-positive="${isPositive}">${formatChange(item.changeValue, changePercent)}</span>
    <span class="table__col allocation">
      <span class="allocation__progress"><span style="width: ${allocation.toFixed(1)}%"></span></span>
      <span class="allocation__label">${allocation.toFixed(1)}%</span>
    </span>
  `;

  portfolioRows.appendChild(row);
});

totalValueEl.textContent = formatter.format(totalValue);

totalChangeEl.textContent = formatChange(totalChange, (totalChange / (totalValue - totalChange)) * 100 || 0);
totalChangeEl.dataset.positive = totalChange >= 0;

itemsCountEl.textContent = `${portfolioData.length} Positionen`;
casesCountEl.textContent = `${totalCases.toLocaleString('de-DE')} Cases insgesamt`;

const updated = new Date();
lastUpdatedEl.textContent = updated.toLocaleString('de-DE', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});
