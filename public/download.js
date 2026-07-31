const actionArea = document.getElementById('action-area');
const status = document.getElementById('status');

const params = new URLSearchParams(location.search);
const id = params.get('id');
const [keyFragment, ivFragment] = location.hash.slice(1).split('.');

if (!id || !keyFragment || !ivFragment) {
  status.textContent = 'Enlace incompleto.';
} else {
  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = 'Descargar archivo';
  downloadBtn.addEventListener('click', fetchAndDecrypt);
  actionArea.appendChild(downloadBtn);
}

async function fetchAndDecrypt() {
  const downloadBtn = actionArea.querySelector('button');
  downloadBtn.disabled = true;
  status.textContent = 'Descargando y descifrando...';

  const response = await fetch(`/api/file/${id}`);

  if (response.status === 404) {
    status.textContent = 'Archivo no encontrado (o ya fue descargado antes).';
    downloadBtn.remove();
    return;
  }
  if (response.status === 410) {
    status.textContent = 'Este archivo ha caducado (más de 24h).';
    downloadBtn.remove();
    return;
  }
  if (!response.ok) {
    status.textContent = 'Error al descargar.';
    downloadBtn.disabled = false;
    return;
  }

  const encryptedBuffer = await response.arrayBuffer();

  const rawKey = base64ToBuffer(fromBase64Url(keyFragment));
  const iv = new Uint8Array(base64ToBuffer(fromBase64Url(ivFragment)));
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);

  let decryptedBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedBuffer);
  } catch {
    status.textContent = 'No se pudo descifrar (clave incorrecta o enlace corrupto).';
    downloadBtn.remove();
    return;
  }

  const envelope = JSON.parse(new TextDecoder().decode(decryptedBuffer));
  const fileBuffer = base64ToBuffer(envelope.data);
  const blob = new Blob([fileBuffer], { type: envelope.type });

  // Enlace real (no disparado por JS) para que el gesto de guardado lo
  // haga el propio usuario al pulsar: en iPhone/iPad, Safari bloquea las
  // descargas si no vienen de un clic genuino justo en ese instante.
  const saveLink = document.createElement('a');
  saveLink.href = URL.createObjectURL(blob);
  saveLink.download = envelope.name;
  saveLink.className = 'btn-link';
  saveLink.textContent = `Guardar ${envelope.name}`;

  actionArea.replaceChildren(saveLink);
  status.textContent = 'Listo. Pulsa para guardar.';
}
