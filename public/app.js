const fileInput = document.getElementById('file-input');
const fileLabel = document.getElementById('file-label');
const uploadBtn = document.getElementById('upload-btn');
const status = document.getElementById('status');
const shareArea = document.getElementById('share-area');
const subtitle = document.getElementById('subtitle');

// Modo "emparejado": venimos de escanear el QR de recibir.html, que ya
// generó la clave y solo espera que cifremos con ELLA, no con una propia.
const pairedParams = new URLSearchParams(location.search);
const pairedId = pairedParams.get('id');
const [pairedKeyFragment, pairedIvFragment] = location.hash.slice(1).split('.');
const isPaired = Boolean(pairedId && pairedKeyFragment && pairedIvFragment);
// Llegó un id de emparejamiento pero sin clave: el enlace se rompió por el
// camino (p. ej. la app de Cámara perdió el fragment). Mejor avisar claro
// que caer en modo normal en silencio, subiendo a un id que nadie espera.
const isBrokenPairing = Boolean(pairedId && !isPaired);

if (isPaired) {
  subtitle.textContent = 'Este archivo se enviará cifrado al dispositivo que lo está esperando';
} else if (isBrokenPairing) {
  subtitle.textContent = 'Enlace de emparejamiento incompleto: falta la clave. Vuelve a escanear el código desde "Recibir".';
  uploadBtn.disabled = true;
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;

  fileLabel.textContent = file.name;
  uploadBtn.disabled = isBrokenPairing;
  status.textContent = '';
  shareArea.replaceChildren();
});

uploadBtn.addEventListener('click', async () => {
  if (isBrokenPairing) return;

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
    uploadBtn.disabled = false;
    return;
  }

  const rawKey = await crypto.subtle.exportKey('raw', key);
  const keyFragment = toBase64Url(bufferToBase64(rawKey));
  const ivFragment = toBase64Url(bufferToBase64(iv.buffer));
  // Sin ".html": esa ruta redirige y es un salto extra innecesario.
  const shareUrl = `${location.origin}/download?id=${id}#${keyFragment}.${ivFragment}`;

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
