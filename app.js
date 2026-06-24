const video = document.getElementById("camera");
const gallery = document.getElementById("gallery");
const album = document.getElementById("album");
const search = document.getElementById("search");
const cameraPlaceholder = document.getElementById("cameraPlaceholder");

let db;
let stream = null;

// =====================
// IndexedDB
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
    alert("Ошибка открытия базы данных");
};

// =====================
// Камера
// =====================

function initCamera() {
    if (stream) {
        // Камера уже открыта
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Ваш браузер не поддерживает камеру");
        return;
    }

    const constraints = {
        video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
        .then((s) => {
            stream = s;
            video.srcObject = stream;
            video.style.display = "block";
            cameraPlaceholder.style.display = "none";
            
            // Пробуем воспроизвести
            video.play().catch(e => console.log("Play error:", e));
        })
        .catch((err) => {
            console.error("Camera error:", err);
            
            // Пробуем с другими настройками
            const fallbackConstraints = {
                video: {
                    facingMode: "user"
                }
            };
            
            navigator.mediaDevices.getUserMedia(fallbackConstraints)
                .then((s) => {
                    stream = s;
                    video.srcObject = stream;
                    video.style.display = "block";
                    cameraPlaceholder.style.display = "none";
                    video.play().catch(e => console.log("Play error:", e));
                })
                .catch(() => {
                    alert("Не удалось открыть камеру. Проверьте разрешения в браузере.");
                });
        });
}

// Инициализация камеры при первом клике на кнопку "Фото"
document.querySelector('.btn-primary').addEventListener('click', () => {
    initCamera();
}, { once: false });

// =====================
// Сделать фото
// =====================

function makePhoto() {
    if (!db) {
        alert("База данных ещё загружается");
        return;
    }

    // Если камера не инициализирована, инициализируем
    if (!stream || !video.srcObject) {
        initCamera();
        // Даем время на открытие камеры
        setTimeout(() => {
            if (!stream) {
                alert("Камера не доступна. Пожалуйста, разрешите доступ к камере.");
                return;
            }
            capturePhoto();
        }, 500);
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
            <div class="small album-name">${p.album}</div>
            <div class="small">${p.date}</div>
        </div>
        <div class="card-actions">
            <button onclick="openPhoto(${p.id})" class="btn-open">Открыть</button>
            <button onclick="delPhoto(${p.id}, this)" class="btn-delete">Удалить</button>
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
            </head>
            <body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;">
                <img src="${p.big}" style="max-width:100%;max-height:100vh;object-fit:contain;">
            </body>
            </html>
        `);
    };
}

// =====================
// Удалить фото
// =====================

function delPhoto(id, el) {
    if (!confirm("Удалить это фото?")) return;
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").delete(id);
    el.closest('.card').remove();
}

// =====================
// Поиск
// =====================

function searchPhotos() {
    const text = search.value.toLowerCase();
    const cards = document.querySelectorAll(".card");
    cards.forEach((card) => {
        card.style.display = card.innerText.toLowerCase().includes(text) ? "block" : "none";
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
            const data = JSON.stringify(photos, null, 2);
            const blob = new Blob([data], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `photos_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
        }
    };
}
