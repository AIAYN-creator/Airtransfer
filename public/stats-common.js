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

fetch('/api/stats', { cache: 'no-store' })
  .then((res) => (res.ok ? res.json() : null))
  .then((stats) => stats && renderStats(stats))
  .catch(() => {});
