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
  downloadBtn.addEventListener('click', async () => {
    downloadBtn.disabled = true;
    const ok = await fetchDecryptAndOfferSave(id, keyFragment, ivFragment, status, actionArea);
    if (!ok) downloadBtn.remove();
  });
  actionArea.appendChild(downloadBtn);
}
