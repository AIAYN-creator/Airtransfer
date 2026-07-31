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

uploadBtn.addEventListener('click', () => {
  status.textContent = 'Aquí cifraremos y subiremos el archivo (siguiente paso)';
});
