const status = document.getElementById('status');

async function run() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const [keyFragment, ivFragment] = location.hash.slice(1).split('.');

  if (!id || !keyFragment || !ivFragment) {
    status.textContent = 'Enlace incompleto.';
    return;
  }

  const response = await fetch(`/api/file/${id}`);

  if (response.status === 404) {
    status.textContent = 'Archivo no encontrado (o ya fue descargado antes).';
    return;
  }
  if (response.status === 410) {
    status.textContent = 'Este archivo ha caducado (más de 24h).';
    return;
  }
  if (!response.ok) {
    status.textContent = 'Error al descargar.';
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
    return;
  }

  const envelope = JSON.parse(new TextDecoder().decode(decryptedBuffer));
  const fileBuffer = base64ToBuffer(envelope.data);
  const blob = new Blob([fileBuffer], { type: envelope.type });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = envelope.name;
  link.click();
  URL.revokeObjectURL(link.href);

  status.textContent = `Descargado: ${envelope.name}`;
}

run();
