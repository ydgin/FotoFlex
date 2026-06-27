// =====================
// DOM елементи
// =====================
const video = document.getElementById("camera");
const gallery = document.getElementById("gallery");
const albumInput = document.getElementById("album");
const searchInput = document.getElementById("search");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const cameraStatus = document.getElementById("cameraStatus");
const cameraDetails = document.getElementById("cameraDetails");
const photoBtn = document.getElementById("photoBtn");
const photoCount = document.getElementById("photoCount");

// =====================
// Глобальні змінні
// =====================
let db;
let stream = null;
let cameraReady = false;
let cameraStarting = false;
let recognition = null;
let isRecording = false;
let cameraCapabilities = {};

// =====================
// IndexedDB
// =====================
const request = indexedDB.open("PhotoBase", 1);

request.onupgradeneeded = (e) => {
  db = e.target.result;
  if (!db.objectStoreNames.contains("photos")) {
    const store = db.createObjectStore("photos", { keyPath: "id" });
    store.createIndex("date", "date");
    store.createIndex("album", "album");
  }
};

request.onsuccess = (e) => {
  db = e.target.result;
  loadPhotos();
};

request.onerror = () => {
  alert("❌ Помилка відкриття бази даних");
};

// =====================
// ОТРИМАННЯ ХАРАКТЕРИСТИК КАМЕРИ
// =====================
async function getCameraCapabilities() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    
    if (videoDevices.length === 0) {
      cameraDetails.innerHTML = `<span class="loading">❌ Камери не знайдено</span>`;
      return;
    }

    let html = '';
    const device = videoDevices[0];
    
    // Основна інформація
    html += `
      <div class="detail-item">
        <span class="detail-label">📷 Камера</span>
        <span class="detail-value">${device.label || 'Невизначена'}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">🔢 ID</span>
        <span class="detail-value">${device.deviceId.slice(0, 12)}...</span>
      </div>
    `;

    // Спроба отримати додаткові характеристики через getSettings
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings();
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        
        // Роздільна здатність
        html += `
          <div class="detail-item">
            <span class="detail-label">📐 Роздільна здатність</span>
            <span class="detail-value">${settings.width || '?'}×${settings.height || '?'}</span>
          </div>
        `;
        
        // Частота кадрів
        if (settings.frameRate) {
          html += `
            <div class="detail-item">
              <span class="detail-label">⚡ Кадрів/сек</span>
              <span class="detail-value">${settings.frameRate} fps</span>
            </div>
          `;
        }
        
        // Фокусна відстань (якщо доступна)
        if (settings.focusDistance) {
          html += `
            <div class="detail-item">
              <span class="detail-label">🔭 Фокусна відстань</span>
              <span class="detail-value">${settings.focusDistance} м</span>
            </div>
          `;
        }
        
        // Яскравість
        if (settings.brightness) {
          html += `
            <div class="detail-item">
              <span class="detail-label">☀️ Яскравість</span>
              <span class="detail-value">${settings.brightness}</span>
            </div>
          `;
        }
        
        // Контраст
        if (settings.contrast) {
          html += `
            <div class="detail-item">
              <span class="detail-label">🎨 Контраст</span>
              <span class="detail-value">${settings.contrast}</span>
            </div>
          `;
        }
        
        // Режим камери (задня/передня)
        const facingMode = settings.facingMode || 'unknown';
        const facingLabel = facingMode === 'environment' ? 'Задня' : 
                           facingMode === 'user' ? 'Передня' : 
                           facingMode;
        html += `
          <div class="detail-item">
            <span class="detail-label">🔄 Орієнтація</span>
            <span class="detail-value">${facingLabel}</span>
          </div>
        `;
        
        // Діапазон масштабу
        if (capabilities.zoom) {
          html += `
            <div class="detail-item">
              <span class="detail-label">🔍 Масштаб</span>
              <span class="detail-value">${capabilities.zoom.min || 1}× – ${capabilities.zoom.max || 1}×</span>
            </div>
          `;
        }
        
        // Діапазон фокусу
        if (capabilities.focusDistance) {
          html += `
            <div class="detail-item">
              <span class="detail-label">🎯 Фокус</span>
              <span class="detail-value">${capabilities.focusDistance.min || 0}–${capabilities.focusDistance.max || 0} м</span>
            </div>
          `;
        }
        
        // Експозиція
        if (capabilities.exposureTime) {
          html += `
            <div class="detail-item">
              <span class="detail-label">⏱️ Експозиція</span>
              <span class="detail-value">${capabilities.exposureTime.min}–${capabilities.exposureTime.max} мс</span>
            </div>
          `;
        }
        
        // ISO
        if (capabilities.iso) {
          html += `
            <div class="detail-item">
              <span class="detail-label">🎞️ ISO</span>
              <span class="detail-value">${capabilities.iso.min}–${capabilities.iso.max}</span>
            </div>
          `;
        }
      }
    }
    
    // Кількість камер
    html += `
      <div class="detail-item">
        <span class="detail-label">📱 Всього камер</span>
        <span class="detail-value">${videoDevices.length}</span>
      </div>
    `;
    
    cameraDetails.innerHTML = html;
    
  } catch (error) {
    console.warn('Помилка отримання характеристик камери:', error);
    cameraDetails.innerHTML = `<span class="loading">⚠️ Деякі дані недоступні</span>`;
  }
}

// =====================
// ГОЛОСОВЕ ВВЕДЕННЯ
// =====================
function startVoiceInput(fieldId) {
  const input = document.getElementById(fieldId);
  const micBtn = input.parentElement.querySelector('.btn-microphone');
  
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('❌ Ваш браузер не підтримує голосове введення');
    return;
  }

  if (isRecording) {
    stopVoiceInput(micBtn);
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  
  recognition.lang = 'uk-UA';
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = function(event) {
    const result = event.results[0][0].transcript;
    let cleanText = result
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/(\d)\s+(?=\d)/g, '$1')
      .replace(/(\d)\s+([а-яa-z])/gi, '$1 $2')
      .replace(/([а-яa-z])\s+(\d)/gi, '$1 $2');
    
    if (fieldId === 'search') {
      input.value = cleanText;
      searchPhotos();
    } else {
      input.value = cleanText;
    }
    
    input.dispatchEvent(new Event('input'));
    if (navigator.vibrate) navigator.vibrate(30);
  };

  recognition.onerror = function(event) {
    console.warn('Помилка розпізнавання:', event.error);
    let message = '❌ Помилка розпізнавання';
    if (event.error === 'not-allowed') {
      message = '❌ Дозвольте доступ до мікрофона';
    } else if (event.error === 'no-speech') {
      message = '⏳ Нічого не почуто, спробуйте ще';
    }
    alert(message);
    stopVoiceInput(micBtn);
  };

  recognition.onend = function() {
    stopVoiceInput(micBtn);
  };

  try {
    recognition.start();
    isRecording = true;
    micBtn.classList.add('active');
    micBtn.textContent = '⏹️';
    micBtn.title = 'Зупинити запис';
  } catch (e) {
    console.error('Помилка запуску:', e);
    alert('❌ Не вдалося запустити мікрофон');
    stopVoiceInput(micBtn);
  }
}

function stopVoiceInput(micBtn) {
  if (recognition) {
    try {
      recognition.stop();
    } catch (e) {}
    recognition = null;
  }
  isRecording = false;
  if (micBtn) {
    micBtn.classList.remove('active');
    micBtn.textContent = '🎤';
    micBtn.title = 'Голосове введення';
  }
}

// =====================
// КАМЕРА
// =====================
function startCamera() {
  if (cameraReady || cameraStarting) {
    updateStatus(cameraReady);
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("❌ Ваш браузер не підтримує камеру");
    return;
  }

  cameraStarting = true;
  updateStatus(false, "⏳ Запит доступу...");
  cameraPlaceholder.innerHTML = `<span>⏳</span><p>Запит доступу до камери...</p>`;

  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  })
  .then((s) => {
    handleStream(s);
  })
  .catch(() => {
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    })
    .then((s) => {
      handleStream(s);
    })
    .catch(() => {
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false
      })
      .then((s) => {
        handleStream(s);
      })
      .catch(() => {
        navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        })
        .then((s) => {
          handleStream(s);
        })
        .catch((err) => {
          console.error("Всі спроби камери провалились:", err);
          cameraStarting = false;
          updateStatus(false, "❌ Помилка");
          cameraPlaceholder.innerHTML = `
            <span>❌</span>
            <p>Не вдалося відкрити камеру</p>
            <p style="font-size:12px;opacity:0.5;margin-top:4px;">
              Перевірте дозволи в браузері
            </p>
            <button onclick="startCamera()" class="btn-camera-start" style="margin-top:10px;">
              🔄 Спробувати ще
            </button>
          `;
        });
      });
    });
  });
}

function handleStream(s) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  stream = s;
  video.srcObject = stream;
  video.style.display = "block";
  cameraPlaceholder.style.display = "none";
  cameraReady = true;
  cameraStarting = false;
  photoBtn.disabled = false;
  
  updateStatus(true, "✅ Камера активна");

  video.play().catch(e => {
    console.warn("Помилка відтворення:", e);
    setTimeout(() => {
      video.play().catch(() => {});
    }, 300);
  });

  // Отримуємо характеристики камери
  setTimeout(() => {
    getCameraCapabilities();
  }, 500);
}

function updateStatus(active, message) {
  if (!cameraStatus) return;
  if (active) {
    cameraStatus.textContent = "✅ Камера активна";
    cameraStatus.className = "camera-status active";
  } else {
    cameraStatus.textContent = message || "⏳ Камера не активна";
    cameraStatus.className = "camera-status";
  }
}

// =====================
// ЗРОБИТИ ФОТО
// =====================
function makePhoto() {
  if (!db) {
    alert("❌ База даних ще завантажується");
    return;
  }

  if (!cameraReady) {
    startCamera();
    let attempts = 0;
    const waitForCamera = setInterval(() => {
      attempts++;
      if (cameraReady) {
        clearInterval(waitForCamera);
        capturePhoto();
      } else if (attempts > 25) {
        clearInterval(waitForCamera);
        alert("❌ Не вдалося запустити камеру. Перевірте дозволи.");
      }
    }, 300);
    return;
  }

  capturePhoto();
}

function capturePhoto() {
  const bigCanvas = document.createElement("canvas");
  bigCanvas.width = 1280;
  bigCanvas.height = 720;
  const ctx = bigCanvas.getContext("2d");
  ctx.drawImage(video, 0, 0, 1280, 720);
  const bigDataURL = bigCanvas.toDataURL("image/webp", 0.92);

  const smallCanvas = document.createElement("canvas");
  smallCanvas.width = 320;
  smallCanvas.height = 320;
  const s = smallCanvas.getContext("2d");
  s.drawImage(video, 0, 0, 320, 320);
  const smallDataURL = smallCanvas.toDataURL("image/webp", 0.78);

  const item = {
    id: Date.now(),
    small: smallDataURL,
    big: bigDataURL,
    album: albumInput.value.trim() || "Без альбома",
    date: new Date().toLocaleString()
  };

  const tx = db.transaction("photos", "readwrite");
  tx.objectStore("photos").add(item);
  showCard(item);
  updateCount();
  
  if (navigator.vibrate) navigator.vibrate(50);
}

// =====================
// ПОКАЗАТИ КАРТКУ
// =====================
function showCard(p) {
  const box = document.createElement("div");
  box.className = "card";
  box.innerHTML = `
    <img class="photo" src="${p.small}" alt="Фото" loading="lazy">
    <div class="info">
      <div class="small album-name">📁 ${p.album}</div>
      <div class="small">📅 ${p.date}</div>
    </div>
    <div class="card-actions">
      <button onclick="openPhoto(${p.id})" class="btn-open">👁️</button>
      <button onclick="downloadOriginal(${p.id})" class="btn-download">⬇️</button>
      <button onclick="delPhoto(${p.id}, this)" class="btn-delete">✕</button>
    </div>
  `;
  gallery.appendChild(box);
}

// =====================
// ЗАВАНТАЖИТИ ВСІ ФОТО
// =====================
function loadPhotos() {
  gallery.innerHTML = "";
  const tx = db.transaction("photos", "readonly");
  const store = tx.objectStore("photos");
  const req = store.openCursor();
  req.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      showCard(cursor.value);
      cursor.continue();
    }
  };
  updateCount();
}

// =====================
// ВІДКРИТИ ОРИГІНАЛ
// =====================
window.openPhoto = function(id) {
  const tx = db.transaction("photos", "readonly");
  tx.objectStore("photos").get(id).onsuccess = (e) => {
    const p = e.target.result;
    if (!p) return;
    const win = window.open("", "_blank");
    if (!win) {
      alert("⚠️ Дозвольте спливаючі вікна");
      return;
    }
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width,initial-scale=1.0">
        <style>
          body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;}
          img{max-width:100%;max-height:100vh;object-fit:contain;}
        </style>
      </head>
      <body>
        <img src="${p.big}" alt="Фото">
      </body>
      </html>
    `);
  };
};

// =====================
// ЗАВАНТАЖИТИ ОРИГІНАЛ
// =====================
window.downloadOriginal = function(id) {
  const tx = db.transaction("photos", "readonly");
  tx.objectStore("photos").get(id).onsuccess = (e) => {
    const p = e.target.result;
    if (!p) return;
    const link = document.createElement("a");
    link.href = p.big;
    link.download = `photo_${p.id}.webp`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
};

// =====================
// ВИДАЛИТИ ФОТО
// =====================
window.delPhoto = function(id, el) {
  if (!confirm("🗑️ Видалити це фото?")) return;
  const tx = db.transaction("photos", "readwrite");
  tx.objectStore("photos").delete(id);
  const card = el.closest('.card');
  if (card) card.remove();
  updateCount();
};

// =====================
// ПОШУК
// =====================
window.searchPhotos = function() {
  const text = searchInput.value.toLowerCase();
  document.querySelectorAll(".card").forEach(card => {
    const match = card.innerText.toLowerCase().includes(text);
    card.style.display = match ? "flex" : "none";
  });
};

// =====================
// ЕКСПОРТ
// =====================
window.exportPhotos = function() {
  const tx = db.transaction("photos", "readonly");
  const store = tx.objectStore("photos");
  const all = [];
  store.openCursor().onsuccess = (e) => {
    const c = e.target.result;
    if (c) {
      all.push(c.value);
      c.continue();
    } else {
      if (!all.length) {
        alert("❌ Немає фото");
        return;
      }
      const json = JSON.stringify(all, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `photos_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
    }
  };
};

// =====================
// ЛІЧИЛЬНИК
// =====================
function updateCount() {
  if (!db) return;
  const tx = db.transaction("photos", "readonly");
  const countReq = tx.objectStore("photos").count();
  countReq.onsuccess = () => {
    const total = countReq.result;
    photoCount.textContent = total ? `📸 Всього фото: ${total}` : '';
  };
}

// =====================
// АВТОМАТИЧНИЙ ЗАПУСК
// =====================
photoBtn.addEventListener('click', function(e) {
  e.preventDefault();
  if (!cameraReady) {
    startCamera();
  }
});

updateStatus(false, "⏳ Натисніть «Фото»");

// Отримуємо інформацію про камеру при завантаженні
setTimeout(() => {
  getCameraCapabilities();
}, 1000);