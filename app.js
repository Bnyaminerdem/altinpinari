/* ============================================
   ALTIN PINARI KUYUMCULUK - APP.JS
   Altın Pınarı API'den fiyat çekme + kâr marjı
   ============================================ */

const appStartTime = Date.now();
let firstFirebaseLoad = true;
let firstApiLoad = true;

// --- FIREBASE CONFIG (Yönetim panelindeki ile aynı olmalı) ---
const firebaseConfig = {
  apiKey: "AIzaSyBlNarV8jgQ2RK1QDxn0mj4XxhTyk2Zf_8",
  authDomain: "altinpinari-panel.firebaseapp.com",
  databaseURL: "https://altinpinari-panel-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "altinpinari-panel",
  storageBucket: "altinpinari-panel.firebasestorage.app",
  messagingSenderId: "956494971184",
  appId: "1:956494971184:web:be9364217e1f6be4d2c8f5",
  measurementId: "G-N90R7RKCFP"
};


// ---- Ayarlar (Kolayca Değiştirilebilir) ----
const CONFIG = {
  // Satış fiyatlarına eklenen kâr marjı (TL) - Admin panelinden değiştirilebilir
  SATIS_MARKUP: 20,

  // Otomatik güncelleme aralığı (ms)
  REFRESH_INTERVAL: 10000,

  // API
  API_GOLD: 'https://altin-fiyat-proxy.yasireminciftci.workers.dev',

  // Sarrafiye (Yeni + Eski)
  ZIYNET_CODES: ['C', 'Y', 'T', 'G', 'A', 'A5', 'R', 'EC', 'EY', 'ET', 'EG'],

  // Gram Altın (24 Ayar)
  GRAM_CODES: ['G1', 'G5', 'G10', 'G20', 'G50', 'G100'],

  // Altın (ONS, Has, 22k, 18k, 14k)
  ALTIN_CODES: ['XAUUSD', 'HH_T', 'B', '18', '14'],

  // Eski Sarrafiye (Tekil kodlar - grup tespiti için saklanıyor)
  ESKI_CODES: ['EC', 'EY', 'ET', 'EG'],

  // Özel alış düzeltmeleri (+ veya - TL)
  ALIS_ADJUSTMENT: {},

  // Özel satış düzeltmeleri (markup üzerine ek, + veya - TL)
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
  },
  
  // Firebase'den gelen canlı düzeltmeler
  FIREBASE_ADJUSTMENTS: {}
};

// Initialize Firebase (CONFIG tanımlandıktan sonra başlatılıyor)
if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  const db = firebase.database();

  // Canlı Ayarları Dinle
  db.ref('config').on('value', snapshot => {
    const data = snapshot.val();
    console.log("Firebase verisi alındı:", data);
    if (data) {
      if (data.satisMarkup !== undefined) {
        CONFIG.SATIS_MARKUP = parseFloat(data.satisMarkup);
        console.log("SATIS_MARKUP güncellendi:", CONFIG.SATIS_MARKUP);
      }
      
      // Canlı Adjustments (Alış ve Satış)
      if (data.adjustments) {
        CONFIG.FIREBASE_ADJUSTMENTS = data.adjustments;
        console.log("Adjustments güncellendi:", data.adjustments);
      }

      // legacy/manuel satisAdjustment sync
      if (data.satisAdjustment) {
        Object.assign(CONFIG.SATIS_ADJUSTMENT, data.satisAdjustment);
      }

      // Bakım Modu Kontrolü
      const maintenanceOverlay = document.getElementById('maintenance-overlay');
      if (maintenanceOverlay) {
        if (data.maintenanceMode) {
          console.log("BAKIM MODU: AÇIK");
          maintenanceOverlay.classList.remove('hidden');
          document.body.classList.add('maintenance-active');
        } else {
          console.log("BAKIM MODU: KAPALI");
          maintenanceOverlay.classList.add('hidden');
          document.body.classList.remove('maintenance-active');
        }
      }

      // Fiyatları yeniden hesapla ve tabloları güncelle
      if (goldData.length > 0) {
        // İlk yüklemede yanıp sönmeyi engellemek için true gönderiyoruz
        renderAllTables(typeof firstFirebaseLoad !== 'undefined' && firstFirebaseLoad);
        if (typeof firstFirebaseLoad !== 'undefined') firstFirebaseLoad = false;
      }
    }
  });
}

// (Daha önce yukarı taşındı)
// let firstFirebaseLoad = true;


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
  if (elements.tvGramClock) elements.tvGramClock.textContent = timeStr;
  if (elements.tvGramDate) elements.tvGramDate.textContent = dateStr;
}

// ---- API ----
async function fetchGoldPrices() {
  try {
    const response = await fetch(CONFIG.API_GOLD);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    goldData = await response.json();
    lastUpdateTime = new Date();

    hideError();
    renderAllTables(firstApiLoad);
    firstApiLoad = false;
    updateLastUpdateTime();

    // renderAllTables içinde previousPrices doldurulacak
  } catch (error) {
    console.error('Fiyat çekme hatası:', error);
    showError('Fiyatlar güncellenirken hata oluştu. Yeniden denenecek...');
  }
}

// ---- Tablo Render ----
function renderTable(tableBody, codes, isEskiSection, skipFlash) {
  if (!tableBody) return 0;
  
  const isDesktop = window.innerWidth >= 769;
  const isMediumMode = isDesktop && document.body.classList.contains('tv-mode-medium');

  const dataMap = {};
  goldData.forEach(item => { dataMap[item.Kod] = item; });

  let html = '';
  let count = 0;
  let hasShownEskiSeparator = false;

  // PC/TV ekranında 50g ve 100g'ı göstermiyoruz (alan tasarrufu)
  const filteredCodes = isDesktop ? codes.filter(c => c !== 'G50' && c !== 'G100') : codes;

  filteredCodes.forEach(code => {
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

    // GRAM ALTIN Grubu için Ayırıcı (Sadece Orta TV modunda ve G1 ile başlıyorsa)
    if (isMediumMode && code === 'G1') {
      html += `
        <tr class="table-separator">
          <td colspan="3">
            <span class="separator-label">Gram Altın</span>
          </td>
        </tr>
      `;
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
    
    let displayName = CONFIG.DISPLAY_NAMES[code] || (item ? item.Aciklama : code);
    
    // Orta Boyutta "Gram Altın" yerine "24 Ayar 1 Gram" yaz (Üretici isteği)
    if (isMediumMode && (code === 'G1' || code === 'GA')) {
      displayName = '24 Ayar 1 Gram';
    }

    const isEski = CONFIG.ESKI_SET.has(code);
    const isSarrafiye = CONFIG.ZIYNET_CODES.includes(code) || CONFIG.ESKI_CODES.includes(code);

    // Ağırlıkla çarp (Gram ürünleri için weight kullanılır, sarrafiye için genelde 1)
    let baseAlis = item ? parseTurkishNumber(item.Alis) : 0;
    let baseSatis = item ? parseTurkishNumber(item.Satis) : 0;
    
    let apiAlis = baseAlis > 0 ? (baseAlis * weight) : 0;
    let apiSatis = baseSatis > 0 ? (baseSatis * weight) : 0;

    // 2. Canlı Firebase Düzeltmeleri veya Varsayılanlar uygulama
    const fbAdj = CONFIG.FIREBASE_ADJUSTMENTS[code];
    
    if (fbAdj) {
      // Firebase'den gelen manuel değerler varsa legacy düzeltmeleri atla
      // (Düzeltme aşağıda alisVal ve satisVal'a eklenecek, burada tekrar eklemiyoruz)
    } else {
      // Varsayılan / Legacy Düzeltmeler (Statik)
      if (code === 'C' || code === 'EC') {
        if (apiAlis > 0) apiAlis += 40;
        if (apiSatis > 0) apiSatis -= 50;
      }
      if (code === 'Y' || code === 'EY') {
        if (apiAlis > 0) apiAlis += 250;
        if (apiSatis > 0) apiSatis -= 250;
      }
      if (code === 'T' || code === 'ET') {
        if (apiAlis > 0) apiAlis += 320;
        if (apiSatis > 0) apiSatis -= 360;
      }
      if (code === 'G' || code === 'EG') {
        if (apiAlis > 0) apiAlis += 700;
        if (apiSatis > 0) apiSatis -= 1000;
      }
      if (code === 'A') {
        if (apiAlis > 0) apiAlis += 270;
        if (apiSatis > 0) apiSatis -= 200;
      }
    }

    const useItem = item;
    if (!useItem) return; // Veri bulunamadı
    
    // 1. Alış hesapla (Raw)
    let alisVal = 0;
    if (CONFIG.GRAM_CODES.includes(code)) {
      alisVal = apiAlis;
    } else if (isSarrafiye) {
      alisVal = apiAlis;
    } else if (code === 'B') {
      const hasAlis = parseTurkishNumber(dataMap['HH_T']?.Alis || dataMap['HAS']?.Alis || '0');
      alisVal = hasAlis * 0.912;
    } else if (code === '14') {
      const hasAlis = parseTurkishNumber(dataMap['HH_T']?.Alis || '0');
      alisVal = hasAlis * 0.550;
    } else if (code === '18') {
      const hasAlis = parseTurkishNumber(dataMap['HH_T']?.Alis || '0');
      alisVal = hasAlis * 0.700;
    } else {
      const adj = (CONFIG.ALIS_ADJUSTMENT && CONFIG.ALIS_ADJUSTMENT[code]) || 0;
      alisVal = apiAlis + adj;
    }

    // Alış'a Firebase Ayarını Uygula (Son Adım)
    if (fbAdj && alisVal > 0) alisVal += (parseFloat(fbAdj.alis) || 0);
    const alisStr = alisVal === 0 ? '-' : formatTurkishNumber(alisVal);

    // 2. Satış hesapla (Raw)
    let satisVal = 0;
    if (CONFIG.GRAM_CODES.includes(code)) {
      satisVal = apiSatis > 0 ? (apiSatis + (10 * weight)) : 0;
    } else if (isSarrafiye) {
      satisVal = apiSatis;
    } else if (code === 'B') {
      const hasSatis = parseTurkishNumber(dataMap['HH_T']?.Satis || dataMap['HAS']?.Satis || '0');
      satisVal = hasSatis * 0.928;
    } else if (code === '14') {
      const hasSatis = parseTurkishNumber(dataMap['HH_T']?.Satis || '0');
      satisVal = hasSatis * 0.650;
    } else if (code === '18') {
      satisVal = apiSatis;
    } else {
      const satisAdj = (CONFIG.SATIS_ADJUSTMENT && CONFIG.SATIS_ADJUSTMENT[code]) || 0;
      satisVal = apiSatis + CONFIG.SATIS_MARKUP + satisAdj;
    }

    // Satış'a Firebase Ayarını Uygula (Son Adım)
    if (fbAdj && satisVal > 0) satisVal += (parseFloat(fbAdj.satis) || 0);
    const satisStr = satisVal === 0 ? '-' : formatTurkishNumber(satisVal);

    // Yüzde Değişim ve Ok Hesabı
    const trendValue = parseFloat(useItem.Yuzde?.replace(',', '.') || '0');
    let trendHTML = '';
    let trendClass = 'trend-equal';
    let arrowSVG = '';

    // Oklarda her zaman API'den gelen piyasa trendini (Yuzde) baz alalım.
    // Bu sayede manuel düzeltmeler okları (yukarı/aşağı) saptırmaz, sadece piyasa hareketini gösterir.
    let finalTrend = trendValue > 0 ? 1 : (trendValue < 0 ? -1 : 0);

    const prev = previousPrices[code];
    let changeClass = '';

    const currentAlis = parseTurkishNumber(alisStr);
    const currentSatis = parseTurkishNumber(satisStr);

    // Yanıp sönme efekti (flash) sadece fiyat değiştiğinde ve aşağıdaki şartlarda tetiklensin:
    // 1. skipFlash gelmemiş olmalı
    // 2. Sayfa açılalı en az 2 saniye geçmiş olmalı (Mobil yavaş yükleme için koruma)
    // 3. Fiyat gerçekten değişmiş olmalı
    const isGracePeriod = (Date.now() - appStartTime < 2000);
    
    if (prev && !skipFlash && !isGracePeriod) {
      if (currentSatis > prev.satis) {
        changeClass = 'price-flash-up';
      } else if (currentSatis < prev.satis) {
        changeClass = 'price-flash-down';
      }
    }

    // Bir sonraki karşılaştırma için sakla
    previousPrices[code] = { alis: currentAlis, satis: currentSatis };

    if (finalTrend > 0) {
      trendClass = 'trend-up';
      arrowSVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
    } else if (finalTrend < 0) {
      trendClass = 'trend-down';
      arrowSVG = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    } else {
      trendClass = 'trend-equal';
      arrowSVG = ''; 
    }
    trendHTML = `<div class="trend-indicator ${trendClass}">${arrowSVG}</div>`;

    let textClass = '';
    if (finalTrend > 0) textClass = 'text-up';
    else if (finalTrend < 0) textClass = 'text-down';

    count++;

    let rowClass = changeClass;
    if (isEskiSection) rowClass += ' row-eski';
    if (code === 'G50' || code === 'G100' || code === 'R' || code === 'A5') rowClass += ' tv-hide';

    // Eski sarrafiye için etiket
    let tagHTML = '';
    if (isEski && !isEskiSection) tagHTML = '<span class="eski-tag">ESKİ</span>';

    html += `
      <tr class="${rowClass.trim()}" data-code="${code}">
        <td>
          <span class="product-name">${displayName}${tagHTML}</span>
        </td>
        <td class="${textClass}">${alisStr}</td>
        <td>
          <div class="price-with-trend ${textClass}">
            ${satisStr}
            ${trendHTML}
          </div>
        </td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
  return count;
}


function renderAllTables(skipFlash = false) {
  const isDesktop = window.innerWidth >= 769;
  const isMediumMode = isDesktop && document.body.classList.contains('tv-mode-medium');
  
  // Orta Boyut (Medium) modu için özel Gram Altın listesi (ONS, Has, Bilezik, 18k, 14k eklenmiş hali)
  // Sadece PC/TV ekranında (Desktop) iken bu özel listeyi kullan
  let gramCodes = CONFIG.GRAM_CODES;
  if (isMediumMode) {
    gramCodes = ['XAUUSD', 'HH_T', 'B', '18', '14', ...CONFIG.GRAM_CODES];
  }

  const zCount = renderTable(elements.ziynetTableBody, CONFIG.ZIYNET_CODES, false, skipFlash);
  const gCount = renderTable(elements.gramTableBody, gramCodes, false, skipFlash);
  const aCount = renderTable(elements.altinTableBody, CONFIG.ALTIN_CODES, false, skipFlash);

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


// ---- Ekran Kontrolleri (Gece Modu & TV Modu - 4 Kademeli Boyut) ----
function setupDisplayControls() {
  const nightBtn = document.getElementById('night-mode-toggle');
  const tvBtn = document.getElementById('tv-mode-toggle');
  const moonIcon = document.getElementById('moon-icon');
  const sunIcon = document.getElementById('sun-icon');

  // Kayıtlı tercihleri yükle
  const isDarkMode = localStorage.getItem('nightMode') === 'true';
  const tvScaleMode = localStorage.getItem('tvScaleMode') || 'large'; // xlarge, large, medium, compact

  if (isDarkMode) {
    document.body.classList.add('dark-mode');
    if (moonIcon) moonIcon.style.display = 'none';
    if (sunIcon) sunIcon.style.display = 'block';
  }

  // TV Modu Sınıflarını Uygula
  applyTvScaleClass(tvScaleMode);

  if (nightBtn) {
    nightBtn.addEventListener('click', () => {
      const active = document.body.classList.toggle('dark-mode');
      localStorage.setItem('nightMode', active);
      
      if (moonIcon && sunIcon) {
        if (active) {
          moonIcon.style.display = 'none';
          sunIcon.style.display = 'block';
        } else {
          moonIcon.style.display = 'block';
          sunIcon.style.display = 'none';
        }
      }
    });
  }

  if (tvBtn) {
    tvBtn.addEventListener('click', () => {
      let currentMode = localStorage.getItem('tvScaleMode') || 'large';
      let nextMode = 'medium';
      
      if (currentMode === 'large') nextMode = 'medium';
      else if (currentMode === 'medium') nextMode = 'compact';
      else nextMode = 'large';

      localStorage.setItem('tvScaleMode', nextMode);
      applyTvScaleClass(nextMode);

      // Mod değiştiğinde tabloları hemen yeniden çiz (Özel listeler için)
      renderAllTables(true);
    });
  }
}

function applyTvScaleClass(mode) {
  document.body.classList.remove('tv-mode-large', 'tv-mode-medium', 'tv-mode-compact');
  document.body.classList.add(`tv-mode-${mode}`);
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
    altinBadge: document.getElementById('altin-badge'),
    tvGramClock: document.getElementById('tv-gram-clock'),
    tvGramDate: document.getElementById('tv-gram-date')
  };

  // Saat başlat
  updateClock();
  setInterval(updateClock, 1000);

  // Mobil sekmeleri ayarla
  setupMobileTabs();

  // Sidebar ayarla
  setupSidebar();

  // Ekran kontrollerini ayarla
  setupDisplayControls();

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
