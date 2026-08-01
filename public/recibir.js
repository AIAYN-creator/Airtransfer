const qrArea = document.getElementById('qr-area');
const actionArea = document.getElementById('action-area');
const status = document.getElementById('status');
const subtitle = document.getElementById('subtitle');
const newCodeBtn = document.getElementById('new-code-btn');

const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 30 * 60 * 1000; // 30 minutos

let pollTimer = null;
let session = null;

async function startSession() {
  stopPolling();
  qrArea.replaceChildren();
  actionArea.replaceChildren();
  newCodeBtn.hidden = true;
  subtitle.textContent = 'Escanea este código con la cámara del otro dispositivo';
  status.textContent = 'Esperando archivo...';

  // La clave se genera AQUÍ, en quien recibe, y nunca sale de este
  // navegador salvo dentro del propio QR (que solo lee la cámara del
  // otro dispositivo). El servidor nunca la ve.
  const id = crypto.randomUUID();
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const rawKey = await crypto.subtle.exportKey('raw', key);
  const keyFragment = toBase64Url(bufferToBase64(rawKey));
  const ivFragment = toBase64Url(bufferToBase64(iv.buffer));

  // Sin ".html": esa ruta redirige a "/" (Cloudflare la normaliza), y ese
  // salto extra es justo donde un traspaso desde la app de Cámara puede
  // perder el fragment con la clave. Enlazamos directo a la ruta final.
  const sendUrl = `${location.origin}/?id=${id}#${keyFragment}.${ivFragment}`;

  const qr = qrcode(0, 'M');
  qr.addData(sendUrl);
  qr.make();

  const qrWrapper = document.createElement('div');
  qrWrapper.className = 'qr-wrapper';
  qrWrapper.innerHTML = qr.createSvgTag({ cellSize: 5, margin: 8, scalable: true });

  const linkCode = document.createElement('code');
  linkCode.className = 'share-link';
  linkCode.textContent = sendUrl;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = 'Copiar enlace';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(sendUrl);
      copyBtn.textContent = 'Copiado';
    } catch {
      copyBtn.textContent = 'No se pudo copiar';
    }
    setTimeout(() => { copyBtn.textContent = 'Copiar enlace'; }, 2000);
  });

  qrArea.replaceChildren(qrWrapper, linkCode, copyBtn);

  session = { id, keyFragment, ivFragment, startedAt: Date.now() };
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function poll() {
  if (!session) return;

  if (Date.now() - session.startedAt > MAX_WAIT_MS) {
    stopPolling();
    status.textContent = 'Nadie ha enviado nada en 30 minutos.';
    newCodeBtn.hidden = false;
    return;
  }

  let ready = false;
  try {
    const res = await fetch(`/api/status/${session.id}`);
    if (res.ok) {
      ready = (await res.json()).ready;
    }
  } catch {
    return; // fallo de red puntual: se reintenta en el siguiente ciclo
  }

  if (!ready) return;

  stopPolling();
  subtitle.textContent = 'Archivo recibido';
  qrArea.replaceChildren();

  const { id, keyFragment, ivFragment } = session;
  const ok = await fetchDecryptAndOfferSave(id, keyFragment, ivFragment, status, actionArea);
  if (!ok) newCodeBtn.hidden = false;

  // El contador es global (lo actualizó quien nos envió el archivo desde
  // su propio dispositivo); refrescamos para verlo al día también aquí.
  fetch('/api/stats')
    .then((res) => (res.ok ? res.json() : null))
    .then((stats) => stats && renderStats(stats))
    .catch(() => {});
}

newCodeBtn.addEventListener('click', startSession);

startSession();
