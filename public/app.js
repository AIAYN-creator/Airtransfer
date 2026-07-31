const fileInput = document.getElementById('file-input');
const fileLabel = document.getElementById('file-label');
const uploadBtn = document.getElementById('upload-btn');
const status = document.getElementById('status');
const statsFill = document.getElementById('stats-fill');
const statsText = document.getElementById('stats-text');

function formatPercent(percent) {
  if (percent === 0) return '0';
  return percent < 1 ? percent.toFixed(4) : percent.toFixed(2);
}

function renderStats(stats) {
  statsFill.style.width = `${Math.min(stats.percentUsed, 100)}%`;
  const dias = stats.daysUntilReset === 1 ? 'día' : 'días';
  statsText.textContent =
    `Has usado el ${formatPercent(stats.percentUsed)}% de tus envíos gratuitos este mes ` +
    `· se resetea en ${stats.daysUntilReset} ${dias}`;
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
