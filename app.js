/* ============================================
   ALTIN PINARI KUYUMCULUK - APP.JS
   Altınkaynak API'den fiyat çekme + kâr marjı
   ============================================ */

// ---- Ayarlar (Kolayca Değiştirilebilir) ----
const CONFIG = {
  // Satış fiyatlarına eklenen kâr marjı (TL)
  SATIS_MARKUP: 20,

  // Otomatik güncelleme aralığı (ms)
  REFRESH_INTERVAL: 30000,

  // API
  API_GOLD: 'https://altin-fiyat-proxy.yasireminciftci.workers.dev',

  // Sarrafiye: Eski→Yeni çiftler halinde, sonra diğerleri
  ZIYNET_CODES: ['EC', 'C', 'EY', 'Y', 'ET', 'T', 'EG', 'G', 'A', 'A5', 'R', 'H'],

  // Gram & Toptan (22 Ayar Hurda kaldırıldı)
  GRAM_CODES: ['GA', 'GAT', 'HH_T', 'CH_T', 'A_T', 'B', '18', '14'],

  // Diğer
  BORSA_CODES: ['XAUUSD', 'AG_T'],

  // Yeni sarrafiye alışını ESKİ alışından + bonus ile göster
  // (C'nin alışı = EC alışı + 100 TL)
  YENI_ALIS_FROM: { 'C': 'EC', 'Y': 'EY', 'T': 'ET', 'G': 'EG' },
  YENI_ALIS_BONUS: 100,

  // Özel alış düzeltmeleri (+ veya - TL)
  ALIS_ADJUSTMENT: { 'B': -20 },

  // Eski kodlar (ESKİ etiketi gösterilir, soluk renk)
  ESKI_SET: new Set(['EC', 'EY', 'ET', 'EG']),

  // Çift oluşturan eski→yeni eşleştirmesi (görsel gruplama için)
  PAIR_ESKI: new Set(['EC', 'EY', 'ET', 'EG']),
  PAIR_YENI: new Set(['C', 'Y', 'T', 'G']),

  // İkonlar
  ICONS: {
    'C': '💰', 'EC': '💰', 'Y': '🪙', 'EY': '🪙',
    'T': '🥇', 'ET': '🥇', 'G': '🏆', 'EG': '🏆',
    'A': '⭐', 'A5': '🌟', 'R': '👑', 'H': '👑',
    'GA': '📊', 'GAT': '📊', 'HH_T': '🔶', 'CH_T': '🔷',
    'A_T': '⭐', 'B': '📿', '18': '🔸', '14': '🔹',
    'XAUUSD': '🌍', 'AG_T': '🪨'
  },

  // Gösterilecek isimler
  DISPLAY_NAMES: {
    'C': 'Çeyrek',  'EC': 'Çeyrek',
    'Y': 'Yarım',   'EY': 'Yarım',
    'T': 'Teklik',  'ET': 'Teklik',
    'G': 'Gremse',  'EG': 'Gremse',
    'A': 'Ata Cumhuriyet', 'A5': 'Ata Beşli',
    'R': 'Reşat Altın',    'H': 'Hamit Altın',
    'GA': 'Gram Altın',    'GAT': 'Gram Toptan',
    'HH_T': 'Has Toptan',  'CH_T': 'Külçe Toptan',
    'A_T': 'Ata Toptan',   'B': '22 Ayar Bilezik',
    '18': '18 Ayar Altın', '14': '14 Ayar Altın',
    'XAUUSD': 'ONS Altın', 'AG_T': 'Gümüş'
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
  ziynetTableBody: document.getElementById('ziynet-table-body'),
  gramTableBody: document.getElementById('gram-table-body'),
  borsaTableBody: document.getElementById('borsa-table-body'),
  tickerContent: document.getElementById('ticker-content'),
  errorBanner: document.getElementById('error-banner'),
  errorMessage: document.getElementById('error-message'),

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
  if (!tableBody) return 0;

  const dataMap = {};
  goldData.forEach(item => { dataMap[item.Kod] = item; });

  let html = '';
  let count = 0;
  let pairGroupIndex = 0;
  let lastWasEski = false;

  codes.forEach(code => {
    const item = dataMap[code];
    if (!item) return;
    count++;

    const icon = CONFIG.ICONS[code] || '🔹';
    const displayName = CONFIG.DISPLAY_NAMES[code] || item.Aciklama;
    const isEski = CONFIG.ESKI_SET.has(code);
    const isPairYeni = CONFIG.PAIR_YENI && CONFIG.PAIR_YENI.has(code);
    const isPairEski = CONFIG.PAIR_ESKI && CONFIG.PAIR_ESKI.has(code);

    // Alış hesapla
    let alisStr;
    if (CONFIG.YENI_ALIS_FROM && CONFIG.YENI_ALIS_FROM[code]) {
      // Yeni sarrafiye: eski alış + bonus
      const eskiCode = CONFIG.YENI_ALIS_FROM[code];
      const eskiPrice = parseTurkishNumber(dataMap[eskiCode]?.Alis || '0');
      alisStr = eskiPrice === 0 ? '-' : formatTurkishNumber(eskiPrice + CONFIG.YENI_ALIS_BONUS);
    } else {
      // Normal: API alış + özel düzeltme
      const basePrice = parseTurkishNumber(item.Alis);
      const adj = (CONFIG.ALIS_ADJUSTMENT && CONFIG.ALIS_ADJUSTMENT[code]) || 0;
      alisStr = basePrice === 0 ? '-' : formatTurkishNumber(basePrice + adj);
    }

    // Satış hesapla
    let satisStr;
    if (CONFIG.YENI_ALIS_FROM && CONFIG.YENI_ALIS_FROM[code]) {
      // Yeni sarrafiye: satışı da eski koddan al
      const eskiCode = CONFIG.YENI_ALIS_FROM[code];
      satisStr = addMarkupSatis(dataMap[eskiCode]?.Satis || item.Satis);
    } else {
      satisStr = addMarkupSatis(item.Satis);
    }


    // Pair grup rengi (Eski başladığında grup değişir)
    if (isPairEski) {
      if (lastWasEski === false) pairGroupIndex++;
      lastWasEski = true;
    } else if (isPairYeni) {
      lastWasEski = false;
    } else {
      lastWasEski = false;
    }

    // Fiyat değişimi kontrolü
    const prev = previousPrices[code];
    const hasChanged = prev && (prev.alis !== item.Alis || prev.satis !== item.Satis);
    const flashClass = hasChanged ? 'price-flash' : '';

    let rowClass = flashClass;
    if (isPairEski) rowClass += ' row-eski';
    if (isPairYeni) rowClass += ' row-yeni';
    if (isPairEski || isPairYeni) {
      rowClass += ` pair-group-${pairGroupIndex % 2}`;
    }

    let tagHTML = '';
    if (isPairEski) tagHTML = '<span class="eski-tag">ESKİ</span>';
    if (isPairYeni) tagHTML = '<span class="yeni-tag">YENİ</span>';

    html += `
      <tr class="${rowClass.trim()}" data-code="${code}">
        <td>
          <span class="product-icon">${icon}</span>
          <span class="product-name">${displayName}${tagHTML}</span>
        </td>
        <td>${alisStr}</td>
        <td>${satisStr}</td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
  return count;
}


function renderAllTables() {
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

  if (elements.ziynetTableBody) elements.ziynetTableBody.innerHTML = skeletonRow.repeat(12);
  if (elements.gramTableBody) elements.gramTableBody.innerHTML = skeletonRow.repeat(9);
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
