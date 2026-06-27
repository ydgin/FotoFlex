// =====================
// DOM елементи
// =====================
const video = document.getElementById("camera");
const gallery = document.getElementById("gallery");
const albumInput = document.getElementById("album");
const searchInput = document.getElementById("search");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const photoBtn = document.getElementById("photoBtn");
const photoCount = document.getElementById("photoCount");
const cameraWrapper = document.getElementById("cameraWrapper");

// =====================
// Глобальні змінні
// =====================
let db;
let stream = null;
let cameraReady = false;
let cameraStarting = false;

// =====================
// IndexedDB - ініціалізація
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
// Камера - оптимізовано для Motorola
// =====================
function startCamera() {
  if (cameraReady || cameraStarting) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("❌ Ваш браузер не підтримує камеру");
    return;
  }

  cameraStarting = true;
  cameraPlaceholder.innerHTML = `<span>⏳</span><p>Запит доступу до камери...</p>`;

  // Спроба 1: стандартні налаштування з низькою роздільною здатністю
  const constraints = {
    video: {
      facingMode: "environment",
      width: { ideal: 640 },
      height: { ideal: 480 }
    },
    audio: false
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then((s) => {
      handleStream(s);
    })
    .catch(() => {
      // Спроба 2: без вказання роздільної здатності
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      })
      .then((s) => {
        handleStream(s);
      })
      .catch(() => {
        // Спроба 3: передня камера
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false
        })
        .then((s) => {
          handleStream(s);
        })
        .catch(() => {
          // Спроба 4: без facingMode
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
            cameraPlaceholder.innerHTML = `
              <span>❌</span>
              <p>Не вдалося відкрити камеру</p>
              <p style="font-size:12px;opacity:0.5;margin-top:4px;">
                Перевірте дозволи в браузері<br>
                та перезавантажте сторінку
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
  // Закриваємо попередній потік, якщо є
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

  // Примусово відтворюємо відео
  video.play().catch(e => {
    console.warn("Помилка відтворення:", e);
    // Якщо не відтворюється, пробуємо перезавантажити
    setTimeout(() => {
      video.play().catch(() => {});
    }, 500);
  });
}

// =====================
// Зробити фото
// =====================
function makePhoto() {
  if (!db) {
    alert("❌ База даних ще завантажується");
    return;
  }

  if (!cameraReady) {
    startCamera();
    // Чекаємо поки камера запуститься
    let attempts = 0;
    const waitForCamera = setInterval(() => {
      attempts++;
      if (cameraReady) {
        clearInterval(waitForCamera);
        capturePhoto();
      } else if (attempts > 20) {
        clearInterval(waitForCamera);
        alert("❌ Камера не доступна. Дозвольте доступ до камери.");
      }
    }, 300);
    return;
  }

  capturePhoto();
}

function capturePhoto() {
  // Оригінал (велике фото)
  const bigCanvas = document.createElement("canvas");
  bigCanvas.width = 1280;
  bigCanvas.height = 720;
  const ctx = bigCanvas.getContext("2d");
  ctx.drawImage(video, 0, 0, 1280, 720);
  const bigDataURL = bigCanvas.toDataURL("image/webp", 0.92);

  // Прев'ю (для галереї)
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
}

// =====================
// Показати картку фото
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
// Завантажити всі фото
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
// Відкрити оригінал
// =====================
window.openPhoto = function(id) {
  const tx = db.transaction("photos", "readonly");
  tx.objectStore("photos").get(id).onsuccess = (e) => {
    const p = e.target.result;
    if (!p) return;
    const win = window.open("", "_blank");
    if (!win) {
      alert("⚠️ Дозвольте спливаючі вікна для перегляду");
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
// Завантажити оригінал
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
// Видалити фото
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
// Пошук фото
// =====================
window.searchPhotos = function() {
  const text = searchInput.value.toLowerCase();
  document.querySelectorAll(".card").forEach(card => {
    const match = card.innerText.toLowerCase().includes(text);
    card.style.display = match ? "flex" : "none";
  });
};

// =====================
// Експорт в JSON
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
        alert("❌ Немає фото для експорту");
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
// Оновити лічильник
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
// Клік по кнопці Фото
// =====================
photoBtn.addEventListener('click', function(e) {
  if (!cameraReady) {
    e.preventDefault();
    startCamera();
  }
});