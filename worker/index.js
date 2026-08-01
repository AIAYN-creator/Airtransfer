const FREE_UPLOADS_PER_MONTH = 1_000_000;
const FREE_STORAGE_BYTES_PER_MONTH = 10 * 1024 * 1024 * 1024; // 10 GB
const STATS_KEY = '_stats';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/upload') {
      return handleUpload(request, env, url);
    }

    if (request.method === 'GET' && url.pathname === '/api/stats') {
      const stats = await getStats(env);
      return Response.json(statsForClient(stats));
    }

    // Solo IDs con forma de UUID real: así ninguna ruta de lectura/borrado
    // puede tocar por accidente la clave interna "_stats" ni ninguna otra
    // clave que no sea un archivo subido de verdad.
    const statusMatch = url.pathname.match(/^\/api\/status\/([0-9a-f-]+)$/i);
    if (request.method === 'GET' && statusMatch && UUID_RE.test(statusMatch[1])) {
      return handleStatus(statusMatch[1], env);
    }

    const fileMatch = url.pathname.match(/^\/api\/file\/([0-9a-f-]+)$/i);
    if (request.method === 'GET' && fileMatch && UUID_RE.test(fileMatch[1])) {
      return handleDownload(fileMatch[1], env, ctx);
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleUpload(request, env, url) {
  // En "modo recibir", quien espera el archivo ya eligió el ID de antemano
  // (para poder comprobar su llegada sin conocer nada del contenido). Si no
  // viene ninguno, es una subida normal y lo generamos aquí.
  const requestedId = url.searchParams.get('id');
  if (requestedId !== null && !UUID_RE.test(requestedId)) {
    return new Response('ID inválido', { status: 400 });
  }
  const id = requestedId ?? crypto.randomUUID();

  const body = await request.arrayBuffer();

  await env.BUCKET.put(id, body, {
    customMetadata: { uploadedAt: Date.now().toString() },
  });

  const stats = await recordUpload(env, body.byteLength);

  return Response.json({ id, stats: statsForClient(stats) });
}

// Comprobación de "¿ha llegado ya?" para el sondeo periódico del que
// espera un archivo. A diferencia de handleDownload, NUNCA borra ni
// descarga el contenido: solo mira si existe.
async function handleStatus(id, env) {
  const object = await env.BUCKET.head(id);
  return Response.json({ ready: object !== null });
}

async function handleDownload(id, env, ctx) {
  const object = await env.BUCKET.get(id);

  if (!object) {
    return new Response('No encontrado o ya descargado', { status: 404 });
  }

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const uploadedAt = Number(object.customMetadata?.uploadedAt ?? 0);
  const isExpired = Date.now() - uploadedAt > ONE_DAY_MS;

  // Se borra tanto si expiró como si no: primera (y única) descarga posible.
  ctx.waitUntil(env.BUCKET.delete(id));

  if (isExpired) {
    return new Response('Archivo expirado', { status: 410 });
  }

  return new Response(object.body, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
}

function currentMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

// R2 no tiene "días en el mes"; se calcula restando la fecha de hoy del
// primer día del mes siguiente.
function daysUntilReset(date = new Date()) {
  const firstOfNextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((firstOfNextMonth - date.getTime()) / msPerDay);
}

async function getStats(env) {
  const month = currentMonthKey();
  const object = await env.BUCKET.get(STATS_KEY);
  const stats = object ? JSON.parse(await object.text()) : null;

  // Si es un mes distinto al guardado, el contador vuelve a empezar en 0.
  if (!stats || stats.month !== month) {
    return { month, uploads: 0, bytesUploaded: 0 };
  }

  // Migración: objetos guardados antes de añadir bytesUploaded.
  return { uploads: 0, bytesUploaded: 0, ...stats };
}

async function recordUpload(env, bytes) {
  const stats = await getStats(env);
  stats.uploads += 1;
  stats.bytesUploaded += bytes;
  await env.BUCKET.put(STATS_KEY, JSON.stringify(stats));
  return stats;
}

function statsForClient(stats) {
  return {
    uploads: stats.uploads,
    percentUsed: (stats.uploads / FREE_UPLOADS_PER_MONTH) * 100,
    bytesUploaded: stats.bytesUploaded,
    storagePercentUsed: (stats.bytesUploaded / FREE_STORAGE_BYTES_PER_MONTH) * 100,
    daysUntilReset: daysUntilReset(),
  };
}
