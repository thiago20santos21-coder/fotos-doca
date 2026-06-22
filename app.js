const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyC0k4gsBJiIDVvmIr9UwIYtSkKrJp6YTbk",
    authDomain:        "painel-ml-logistica.firebaseapp.com",
    projectId:         "painel-ml-logistica",
    storageBucket:     "painel-ml-logistica.firebasestorage.app",
    messagingSenderId: "814809332914",
    appId:             "1:814809332914:web:bc8d48e9bf919b84105dab"
};

import { initializeApp }                                   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, addDoc, onSnapshot,
         query, orderBy, serverTimestamp }                  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage, ref, uploadBytesResumable,
         getDownloadURL }                                   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// ── Firebase init ──────────────────────────────────────
let db, storage, FIREBASE_OK = false;
const configured = !FIREBASE_CONFIG.apiKey.startsWith('COLE');

if (configured) {
    try {
        const app = initializeApp(FIREBASE_CONFIG);
        db       = getFirestore(app);
        storage  = getStorage(app);
        FIREBASE_OK = true;
    } catch(e) { console.warn('Firebase init error:', e); }
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
const setupNotice  = $('setupNotice');
const toast        = $('toast');
const previewWrap  = $('previewWrap');
const camModal     = $('camModal');
const camVideo     = $('camVideo');
const camCancel    = $('camCancel');
const camToggle    = $('camToggle');
const captureBtn   = $('captureBtn');

// ── State ──────────────────────────────────────────────
let currentPhoto  = null;
let allPhotos     = [];
let modalPhoto    = null;
let deferredPWA   = null;
let cameraStream  = null;
let facingMode    = 'environment'; // 'environment' = traseira, 'user' = frontal

// ── Setup notice ───────────────────────────────────────
if (!configured && setupNotice) setupNotice.style.display = 'block';

// ── Camera ao vivo (getUserMedia) ──────────────────────
$('openCam').addEventListener('click', openCamera);
$('openGal').addEventListener('click', () => galInput.click());

galInput.addEventListener('change', onFileChosen);

async function openCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Fallback para dispositivos sem suporte à API
        camInput.click();
        return;
    }
    try {
        const constraints = {
            video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false
        };
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
            // Câmera traseira não disponível (desktop) — tenta qualquer câmera
            cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        camVideo.srcObject = cameraStream;
        // Espelha câmera frontal para parecer natural
        camVideo.style.setProperty('--mirror', facingMode === 'user' ? '-1' : '1');
        camModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } catch(e) {
        showToast('Câmera bloqueada. Verifique as permissões do navegador.', 'err');
    }
}

function closeCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
    }
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
    // Aplica espelhamento no canvas se for câmera frontal
    if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
    }
    ctx.drawImage(camVideo, 0, 0);
    canvas.toBlob(blob => {
        const file   = new File([blob], 'camera.jpg', { type: 'image/jpeg' });
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setCurrentPhoto({ file, dataUrl });
        closeCamera();
    }, 'image/jpeg', 0.92);
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

// ── Save photo ─────────────────────────────────────────
saveBtn.addEventListener('click', savePhoto);

async function savePhoto() {
    if (!currentPhoto || !dockInput.value.trim()) return;

    const dock = dockInput.value.trim().toUpperCase().replace(/\s+/g,'-');
    const now  = new Date();
    const pad  = n => String(n).padStart(2,'0');
    const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `DOCA-${dock}_${stamp}.jpg`;

    saveBtn.disabled = true;
    progressWrap.style.display = 'block';
    setProgress(5, 'Iniciando...');

    if (!FIREBASE_OK) {
        await saveLocal(dock, fileName, now);
        return;
    }

    try {
        const blob = await (await fetch(currentPhoto.dataUrl)).blob();
        const stRef = ref(storage, `fotos-doca/${fileName}`);
        const task  = uploadBytesResumable(stRef, blob, { contentType: 'image/jpeg' });

        task.on('state_changed',
            snap => setProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 85), `Enviando... ${Math.round(snap.bytesTransferred/snap.totalBytes*100)}%`),
            err  => { showToast('Erro no upload: ' + err.message, 'err'); resetSaveUI(); },
            async () => {
                setProgress(92, 'Salvando dados...');
                const url = await getDownloadURL(task.snapshot.ref);
                await addDoc(collection(db, 'fotos'), {
                    dockNumber: dock,
                    fileName,
                    url,
                    timestamp: serverTimestamp(),
                    device: /Mobi/.test(navigator.userAgent) ? 'mobile' : 'desktop'
                });
                setProgress(100, 'Salvo!');
                setTimeout(() => { resetSaveUI(); resetForm(); showToast('Foto salva!', 'ok'); }, 700);
            }
        );
    } catch(e) {
        showToast('Erro: ' + e.message, 'err');
        resetSaveUI();
    }
}

async function saveLocal(dock, fileName, now) {
    setProgress(40, 'Salvando...');
    const photos = JSON.parse(localStorage.getItem('dock-photos') || '[]');
    photos.unshift({ id: Date.now().toString(), dockNumber: dock, fileName, url: currentPhoto.dataUrl, timestamp: now.toISOString(), device: 'local' });
    if (photos.length > 60) photos.length = 60;
    localStorage.setItem('dock-photos', JSON.stringify(photos));
    setProgress(100, 'Salvo!');
    setTimeout(() => { resetSaveUI(); resetForm(); loadLocalPhotos(); showToast('Foto salva localmente!', 'ok'); }, 600);
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

// ── Load photos ────────────────────────────────────────
function loadPhotos() {
    if (FIREBASE_OK) {
        const q = query(collection(db, 'fotos'), orderBy('timestamp', 'desc'));
        onSnapshot(q, snap => {
            allPhotos = snap.docs.map(d => ({ id: d.id, ...d.data(), timestamp: d.data().timestamp?.toDate() || new Date() }));
            galleryLoad.style.display = 'none';
            renderGallery();
        }, err => {
            console.warn('Firestore error:', err);
            galleryLoad.style.display = 'none';
            loadLocalPhotos();
        });
    } else {
        loadLocalPhotos();
    }
}

function loadLocalPhotos() {
    allPhotos = JSON.parse(localStorage.getItem('dock-photos') || '[]')
        .map(p => ({ ...p, timestamp: new Date(p.timestamp) }));
    galleryLoad.style.display = 'none';
    renderGallery();
}

// ── Render gallery ─────────────────────────────────────
function renderGallery() {
    const q = searchInput.value.trim().toLowerCase();
    const list = q ? allPhotos.filter(p => p.dockNumber.toLowerCase().includes(q) || p.fileName.toLowerCase().includes(q)) : allPhotos;

    countBadge.textContent = `${list.length} foto${list.length !== 1 ? 's' : ''}`;

    if (!list.length) {
        photoGrid.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }
    emptyState.style.display = 'none';

    photoGrid.innerHTML = list.map(p => {
        const d = p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp);
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
        el.addEventListener('click', ev => { ev.stopPropagation(); downloadPhoto(getPhoto(el.dataset.id)); })
    );
}

function getPhoto(id) { return allPhotos.find(p => p.id === id); }

searchInput.addEventListener('input', renderGallery);

// ── Modal ──────────────────────────────────────────────
function openModal(id) {
    const p = getPhoto(id);
    if (!p) return;
    modalPhoto = p;
    modalImg.src = p.url;
    modalDock.textContent = `Doca: ${p.dockNumber}`;
    const d = p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp);
    modalDate.textContent = d.toLocaleString('pt-BR');
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
async function downloadPhoto(p) {
    if (!p) return;
    const name = p.fileName || `DOCA-${p.dockNumber}.jpg`;
    showToast('Baixando...', 'info');
    try {
        const res  = await fetch(p.url);
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch {
        const a = document.createElement('a');
        a.href = p.url; a.download = name;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
    }
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

// Open camera if started via shortcut
if (new URLSearchParams(location.search).get('action') === 'camera') {
    setTimeout(() => camInput.click(), 400);
}
