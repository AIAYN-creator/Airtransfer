const FREE_UPLOADS_PER_MONTH = 1_000_000;
const STATS_KEY = '_stats';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/upload') {
      return handleUpload(request, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/stats') {
      const stats = await getStats(env);
      return Response.json(statsForClient(stats));
    }

    const match = url.pathname.match(/^\/api\/file\/([a-zA-Z0-9_-]+)$/);
    if (request.method === 'GET' && match) {
      return handleDownload(match[1], env, ctx);
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleUpload(request, env) {
  const id = crypto.randomUUID();
  const body = await request.arrayBuffer();

  await env.BUCKET.put(id, body, {
    customMetadata: { uploadedAt: Date.now().toString() },
  });

  const stats = await recordUpload(env);

  return Response.json({ id, stats: statsForClient(stats) });
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
    return { month, uploads: 0 };
  }
  return stats;
}

async function recordUpload(env) {
  const stats = await getStats(env);
  stats.uploads += 1;
  await env.BUCKET.put(STATS_KEY, JSON.stringify(stats));
  return stats;
}

function statsForClient(stats) {
  return {
    uploads: stats.uploads,
    percentUsed: (stats.uploads / FREE_UPLOADS_PER_MONTH) * 100,
    daysUntilReset: daysUntilReset(),
  };
}
