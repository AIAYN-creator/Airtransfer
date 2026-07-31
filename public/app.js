const fileInput = document.getElementById('file-input');
const fileLabel = document.getElementById('file-label');
const uploadBtn = document.getElementById('upload-btn');
const status = document.getElementById('status');

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

  status.textContent = 'Cifrando...';

  // Clave simétrica de 256 bits, generada en el navegador. `true` la marca
  // "extraíble" para poder exportarla luego y meterla en la URL.
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  // El IV no es secreto, pero debe ser distinto en cada cifrado con la
  // misma clave, o GCM deja de garantizar seguridad.
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const fileBuffer = await file.arrayBuffer();
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    fileBuffer
  );

  const rawKey = await crypto.subtle.exportKey('raw', key);
  const keyBase64 = arrayBufferToBase64Url(rawKey);
  const ivBase64 = arrayBufferToBase64Url(iv.buffer);
  const fragment = `${keyBase64}.${ivBase64}`;

  status.textContent = `Cifrado: ${file.size} -> ${encryptedBuffer.byteLength} bytes. Clave generada (siguiente paso: subirlo).`;
  console.log('Fragment que iría en la URL:', fragment);
});

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
