// =====================
// DOM элементы
// =====================
const video = document.getElementById("camera");
const gallery = document.getElementById("gallery");
const album = document.getElementById("album");
const search = document.getElementById("search");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");
const photoBtn = document.getElementById("photoBtn");
const photoCount = document.getElementById("photoCount");

// =====================
// Глобальные переменные
// =====================
let db;
let stream = null;
let cameraReady = false;

// =====================
// IndexedDB - инициализация
// =====================
const request = indexedDB.open("PhotoBase", 1);

request.onupgradeneeded = (e) => {
    db = e.target.result;
    const store = db.createObjectStore("photos", { keyPath: "id" });
    store.createIndex("date", "date");
    store.createIndex("album", "album");
};

request.onsuccess = (e) => {
    db = e.target.result;
    loadPhotos();
};

request.onerror = () => {
    alert("❌ Помилка відкриття бази даних");
};

// =====================
// Камера
// =====================
function startCamera() {
    if (cameraReady) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("❌ Ваш браузер не підтримує камеру");
        return;
    }

    cameraPlaceholder.innerHTML = `
        <span>⏳</span>
        <p>Запит доступу до камери...</p>
    `;

    navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    })
    .then((s) => {
        stream = s;
        video.srcObject = stream;
        video.style.display = "block";
        cameraPlaceholder.style.display = "none";
        cameraReady = true;
        photoBtn.disabled = false;
        video.play().catch(e => console.log("Play error:", e));
    })
    .catch((err) => {
        console.error("Camera error:", err);
        
        // Пробуем с передней камерой
        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        })
        .then((s) => {
            stream = s;
            video.srcObject = stream;
            video.style.display = "block";
            cameraPlaceholder.style.display = "none";
            cameraReady = true;
            photoBtn.disabled = false;
            video.play().catch(e => console.log("Play error:", e));
        })
        .catch(() => {
            cameraPlaceholder.innerHTML = `
                <span>❌</span>
                <p>Не вдалося відкрити камеру</p>
                <p style="font-size:12px;opacity:0.5;margin-top:5px;">
                    Перевірте дозволи в браузері
                </p>
                <button onclick="startCamera()" class="btn-camera-start" style="margin-top:10px;">
                    🔄 Спробувати ще
                </button>
            `;
        });
    });
}

// =====================
// Сделать фото
// =====================
function makePhoto() {
    if (!db) {
        alert("❌ База даних ще завантажується");
        return;
    }

    if (!cameraReady) {
        startCamera();
        setTimeout(() => {
            if (!cameraReady) {
                alert("❌ Камера не доступна. Дозвольте доступ до камери.");
                return;
            }
            capturePhoto();
        }, 1000);
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
    const big = bigCanvas.toDataURL("image/webp", 0.85);

    const smallCanvas = document.createElement("canvas");
    smallCanvas.width = 200;
    smallCanvas.height = 200;
    const s = smallCanvas.getContext("2d");
    s.drawImage(video, 0, 0, 200, 200);
    const small = smallCanvas.toDataURL("image/webp", 0.7);

    const item = {
        id: Date.now(),
        small: small,
        big: big,
        album: album.value.trim() || "Без альбома",
        date: new Date().toLocaleString()
    };

    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").add(item);
    show(item);
    updateCount();
}

// =====================
// Показ фото
// =====================
function show(p) {
    const box = document.createElement("div");
    box.className = "card";
    box.innerHTML = `
        <img class="photo" src="${p.small}" alt="Фото" loading="lazy">
        <div class="info">
            <div class="small album-name">📁 ${p.album}</div>
            <div class="small">📅 ${p.date}</div>
        </div>
        <div class="card-actions">
            <button onclick="openPhoto(${p.id})" class="btn-open">Відкрити</button>
            <button onclick="delPhoto(${p.id}, this)" class="btn-delete">✕</button>
        </div>
    `;
    gallery.appendChild(box);
}

// =====================
// Загрузка фото
// =====================
function loadPhotos() {
    gallery.innerHTML = "";
    const tx = db.transaction("photos", "readonly");
    tx.objectStore("photos").openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            show(cursor.value);
            cursor.continue();
        }
    };
    updateCount();
}

// =====================
// Открыть фото
// =====================
function openPhoto(id) {
    const tx = db.transaction("photos", "readonly");
    tx.objectStore("photos").get(id).onsuccess = (e) => {
        const p = e.target.result;
        const w = window.open();
        w.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { margin:0; background:#000; display:flex; align-items:center; justify-content:center; min-height:100vh; }
                    img { max-width:100%; max-height:100vh; object-fit:contain; }
                </style>
            </head>
            <body>
                <img src="${p.big}" alt="Фото">
            </body>
            </html>
        `);
    };
}

// =====================
// Удалить фото
// =====================
function delPhoto(id, el) {
    if (!confirm("🗑️ Видалити це фото?")) return;
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").delete(id);
    el.closest('.card').remove();
    updateCount();
}

// =====================
// Поиск
// =====================
function searchPhotos() {
    const text = search.value.toLowerCase();
    const cards = document.querySelectorAll(".card");
    cards.forEach((card) => {
        const match = card.innerText.toLowerCase().includes(text);
        card.style.display = match ? "block" : "none";
    });
}

// =====================
// Экспорт
// =====================
function exportPhotos() {
    const tx = db.transaction("photos", "readonly");
    const store = tx.objectStore("photos");
    const photos = [];
    store.openCursor().onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
            photos.push(cursor.value);
            cursor.continue();
        } else {
            if (photos.length === 0) {
                alert("❌ Немає фото для експорту");
                return;
            }
            const data = JSON.stringify(photos, null, 2);
            const blob = new Blob([data], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `photos_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
        }
    };
}

// =====================
// Счетчик фото
// =====================
function updateCount() {
    if (!db) return;
    const tx = db.transaction("photos", "readonly");
    const store = tx.objectStore("photos");
    const count = store.count();
    count.onsuccess = () => {
        const total = count.result;
        photoCount.textContent = total > 0 ? `📸 Всього фото: ${total}` : '';
    };
}

// =====================
// Инициализация камеры при клике
// =====================
photoBtn.addEventListener('click', () => {
    if (!cameraReady) {
        startCamera();
    }
});