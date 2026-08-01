const fileInput = document.getElementById('file-input');
const fileLabel = document.getElementById('file-label');
const uploadBtn = document.getElementById('upload-btn');
const status = document.getElementById('status');
const shareArea = document.getElementById('share-area');
const subtitle = document.getElementById('subtitle');
const uploadsFill = document.getElementById('uploads-fill');
const uploadsText = document.getElementById('uploads-text');
const storageFill = document.getElementById('storage-fill');
const storageText = document.getElementById('storage-text');

// Modo "emparejado": venimos de escanear el QR de recibir.html, que ya
// generó la clave y solo espera que cifremos con ELLA, no con una propia.
const pairedParams = new URLSearchParams(location.search);
const pairedId = pairedParams.get('id');
const [pairedKeyFragment, pairedIvFragment] = location.hash.slice(1).split('.');
const isPaired = Boolean(pairedId && pairedKeyFragment && pairedIvFragment);

if (isPaired) {
  subtitle.textContent = 'Este archivo se enviará cifrado al dispositivo que lo está esperando';
}

function formatPercent(percent) {
  if (percent === 0) return '0';
  return percent < 1 ? percent.toFixed(4) : percent.toFixed(2);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function renderStats(stats) {
  const dias = stats.daysUntilReset === 1 ? 'día' : 'días';

  uploadsFill.style.width = `${Math.min(stats.percentUsed, 100)}%`;
  uploadsText.textContent =
    `Has usado el ${formatPercent(stats.percentUsed)}% de tus envíos gratuitos este mes ` +
    `· se resetea en ${stats.daysUntilReset} ${dias}`;

  storageFill.style.width = `${Math.min(stats.storagePercentUsed, 100)}%`;
  storageText.textContent =
    `Has usado el ${formatPercent(stats.storagePercentUsed)}% de tu almacenamiento gratuito ` +
    `(${formatBytes(stats.bytesUploaded)} de 10 GB)`;
}

fetch('/api/stats')
  .then((res) => (res.ok ? res.json() : null))
  .then((stats) => stats && renderStats(stats))
  .catch(() => {});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  fileLabel.textContent = file.name;
  uploadBtn.disabled = false;
  status.textContent = '';
  shareArea.replaceChildren();
});

uploadBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  uploadBtn.disabled = true;
  status.textContent = 'Cifrando...';

  let key;
  let iv;
  if (isPaired) {
    // La clave ya la generó quien espera el archivo; solo la importamos
    // para cifrar con ella, nunca la volvemos a exportar ni a mostrar.
    const rawKey = base64ToBuffer(fromBase64Url(pairedKeyFragment));
    iv = new Uint8Array(base64ToBuffer(fromBase64Url(pairedIvFragment)));
    key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  } else {
    key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    iv = crypto.getRandomValues(new Uint8Array(12));
  }

  // Metemos nombre y tipo del archivo DENTRO de lo cifrado, para que el
  // servidor tampoco los vea: solo recibe bytes opacos.
  const fileBuffer = await file.arrayBuffer();
  const envelope = JSON.stringify({
    name: file.name,
    type: file.type,
    data: bufferToBase64(fileBuffer),
  });
  const envelopeBytes = new TextEncoder().encode(envelope);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    envelopeBytes
  );

  status.textContent = 'Subiendo...';

  const uploadUrl = isPaired ? `/api/upload?id=${pairedId}` : '/api/upload';
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    body: encryptedBuffer,
  });

  if (!uploadResponse.ok) {
    status.textContent = 'Error al subir el archivo.';
    uploadBtn.disabled = false;
    return;
  }

  const { id, stats } = await uploadResponse.json();
  renderStats(stats);

  if (isPaired) {
    status.textContent = 'Enviado. Se descargará solo en el otro dispositivo.';
    fileLabel.textContent = 'Elige un archivo';
    fileInput.value = '';
    return;
  }

  const rawKey = await crypto.subtle.exportKey('raw', key);
  const keyFragment = toBase64Url(bufferToBase64(rawKey));
  const ivFragment = toBase64Url(bufferToBase64(iv.buffer));
  const shareUrl = `${location.origin}/download.html?id=${id}#${keyFragment}.${ivFragment}`;

  status.textContent = 'Listo, caduca en 24h o tras la primera descarga:';
  renderShareArea(shareUrl);
  uploadBtn.disabled = false;
});

function renderShareArea(shareUrl) {
  const qr = qrcode(0, 'M');
  qr.addData(shareUrl);
  qr.make();

  const qrWrapper = document.createElement('div');
  qrWrapper.className = 'qr-wrapper';
  qrWrapper.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 8, scalable: true });

  const linkCode = document.createElement('code');
  linkCode.className = 'share-link';
  linkCode.textContent = shareUrl;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copiar enlace';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copyBtn.textContent = 'Copiado';
    } catch {
      copyBtn.textContent = 'No se pudo copiar, selecciona el texto a mano';
    }
    setTimeout(() => { copyBtn.textContent = 'Copiar enlace'; }, 2000);
  });

  shareArea.replaceChildren(qrWrapper, linkCode, copyBtn);
}
