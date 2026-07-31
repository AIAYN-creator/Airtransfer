export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/upload') {
      return handleUpload(request, env);
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

  await env.BUCKET.put(id, request.body, {
    customMetadata: { uploadedAt: Date.now().toString() },
  });

  return Response.json({ id });
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
