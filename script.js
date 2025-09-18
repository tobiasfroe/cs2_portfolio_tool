const portfolioData = [
  {
    name: 'Prisma Case',
    type: 'Case',
    description: '5000x · Normal Grade Container',
    quantity: 5000,
    unitPrice: 0.18,
    changeValue: -125.0,
    changePercent: -12.9,
    image: 'assets/prisma-case.svg',
    marketUrl: 'https://steamcommunity.com/market/listings/730/Prisma%20Case'
  },
  {
    name: 'Glove Case',
    type: 'Case',
    description: '3x · Extraordinary Gloves Collection',
    quantity: 3,
    unitPrice: 2.55,
    changeValue: 3.75,
    changePercent: 5.2,
    image: 'assets/glove-case.svg',
    marketUrl: 'https://steamcommunity.com/market/listings/730/Glove%20Case'
  },
  {
    name: 'M4A1-S | Leaded Glass (Fabrikneu)',
    type: 'Rifle Skin',
    description: '1x · Factory New',
    quantity: 1,
    unitPrice: 17.85,
    changeValue: 1.12,
    changePercent: 2.7,
    image: 'assets/m4a1s-leaded-glass.svg',
    marketUrl: 'https://steamcommunity.com/market/listings/730/M4A1-S%20%7C%20Leaded%20Glass%20(Factory%20New)'
  }
];

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

const totalValue = portfolioData.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
const totalChange = portfolioData.reduce((sum, item) => sum + item.changeValue, 0);

const caseItems = portfolioData.filter((item) => item.type === 'Case');
const totalCases = caseItems.reduce((sum, item) => sum + item.quantity, 0);

portfolioData.forEach((item) => {
  const row = document.createElement('a');
  row.href = item.marketUrl;
  row.target = '_blank';
  row.rel = 'noopener';
  row.className = 'table__row';

  const totalItemValue = item.unitPrice * item.quantity;
  const allocation = (totalItemValue / totalValue) * 100;
  const isPositive = item.changeValue >= 0;

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
    <span class="table__col change" data-positive="${isPositive}">${formatChange(item.changeValue, item.changePercent)}</span>
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
