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

  // Yeni Sarrafiye (üst kısımda gösterilecek - eski kodlar yok)
  ZIYNET_CODES: ['C', 'Y', 'T', 'G', 'A', 'A5', 'R', 'H'],

  // Eski Sarrafiye (alt kısımda ayrı gösterilecek)
  ESKI_CODES: ['EC', 'EY', 'ET', 'EG'],

  // Gram & Toptan
  GRAM_CODES: ['XAUUSD', 'GA', 'HH_T', 'CH_T', 'B', '18', '14', 'AG_T'],

  // Borsa
  BORSA_CODES: [],

  // Özel alış düzeltmeleri (+ veya - TL)
  ALIS_ADJUSTMENT: {  },

  // Özel alış düzeltmeleri (+ veya - TL)
  ALIS_ADJUSTMENT: {  },

  // Özel satış düzeltmeleri (markup üzerine ek, + veya - TL)
  // GA: API fiyatı + 20 (markup) + (-40) = API fiyatı - 20
  SATIS_ADJUSTMENT: { 
    'GA': -40, 'GAT': -40, 'CH_T': -20, 'A_T': -40, 
    'HH_T': -20, 'XAUUSD': -20, 'AG_T': -19, 'XAGUSD': -20 
  },

  // Eski kodlar (ESKİ etiketi gösterilir, soluk renk)
  ESKI_SET: new Set(['EC', 'EY', 'ET', 'EG']),

  // Çift oluşturan eski→yeni eşleştirmesi (görsel gruplama için)
  PAIR_ESKI: new Set(['EC', 'EY', 'ET', 'EG']),
  PAIR_YENI: new Set(['C', 'Y', 'T', 'G']),

  // Gösterilecek isimler
  DISPLAY_NAMES: {
    'C': 'Çeyrek',  'EC': 'Eski Çeyrek',
    'Y': 'Yarım',   'EY': 'Eski Yarım',
    'T': 'Teklik',  'ET': 'Eski Teklik',
    'G': 'Gremse',  'EG': 'Eski Gremse',
    'A': 'Ata Lira',       'A5': 'Ata Beşli',
    'R': 'Reşat Altın',    'H': 'Hamit Altın',
    'GA': 'Gram Altın',    'GAT': 'Gram Toptan',
    'HH_T': 'Has Altın',   'CH_T': 'Külçe Toptan',
    'A_T': 'Ata Toptan',   'B': '22 Ayar Bilezik',
    '18': '18 Ayar Altın', '14': '14 Ayar Altın',
    'XAUUSD': 'ONS', 'AG_T': 'Gümüş'
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

// ---- DOM Elemanları (init içinde doldurulur) ----
let elements = {};

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
function renderTable(tableBody, codes, isEskiSection) {
  if (!tableBody) return 0;

  const dataMap = {};
  goldData.forEach(item => { dataMap[item.Kod] = item; });

  let html = '';
  let count = 0;

  codes.forEach(code => {
    // 1. Veri Kaynağı Yönlendirme (MAPPING)
    let sourceCode = code;
    // Normal sarrafiyeler eski fiyatlarını göstersin
    if (code === 'C') sourceCode = 'EC';
    if (code === 'Y') sourceCode = 'EY';
    if (code === 'T') sourceCode = 'ET';
    if (code === 'G') sourceCode = 'EG';
    // Ata Lira, Ata Toptan fiyatını göstersin
    if (code === 'A') sourceCode = 'A_T';

    const item = dataMap[sourceCode];
    if (!item) return;
    count++;

    const displayName = CONFIG.DISPLAY_NAMES[code] || item.Aciklama;
    const isEski = CONFIG.ESKI_SET.has(code);
    const isSarrafiye = CONFIG.ZIYNET_CODES.includes(code) || CONFIG.ESKI_CODES.includes(code);

    // Çeyrek indirimi (-50 TL) - Sadece C ve EC için geçerli
    let apiAlis = parseTurkishNumber(item.Alis);
    let apiSatis = parseTurkishNumber(item.Satis);
    
    if (code === 'C' || code === 'EC') {
      if (apiAlis > 0) apiAlis += 70;
      if (apiSatis > 0) apiSatis -= 50;
    }
    if (code === 'Y' || code === 'EY') {
      if (apiAlis > 0) apiAlis += 200;
    }
    if (code === 'T' || code === 'ET') {
      if (apiAlis > 0) apiAlis += 450;
    }
    if (code === 'G' || code === 'EG') {
      if (apiAlis > 0) apiAlis += 900;
      if (apiSatis > 0) apiSatis -= 1200;
    }
    if (code === 'A') {
      if (apiAlis > 0) apiAlis += 200;
      if (apiSatis > 0) apiSatis -= 250;
    }

    // Alış hesapla
    let alisStr;
    if (isSarrafiye) {
      // Sarrafiye: Girdiği gibi (Çeyrekte yukarıda eksi yaptık)
      alisStr = apiAlis === 0 ? '-' : formatTurkishNumber(apiAlis);
    } else if (code === 'B') {
      // 22 Ayar Bilezik Alış: Has Altın (HH_T) Alış * 0.912
      const hasAlis = parseTurkishNumber(dataMap['HH_T']?.Alis || '0');
      alisStr = hasAlis === 0 ? '-' : formatTurkishNumber(hasAlis * 0.912);
    } else if (code === '14') {
      // 14 Ayar Altın Alış: Has Altın (HH_T) Alış * 0.550
      const hasAlis = parseTurkishNumber(dataMap['HH_T']?.Alis || '0');
      alisStr = hasAlis === 0 ? '-' : formatTurkishNumber(hasAlis * 0.550);
    } else if (code === '18') {
      // 18 Ayar Altın Alış: Has Altın (HH_T) Alış * 0.710
      const hasAlis = parseTurkishNumber(dataMap['HH_T']?.Alis || '0');
      alisStr = hasAlis === 0 ? '-' : formatTurkishNumber(hasAlis * 0.710);
    } else {
      // Normal (Gram vb): API alış + özel düzeltme
      const basePrice = apiAlis;
      const adj = (CONFIG.ALIS_ADJUSTMENT && CONFIG.ALIS_ADJUSTMENT[code]) || 0;
      alisStr = basePrice === 0 ? '-' : formatTurkishNumber(basePrice + adj);
    }

    // Satış hesapla
    let satisStr;
    if (isSarrafiye) {
      // Sarrafiye: Girdiği gibi
      satisStr = apiSatis === 0 ? '-' : formatTurkishNumber(apiSatis);
    } else if (code === 'B') {
      // 22 Ayar Bilezik: Has Altın (HH_T) Satış * 0.928
      const hasSatis = parseTurkishNumber(dataMap['HH_T']?.Satis || '0');
      satisStr = hasSatis === 0 ? '-' : formatTurkishNumber(hasSatis * 0.928);
    } else {
      const basePrice = apiSatis;
      const satisAdj = (CONFIG.SATIS_ADJUSTMENT && CONFIG.SATIS_ADJUSTMENT[code]) || 0;
      satisStr = basePrice === 0 ? '-' : formatTurkishNumber(basePrice + CONFIG.SATIS_MARKUP + satisAdj);
    }

    // Fiyat değişimi kontrolü
    const prev = previousPrices[code];
    const hasChanged = prev && (prev.alis !== item.Alis || prev.satis !== item.Satis);
    const flashClass = hasChanged ? 'price-flash' : '';

    let rowClass = flashClass;
    if (isEskiSection) rowClass += ' row-eski';

    // Eski sarrafiye için etiket
    let tagHTML = '';
    if (isEski && !isEskiSection) tagHTML = '<span class="eski-tag">ESKİ</span>';

    html += `
      <tr class="${rowClass.trim()}" data-code="${code}">
        <td>
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
  const zCount = renderTable(elements.ziynetTableBody, CONFIG.ZIYNET_CODES, false);
  const gCount = renderTable(elements.gramTableBody, CONFIG.GRAM_CODES, false);
  const eCount = renderTable(elements.eskiTableBody, CONFIG.ESKI_CODES, true);

  if (elements.ziynetBadge) elements.ziynetBadge.textContent = `${zCount} ürün`;
  if (elements.gramBadge) elements.gramBadge.textContent = `${gCount} ürün`;
  if (elements.eskiBadge) elements.eskiBadge.textContent = `${eCount} ürün`;
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
        <span class="product-name"><span class="skeleton" style="width:120px"></span></span>
      </td>
      <td><span class="skeleton"></span></td>
      <td><span class="skeleton"></span></td>
    </tr>
  `;

  if (elements.ziynetTableBody) elements.ziynetTableBody.innerHTML = skeletonRow.repeat(8);
  if (elements.gramTableBody) elements.gramTableBody.innerHTML = skeletonRow.repeat(8);
  if (elements.eskiTableBody) elements.eskiTableBody.innerHTML = skeletonRow.repeat(4);
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
  // DOM elemanlarını bul (DOMContentLoaded sonrası)
  elements = {
    loadingOverlay: document.getElementById('loading-overlay'),
    clockEl: document.getElementById('live-clock'),
    dateEl: document.getElementById('live-date'),
    updateTimeEl: document.getElementById('update-time'),
    ziynetTableBody: document.getElementById('ziynet-table-body'),
    gramTableBody: document.getElementById('gram-table-body'),
    eskiTableBody: document.getElementById('eski-table-body'),
    tickerContent: document.getElementById('ticker-content'),
    errorBanner: document.getElementById('error-banner'),
    errorMessage: document.getElementById('error-message'),
    ziynetBadge: document.getElementById('ziynet-badge'),
    gramBadge: document.getElementById('gram-badge'),
    eskiBadge: document.getElementById('eski-badge')
  };

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
