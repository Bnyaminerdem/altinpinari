/* ============================================
   ALTIN PINARI KUYUMCULUK - APP.JS
   Altınkaynak API'den fiyat çekme + kâr marjı
   ============================================ */

// ---- Ayarlar (Kolayca Değiştirilebilir) ----
const CONFIG = {
  // Kâr marjı (TL) - sadece satış fiyatlarına eklenir
  SATIS_MARKUP: 20,

  // Otomatik güncelleme aralığı (milisaniye)
  REFRESH_INTERVAL: 30000, // 30 saniye

  // API Endpoint'leri
  API_GOLD: 'https://altin-fiyat-proxy.yasireminciftci.workers.dev',

  // Gösterilecek altın türleri ve sıralama
  // Popüler Altınlar (en üstte gösterilir)
  POPULAR_CODES: ['GA', 'C', 'Y', 'T'],

  // Ziynet Altınları (Eski olanlar en alta, --- separator satırı)
  ZIYNET_CODES: ['G', 'A', 'A5', 'R', 'H', '---', 'EG', 'EC', 'EY', 'ET'],
  // Gram & Ayar Altınları
  GRAM_CODES: ['GA', 'GAT', 'HH_T', 'CH_T', 'B', 'B_T', '18', '14'],
  // Borsa & Diğer
  BORSA_CODES: ['XAUUSD', 'AG_T', 'IAB_KAPANIS'],

  // Ürün ikonları
  ICONS: {
    'C': '💰', 'EC': '💰', 'Y': '🪙', 'EY': '🪙',
    'T': '🥇', 'ET': '🥇', 'G': '🏆', 'EG': '🏆',
    'A': '⭐', 'A5': '🌟', 'R': '👑', 'H': '👑',
    'GA': '📊', 'GAT': '📊', 'HH_T': '🔶', 'CH_T': '🔷',
    'B': '📿', 'B_T': '♻️', '18': '🔸', '14': '🔹',
    'XAUUSD': '🌍', 'AG_T': '🪨', 'IAB_KAPANIS': '🏛️'
  },

  // Eski altın kodları ("Eski" etiketi gösterilir)
  ESKI_SET: new Set(['EC', 'EY', 'ET', 'EG']),

  // Ürün açıklama düzeltmeleri (gösterilecek isimler)
  DISPLAY_NAMES: {
    'C': 'Çeyrek Altın',
    'EC': 'Çeyrek Altın',
    'Y': 'Yarım Altın',
    'EY': 'Yarım Altın',
    'T': 'Teklik Altın',
    'ET': 'Teklik Altın',
    'G': 'Gremse Altın',
    'EG': 'Gremse Altın',
    'A': 'Ata Cumhuriyet',
    'A5': 'Ata Beşli',
    'R': 'Reşat Altın',
    'H': 'Hamit Altın',
    'GA': 'Gram Altın',
    'GAT': 'Gram Altın (Toptan)',
    'HH_T': 'Has Altın (Toptan)',
    'CH_T': 'Külçe Altın (Toptan)',
    'B': '22 Ayar Bilezik',
    'B_T': '22 Ayar Hurda',
    '18': '18 Ayar Altın',
    '14': '14 Ayar Altın',
    'XAUUSD': 'Ons Altın (USD)',
    'AG_T': 'Gümüş (TL/gr)',
    'IAB_KAPANIS': 'İAB Kapanış'
  }
};

// ---- Yardımcı Fonksiyonlar ----

/**
 * Türk formatındaki sayıyı float'a çevirir
 * "6.793,87" → 6793.87
 */
function parseTurkishNumber(str) {
  if (!str || str === '-') return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.'));
}

/**
 * Float'ı Türk formatına çevirir
 * 6793.87 → "6.793,87"
 */
function formatTurkishNumber(num) {
  if (num === 0) return '-';
  return num.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Alış fiyatını olduğu gibi formatlar (markup yok)
 */
function formatAlis(priceStr) {
  const price = parseTurkishNumber(priceStr);
  if (price === 0) return '-';
  return formatTurkishNumber(price);
}

/**
 * Satış fiyatına kâr marjı ekler
 */
function addMarkupSatis(priceStr) {
  const price = parseTurkishNumber(priceStr);
  if (price === 0) return '-';
  return formatTurkishNumber(price + CONFIG.SATIS_MARKUP);
}

// ---- State ----
let goldData = [];
let lastUpdateTime = null;
let refreshTimer = null;
let previousPrices = {};

// ---- DOM Elemanları ----
const elements = {
  loadingOverlay: document.getElementById('loading-overlay'),
  clockEl: document.getElementById('live-clock'),
  dateEl: document.getElementById('live-date'),
  updateTimeEl: document.getElementById('update-time'),
  popularTableBody: document.getElementById('popular-table-body'),
  ziynetTableBody: document.getElementById('ziynet-table-body'),
  gramTableBody: document.getElementById('gram-table-body'),
  borsaTableBody: document.getElementById('borsa-table-body'),
  tickerContent: document.getElementById('ticker-content'),
  errorBanner: document.getElementById('error-banner'),
  errorMessage: document.getElementById('error-message'),

  popularBadge: document.getElementById('popular-badge'),
  ziynetBadge: document.getElementById('ziynet-badge'),
  gramBadge: document.getElementById('gram-badge'),
  borsaBadge: document.getElementById('borsa-badge')
};

// ---- Saat ----
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const dateStr = now.toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  if (elements.clockEl) elements.clockEl.textContent = timeStr;
  if (elements.dateEl) elements.dateEl.textContent = dateStr;
}

// ---- API ----
async function fetchGoldPrices() {
  try {
    const response = await fetch(CONFIG.API_GOLD);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    goldData = await response.json();
    lastUpdateTime = new Date();

    hideError();
    renderAllTables();
    renderTicker();
    updateLastUpdateTime();

    // Son fiyatları sakla (değişim tespiti için)
    goldData.forEach(item => {
      previousPrices[item.Kod] = {
        alis: item.Alis,
        satis: item.Satis
      };
    });

  } catch (error) {
    console.error('Fiyat çekme hatası:', error);
    showError('Fiyatlar güncellenirken hata oluştu. Yeniden denenecek...');
  }
}

// ---- Tablo Render ----
function renderTable(tableBody, codes) {
  if (!tableBody) return;

  const dataMap = {};
  goldData.forEach(item => {
    dataMap[item.Kod] = item;
  });

  let html = '';
  let count = 0;

  codes.forEach(code => {
    // Separator satırı
    if (code === '---') {
      html += `
        <tr class="table-separator">
          <td colspan="3">
            <span class="separator-label">Eski Altınlar</span>
          </td>
        </tr>
      `;
      return;
    }

    const item = dataMap[code];
    if (!item) return;
    count++;

    const icon = CONFIG.ICONS[code] || '🔹';
    const displayName = CONFIG.DISPLAY_NAMES[code] || item.Aciklama;
    const alis = formatAlis(item.Alis);
    const satis = addMarkupSatis(item.Satis);
    const isEski = CONFIG.ESKI_SET.has(code);

    // Fiyat değişimi kontrolü
    const prev = previousPrices[code];
    const hasChanged = prev && (prev.alis !== item.Alis || prev.satis !== item.Satis);
    const flashClass = hasChanged ? 'price-flash' : '';
    const eskiClass = isEski ? 'row-eski' : '';

    html += `
      <tr class="${flashClass} ${eskiClass}" data-code="${code}">
        <td>
          <span class="product-icon">${icon}</span>
          <span class="product-name">
            ${displayName}
            ${isEski ? '<span class="eski-tag">Eski</span>' : ''}
          </span>
        </td>
        <td>${alis}</td>
        <td>${satis}</td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
  return count;
}

function renderAllTables() {
  renderTable(elements.popularTableBody, CONFIG.POPULAR_CODES);
  const zCount = renderTable(elements.ziynetTableBody, CONFIG.ZIYNET_CODES);
  const gCount = renderTable(elements.gramTableBody, CONFIG.GRAM_CODES);
  const bCount = renderTable(elements.borsaTableBody, CONFIG.BORSA_CODES);

  if (elements.ziynetBadge) elements.ziynetBadge.textContent = `${zCount} ürün`;
  if (elements.gramBadge) elements.gramBadge.textContent = `${gCount} ürün`;
  if (elements.borsaBadge) elements.borsaBadge.textContent = `${bCount} ürün`;
}

// ---- Ticker ----
function renderTicker() {
  if (!elements.tickerContent || goldData.length === 0) return;

  const tickerCodes = ['GA', 'C', 'Y', 'T', 'A', 'XAUUSD', 'B', 'AG_T'];
  const dataMap = {};
  goldData.forEach(item => { dataMap[item.Kod] = item; });

  let items = '';
  tickerCodes.forEach(code => {
    const item = dataMap[code];
    if (!item) return;
    const displayName = CONFIG.DISPLAY_NAMES[code] || item.Aciklama;
    const satis = addMarkupSatis(item.Satis);
    items += `
      <span class="ticker-item">
        <span class="label">${displayName}</span>
        <span class="value">${satis} ₺</span>
      </span>
      <span class="ticker-divider">•</span>
    `;
  });

  // Ticker'ı iki kez tekrarla (sonsuz kaydırma efekti)
  elements.tickerContent.innerHTML = items + items;
}

// ---- Son Güncelleme ----
function updateLastUpdateTime() {
  if (!elements.updateTimeEl || !lastUpdateTime) return;

  const timeStr = lastUpdateTime.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  elements.updateTimeEl.textContent = `Son güncelleme: ${timeStr}`;
}

// ---- Skeleton (Yükleniyor) ----
function renderSkeletons() {
  const skeletonRow = `
    <tr>
      <td>
        <span class="product-icon" style="opacity:0.3">⬜</span>
        <span class="product-name"><span class="skeleton" style="width:120px"></span></span>
      </td>
      <td><span class="skeleton"></span></td>
      <td><span class="skeleton"></span></td>
    </tr>
  `;

  if (elements.popularTableBody) elements.popularTableBody.innerHTML = skeletonRow.repeat(4);
  if (elements.ziynetTableBody) elements.ziynetTableBody.innerHTML = skeletonRow.repeat(6);
  if (elements.gramTableBody) elements.gramTableBody.innerHTML = skeletonRow.repeat(4);
  if (elements.borsaTableBody) elements.borsaTableBody.innerHTML = skeletonRow.repeat(2);
}

// ---- Hata ----
function showError(message) {
  if (elements.errorBanner) {
    elements.errorBanner.classList.add('visible');
    if (elements.errorMessage) elements.errorMessage.textContent = message;
  }
}

function hideError() {
  if (elements.errorBanner) {
    elements.errorBanner.classList.remove('visible');
  }
}

// ---- Loading ----
function hideLoading() {
  if (elements.loadingOverlay) {
    elements.loadingOverlay.classList.add('hidden');
  }
}

// ---- IBAN Kopyala ----
function copyIban() {
  const iban = 'TR89002050000993950840001';
  navigator.clipboard.writeText(iban).then(() => {
    const btn = document.getElementById('iban-copy-btn');
    const text = document.getElementById('iban-copy-text');
    if (btn && text) {
      btn.classList.add('copied');
      text.textContent = 'Kopyalandı ✓';
      setTimeout(() => {
        btn.classList.remove('copied');
        text.textContent = 'Kopyala';
      }, 2000);
    }
  }).catch(() => {
    // Fallback eski tarayıcılar için
    const el = document.createElement('textarea');
    el.value = iban;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  });
}


// ---- Init ----
async function init() {
  // Saat başlat
  updateClock();
  setInterval(updateClock, 1000);

  // İlk yükleme skeletonları
  renderSkeletons();

  // Fiyatları çek
  await fetchGoldPrices();

  // Loading ekranını kaldır
  setTimeout(hideLoading, 600);

  // Periyodik güncelleme
  refreshTimer = setInterval(fetchGoldPrices, CONFIG.REFRESH_INTERVAL);
}

// Sayfa yüklendiğinde başlat
document.addEventListener('DOMContentLoaded', init);
