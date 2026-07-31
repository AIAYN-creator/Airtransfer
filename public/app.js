const fileInput = document.getElementById('file-input');
const fileLabel = document.getElementById('file-label');
const uploadBtn = document.getElementById('upload-btn');
const status = document.getElementById('status');
const uploadsFill = document.getElementById('uploads-fill');
const uploadsText = document.getElementById('uploads-text');
const storageFill = document.getElementById('storage-fill');
const storageText = document.getElementById('storage-text');

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
});

uploadBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) return;

  uploadBtn.disabled = true;
  status.textContent = 'Cifrando...';

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));

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

  const uploadResponse = await fetch('/api/upload', {
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

  const rawKey = await crypto.subtle.exportKey('raw', key);
  const keyFragment = toBase64Url(bufferToBase64(rawKey));
  const ivFragment = toBase64Url(bufferToBase64(iv.buffer));
  const shareUrl = `${location.origin}/download.html?id=${id}#${keyFragment}.${ivFragment}`;

  status.innerHTML = `Listo, caduca en 24h o tras la primera descarga:<br><code>${shareUrl}</code>`;
  uploadBtn.disabled = false;
});
