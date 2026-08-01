function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  // Trocear en bloques de 32K: concatenar carácter a carácter es lento en
  // móviles para archivos de varios MB (fotos reales), y pasar el array
  // entero de una vez a fromCharCode revienta el límite de argumentos.
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Base64 "seguro para URL": sin +, / ni =, que tienen significado especial ahí.
function toBase64Url(base64) {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return base64;
}
