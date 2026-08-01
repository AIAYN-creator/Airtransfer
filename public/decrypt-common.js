// Busca, descifra y prepara para guardar un archivo dado su id + clave.
// Usado tanto por la descarga clásica (download.js) como por el modo
// "recibir" (recibir.js). Devuelve true/false según si acabó en éxito.
async function fetchDecryptAndOfferSave(id, keyFragment, ivFragment, statusEl, actionAreaEl) {
  statusEl.textContent = 'Descargando y descifrando...';

  const response = await fetch(`/api/file/${id}`, { cache: 'no-store' });

  if (response.status === 404) {
    statusEl.textContent = 'Archivo no encontrado (o ya fue descargado antes).';
    return false;
  }
  if (response.status === 410) {
    statusEl.textContent = 'Este archivo ha caducado (más de 24h).';
    return false;
  }
  if (!response.ok) {
    statusEl.textContent = 'Error al descargar.';
    return false;
  }

  const encryptedBuffer = await response.arrayBuffer();

  const rawKey = base64ToBuffer(fromBase64Url(keyFragment));
  const iv = new Uint8Array(base64ToBuffer(fromBase64Url(ivFragment)));
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);

  let decryptedBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedBuffer);
  } catch {
    statusEl.textContent = 'No se pudo descifrar (clave incorrecta o enlace corrupto).';
    return false;
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

  actionAreaEl.replaceChildren(saveLink);
  statusEl.textContent = 'Listo. Pulsa para guardar.';
  return true;
}
