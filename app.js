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

  // Sarrafiye (Yeni + Eski)
  ZIYNET_CODES: ['C', 'Y', 'T', 'G', 'A', 'A5', 'R', 'EC', 'EY', 'ET', 'EG'],

  // Gram Altın (24 Ayar)
  GRAM_CODES: ['G1', 'G5', 'G10', 'G20', 'G50', 'G100'],

  // Altın (ONS, Has)
  ALTIN_CODES: ['XAUUSD', 'HH_T'],

  // Eski Sarrafiye (Tekil kodlar - grup tespiti için saklanıyor)
  ESKI_CODES: ['EC', 'EY', 'ET', 'EG'],

  // Özel alış düzeltmeleri (+ veya - TL)
  ALIS_ADJUSTMENT: {  },

  // Özel alış düzeltmeleri (+ veya - TL)
  ALIS_ADJUSTMENT: {  },

  // Özel satış düzeltmeleri (markup üzerine ek, + veya - TL)
  // GA: API fiyatı + 20 (markup) + (-40) = API fiyatı - 20
  SATIS_ADJUSTMENT: { 
    'CH_T': -20, 'A_T': -40, 
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
    'XAUUSD': 'ONS', 'AG_T': 'Gümüş',
    'G1': 'Gram Altın',
    'G5': '24 Ayar 5 Gram',
    'G10': '24 Ayar 10 Gram',
    'G20': '24 Ayar 20 Gram',
    'G50': '24 Ayar 50 Gram',
    'G100': '24 Ayar 100 Gram'
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
  // Küsüratları at (aşağı yuvarla)
  return Math.floor(num).toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
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
  let hasShownEskiSeparator = false;

  codes.forEach(code => {
    // 0. ESKİ Grubu için Ayırıcı (Eski sarrafiyeler başlıyorsa)
    if (CONFIG.ESKI_SET.has(code) && !hasShownEskiSeparator) {
      html += `
        <tr class="table-separator">
          <td colspan="3">
            <span class="separator-label">Eski Sarrafiye</span>
          </td>
        </tr>
      `;
      hasShownEskiSeparator = true;
    }

    // 1. Veri Kaynağı Yönlendirme (MAPPING)
    let sourceCode = code;
    let weight = 1;

    // Normal sarrafiyeler eski fiyatlarını göstersin
    if (code === 'C') sourceCode = 'EC';
    if (code === 'Y') sourceCode = 'EY';
    if (code === 'T') sourceCode = 'ET';
    if (code === 'G') sourceCode = 'EG';
    // Ata Lira, Ata Toptan fiyatını göstersin
    if (code === 'A') sourceCode = 'A_T';

    // GRAM ALTIN MANTIĞI (Sadece G1, G5, G10, G20, G50, G100 — 'G' Gremse'dir, karışmasın)
    if (CONFIG.GRAM_CODES.includes(code)) {
      sourceCode = 'GAT';
      weight = parseInt(code.substring(1));
    }

    const item = dataMap[sourceCode] || dataMap['GAT'] || dataMap['GA_T'] || dataMap['GA'] || dataMap['HH_T'];
    
    const displayName = CONFIG.DISPLAY_NAMES[code] || (item ? item.Aciklama : code);
    const isEski = CONFIG.ESKI_SET.has(code);
    const isSarrafiye = CONFIG.ZIYNET_CODES.includes(code) || CONFIG.ESKI_CODES.includes(code);

    // Ağırlıkla çarp (Gram ürünleri için weight kullanılır, sarrafiye için genelde 1)
    let baseAlis = item ? parseTurkishNumber(item.Alis) : 0;
    let baseSatis = item ? parseTurkishNumber(item.Satis) : 0;
    
    apiAlis = baseAlis > 0 ? (baseAlis * weight) : 0;
    apiSatis = baseSatis > 0 ? (baseSatis * weight) : 0;

    // Sarrafiye Alış/Satış Düzeltmeleri (Ağırlık sonrası uygulanıyor)
    if (code === 'C' || code === 'EC') {
      if (apiAlis > 0) apiAlis += 100;
      if (apiSatis > 0) apiSatis -= 100;
    }
    if (code === 'Y' || code === 'EY') {
      if (apiAlis > 0) apiAlis += 250;
      if (apiSatis > 0) apiSatis -= 200;
    }
    if (code === 'T' || code === 'ET') {
      if (apiAlis > 0) apiAlis += 500;
      if (apiSatis > 0) apiSatis -= 100;
    }
    if (code === 'G' || code === 'EG') {
      if (apiAlis > 0) apiAlis += 700;
      if (apiSatis > 0) apiSatis += 4000;
    }
    if (code === 'A') {
      if (apiAlis > 0) apiAlis += 270;
      if (apiSatis > 0) apiSatis -= 300;
    }

    const useItem = item;
    if (!useItem) return; // Veri bulunamadı
    
    // Alış hesapla
    let alisStr;
    if (CONFIG.GRAM_CODES.includes(code)) {
      // GRAM ALTIN: Ham fiyat, hiçbir ekleme/çıkarma yok
      alisStr = apiAlis === 0 ? '-' : formatTurkishNumber(apiAlis);
    } else if (isSarrafiye) {
      alisStr = apiAlis === 0 ? '-' : formatTurkishNumber(apiAlis);
    } else if (code === 'B') {
      const hasAlis = parseTurkishNumber(dataMap['HH_T']?.Alis || dataMap['HAS']?.Alis || '0');
      alisStr = hasAlis === 0 ? '-' : formatTurkishNumber(hasAlis * 0.912);
    } else if (code === '14') {
      const hasAlis = parseTurkishNumber(dataMap['HH_T']?.Alis || '0');
      alisStr = hasAlis === 0 ? '-' : formatTurkishNumber(hasAlis * 0.550);
    } else if (code === '18') {
      const hasAlis = parseTurkishNumber(dataMap['HH_T']?.Alis || '0');
      alisStr = hasAlis === 0 ? '-' : formatTurkishNumber(hasAlis * 0.710);
    } else {
      const adj = (CONFIG.ALIS_ADJUSTMENT && CONFIG.ALIS_ADJUSTMENT[code]) || 0;
      alisStr = apiAlis === 0 ? '-' : formatTurkishNumber(apiAlis + adj);
    }

    // Satış hesapla
    let satisStr;
    if (CONFIG.GRAM_CODES.includes(code)) {
      // GRAM ALTIN: Ham fiyat, hiçbir ekleme/çıkarma yok
      satisStr = apiSatis === 0 ? '-' : formatTurkishNumber(apiSatis);
    } else if (isSarrafiye) {
      satisStr = apiSatis === 0 ? '-' : formatTurkishNumber(apiSatis);
    } else if (code === 'B') {
      const hasSatis = parseTurkishNumber(dataMap['HH_T']?.Satis || dataMap['HAS']?.Satis || '0');
      satisStr = hasSatis === 0 ? '-' : formatTurkishNumber(hasSatis * 0.928);
    } else {
      const satisAdj = (CONFIG.SATIS_ADJUSTMENT && CONFIG.SATIS_ADJUSTMENT[code]) || 0;
      satisStr = apiSatis === 0 ? '-' : formatTurkishNumber(apiSatis + CONFIG.SATIS_MARKUP + satisAdj);
    }

    // Yüzde Değişim ve Ok Hesabı
    const trendValue = parseFloat(useItem.Yuzde?.replace(',', '.') || '0');
    let trendHTML = '';
    let trendClass = 'trend-equal';
    let arrowSVG = '';

    if (trendValue > 0) {
      trendClass = 'trend-up';
      arrowSVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
    } else if (trendValue < 0) {
      trendClass = 'trend-down';
      arrowSVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    }
    trendHTML = `<div class="trend-indicator ${trendClass}">${arrowSVG}</div>`;


    // Fiyat değişimi kontrolü (Renkli Flash için)
    const prev = previousPrices[code];
    let changeClass = '';
    
    if (prev) {
      const prevSatis = parseTurkishNumber(prev.satis || '0');
      const currentSatis = parseTurkishNumber(useItem.Satis || '0');
      
      if (currentSatis > prevSatis) changeClass = 'price-flash-up';
      else if (currentSatis < prevSatis) changeClass = 'price-flash-down';
      else if (prev.alis !== useItem.Alis || prev.satis !== useItem.Satis) changeClass = 'price-flash';
    }

    count++;

    let rowClass = changeClass;
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
        <td>${trendHTML}</td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
  return count;
}


function renderAllTables() {
  const zCount = renderTable(elements.ziynetTableBody, CONFIG.ZIYNET_CODES, false);
  const gCount = renderTable(elements.gramTableBody, CONFIG.GRAM_CODES, false);
  const aCount = renderTable(elements.altinTableBody, CONFIG.ALTIN_CODES, false);

  if (elements.ziynetBadge) elements.ziynetBadge.textContent = `${zCount} ürün`;
  if (elements.gramBadge) elements.gramBadge.textContent = `${gCount} ürün`;
  if (elements.altinBadge) elements.altinBadge.textContent = `${aCount} ürün`;
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

  if (elements.ziynetTableBody) elements.ziynetTableBody.innerHTML = skeletonRow.repeat(10);
  if (elements.gramTableBody) elements.gramTableBody.innerHTML = skeletonRow.repeat(6);
  if (elements.altinTableBody) elements.altinTableBody.innerHTML = skeletonRow.repeat(2);
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


// ---- Mobil Sekmeler ----
function setupMobileTabs() {
  const tabButtons = document.querySelectorAll('.mobile-tab');
  const tabContents = document.querySelectorAll('.mobile-tab-content');

  if (!tabButtons.length) return;

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');

      // Butonları güncelle
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // İçerikleri güncelle
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === target) {
          content.classList.add('active');
        }
      });

      // Sayfayı yukarı kaydır
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}


// ---- Sidebar (Mobil) ----
function setupSidebar() {
  const burger = document.getElementById('hamburger-menu');
  const sidebar = document.getElementById('mobile-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const closeBtn = document.getElementById('sidebar-close-btn');

  if (!burger || !sidebar || !overlay || !closeBtn) return;

  function openSidebar() {
    sidebar.classList.add('active');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden'; // Kaydırmayı engelle
  }

  function closeSidebar() {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
    document.body.style.overflow = ''; // Kaydırmayı aç
  }

  burger.addEventListener('click', openSidebar);
  closeBtn.addEventListener('click', closeSidebar);
  overlay.addEventListener('click', closeSidebar);

  // İletişim Toggle
  const contactToggle = document.getElementById('contact-toggle');
  const contactDetails = document.getElementById('contact-details');
  if (contactToggle && contactDetails) {
    contactToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      contactToggle.classList.toggle('active');
      contactDetails.classList.toggle('active');
    });
  }

  // Hakkımızda Toggle
  const aboutToggle = document.getElementById('about-toggle');
  const aboutDetails = document.getElementById('about-details');
  if (aboutToggle && aboutDetails) {
    aboutToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      aboutToggle.classList.toggle('active');
      aboutDetails.classList.toggle('active');
    });
  }

  // Linklere basınca kapat (İletişim ve Hakkımızda hariç)
  document.querySelectorAll('.sidebar-link:not(#contact-toggle):not(#about-toggle)').forEach(link => {
    link.addEventListener('click', closeSidebar);
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
    altinTableBody: document.getElementById('altin-table-body'),
    tickerContent: document.getElementById('ticker-content'),
    errorBanner: document.getElementById('error-banner'),
    errorMessage: document.getElementById('error-message'),
    ziynetBadge: document.getElementById('ziynet-badge'),
    gramBadge: document.getElementById('gram-badge'),
    altinBadge: document.getElementById('altin-badge')
  };

  // Saat başlat
  updateClock();
  setInterval(updateClock, 1000);

  // Mobil sekmeleri ayarla
  setupMobileTabs();

  // Sidebar ayarla
  setupSidebar();

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
