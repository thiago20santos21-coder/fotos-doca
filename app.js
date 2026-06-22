// ── IndexedDB ──────────────────────────────────────────
const DB_NAME    = 'fotos-doca';
const DB_VERSION = 1;
const STORE      = 'fotos';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp');
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

async function dbSave(data) {
    const db    = await openDB();
    return new Promise((resolve, reject) => {
        const tx    = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        const req   = store.add(data);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}

async function dbGetAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx    = db.transaction(STORE, 'readonly');
        const store = tx.objectStore(STORE);
        const index = store.index('timestamp');
        const req   = index.getAll();
        req.onsuccess = e => resolve(e.target.result.reverse());
        req.onerror   = e => reject(e.target.error);
    });
}

// ── DOM refs ───────────────────────────────────────────
const $ = id => document.getElementById(id);
const camInput     = $('camInput');
const galInput     = $('galInput');
const photoPreview = $('photoPreview');
const previewPh    = $('previewPh');
const rmBtn        = $('rmBtn');
const dockInput    = $('dockInput');
const saveBtn      = $('saveBtn');
const progressWrap = $('progressWrap');
const progressFill = $('progressFill');
const progressLbl  = $('progressLbl');
const photoGrid    = $('photoGrid');
const galleryLoad  = $('galleryLoad');
const emptyState   = $('emptyState');
const countBadge   = $('countBadge');
const searchInput  = $('searchInput');
const modal        = $('modal');
const modalBg      = $('modalBg');
const modalClose   = $('modalClose');
const modalImg     = $('modalImg');
const modalDock    = $('modalDock');
const modalDate    = $('modalDate');
const modalDlBtn   = $('modalDlBtn');
const installBar   = $('installBar');
const installBtn   = $('installBtn');
const closeBar     = $('closeBar');
const toast        = $('toast');
const previewWrap  = $('previewWrap');
const camModal     = $('camModal');
const camVideo     = $('camVideo');
const camCancel    = $('camCancel');
const camToggle    = $('camToggle');
const captureBtn   = $('captureBtn');

// ── State ──────────────────────────────────────────────
let currentPhoto = null;
let allPhotos    = [];
let modalPhoto   = null;
let deferredPWA  = null;
let cameraStream = null;
let facingMode   = 'environment';

// ── Câmera ao vivo ─────────────────────────────────────
$('openCam').addEventListener('click', openCamera);
$('openGal').addEventListener('click', () => galInput.click());
galInput.addEventListener('change', onFileChosen);

async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { camInput.click(); return; }
    try {
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            });
        } catch {
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        camVideo.srcObject = cameraStream;
        camVideo.style.setProperty('--mirror', facingMode === 'user' ? '-1' : '1');
        camModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } catch(e) {
        showToast('Câmera bloqueada. Verifique as permissões.', 'err');
    }
}

function closeCamera() {
    cameraStream?.getTracks().forEach(t => t.stop());
    cameraStream = null;
    camVideo.srcObject = null;
    camModal.style.display = 'none';
    document.body.style.overflow = '';
}

camCancel.addEventListener('click', closeCamera);

camToggle.addEventListener('click', async () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    closeCamera();
    await openCamera();
});

captureBtn.addEventListener('click', () => {
    if (!camVideo.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width  = camVideo.videoWidth;
    canvas.height = camVideo.videoHeight;
    const ctx = canvas.getContext('2d');
    if (facingMode === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(camVideo, 0, 0);
    canvas.toBlob(blob => {
        const file    = new File([blob], 'camera.jpg', { type: 'image/jpeg' });
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCurrentPhoto({ file, dataUrl });
        closeCamera();
    }, 'image/jpeg', 0.85);
});

function setCurrentPhoto(photo) {
    currentPhoto = photo;
    photoPreview.src = photo.dataUrl;
    photoPreview.style.display = 'block';
    previewPh.style.display    = 'none';
    rmBtn.style.display        = 'flex';
    previewWrap.classList.add('has-photo');
    checkSave();
}

function onFileChosen(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCurrentPhoto({ file, dataUrl: ev.target.result });
    reader.readAsDataURL(file);
    e.target.value = '';
}

rmBtn.addEventListener('click', clearPhoto);
function clearPhoto() {
    currentPhoto = null;
    photoPreview.style.display = 'none';
    photoPreview.src           = '';
    previewPh.style.display    = 'flex';
    rmBtn.style.display        = 'none';
    previewWrap.classList.remove('has-photo');
    checkSave();
}

// ── Dock number ────────────────────────────────────────
dockInput.addEventListener('input', checkSave);
function checkSave() {
    saveBtn.disabled = !(currentPhoto && dockInput.value.trim());
}

// ── Salvar foto ────────────────────────────────────────
saveBtn.addEventListener('click', savePhoto);

async function savePhoto() {
    if (!currentPhoto || !dockInput.value.trim()) return;

    const dock  = dockInput.value.trim().toUpperCase().replace(/\s+/g, '-');
    const now   = new Date();
    const pad   = n => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `DOCA-${dock}_${stamp}.jpg`;

    saveBtn.disabled = true;
    progressWrap.style.display = 'block';
    setProgress(30, 'Salvando...');

    try {
        await dbSave({
            dockNumber: dock,
            fileName,
            url:       currentPhoto.dataUrl,
            timestamp: now.getTime()
        });
        setProgress(100, 'Salvo!');
        setTimeout(() => {
            resetSaveUI();
            resetForm();
            loadPhotos();
            showToast('Foto salva!', 'ok');
        }, 500);
    } catch(e) {
        showToast('Erro ao salvar: ' + e.message, 'err');
        resetSaveUI();
    }
}

function setProgress(pct, label) {
    progressFill.style.width = pct + '%';
    progressLbl.textContent  = label;
}
function resetSaveUI() {
    saveBtn.disabled = false;
    checkSave();
    progressWrap.style.display = 'none';
    setProgress(0, '');
}
function resetForm() {
    clearPhoto();
    dockInput.value = '';
}

// ── Carregar fotos ─────────────────────────────────────
async function loadPhotos() {
    try {
        allPhotos = await dbGetAll();
    } catch(e) {
        allPhotos = [];
    }
    galleryLoad.style.display = 'none';
    renderGallery();
}

// ── Renderizar galeria ─────────────────────────────────
function renderGallery() {
    const q    = searchInput.value.trim().toLowerCase();
    const list = q ? allPhotos.filter(p =>
        p.dockNumber.toLowerCase().includes(q) || p.fileName.toLowerCase().includes(q)
    ) : allPhotos;

    countBadge.textContent = `${list.length} foto${list.length !== 1 ? 's' : ''}`;

    if (!list.length) {
        photoGrid.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }
    emptyState.style.display = 'none';

    photoGrid.innerHTML = list.map(p => {
        const d  = new Date(p.timestamp);
        const ds = d.toLocaleDateString('pt-BR');
        const ts = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `
        <div class="photo-card" data-id="${p.id}">
            <div class="pc-img">
                <img src="${p.url}" alt="Doca ${p.dockNumber}" loading="lazy">
                <div class="pc-overlay">
                    <button class="dl-btn" data-id="${p.id}" title="Baixar">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="pc-info">
                <span class="dock-tag">Doca: ${p.dockNumber}</span>
                <div class="pc-date">${ds} ${ts}</div>
            </div>
        </div>`;
    }).join('');

    photoGrid.querySelectorAll('.photo-card').forEach(el =>
        el.addEventListener('click', () => openModal(el.dataset.id))
    );
    photoGrid.querySelectorAll('.dl-btn').forEach(el =>
        el.addEventListener('click', ev => { ev.stopPropagation(); downloadPhoto(getPhoto(Number(el.dataset.id))); })
    );
}

function getPhoto(id) { return allPhotos.find(p => p.id === id); }
searchInput.addEventListener('input', renderGallery);

// ── Modal ──────────────────────────────────────────────
function openModal(id) {
    const p = getPhoto(Number(id));
    if (!p) return;
    modalPhoto = p;
    modalImg.src = p.url;
    modalDock.textContent = `Doca: ${p.dockNumber}`;
    modalDate.textContent = new Date(p.timestamp).toLocaleString('pt-BR');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}
function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    modalImg.src = '';
    modalPhoto = null;
}
modalClose.addEventListener('click', closeModal);
modalBg.addEventListener('click', closeModal);
document.addEventListener('keydown', e => e.key === 'Escape' && closeModal());
modalDlBtn.addEventListener('click', () => modalPhoto && downloadPhoto(modalPhoto));

// ── Download ───────────────────────────────────────────
function downloadPhoto(p) {
    if (!p) return;
    const a      = document.createElement('a');
    a.href       = p.url;
    a.download   = p.fileName || `DOCA-${p.dockNumber}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Download concluído!', 'ok');
}

// ── PWA install ────────────────────────────────────────
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPWA = e;
    installBar.style.display = 'flex';
});
installBtn.addEventListener('click', async () => {
    if (!deferredPWA) return;
    deferredPWA.prompt();
    const { outcome } = await deferredPWA.userChoice;
    if (outcome === 'accepted') showToast('App instalado!', 'ok');
    deferredPWA = null;
    installBar.style.display = 'none';
});
closeBar.addEventListener('click', () => { installBar.style.display = 'none'; });

// ── Toast ──────────────────────────────────────────────
let toastT;
function showToast(msg, type = 'info') {
    toast.textContent = msg;
    toast.className   = `toast show ${type}`;
    clearTimeout(toastT);
    toastT = setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ── Service Worker ─────────────────────────────────────
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

// ── Boot ───────────────────────────────────────────────
loadPhotos();

if (new URLSearchParams(location.search).get('action') === 'camera') {
    setTimeout(() => $('openCam').click(), 400);
}
