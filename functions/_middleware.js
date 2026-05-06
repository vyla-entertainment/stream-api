export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  if (url.pathname === '/') {
    const indexModule = await import('./index.js');
    return indexModule.onRequest(context);
  }
  
  if (url.pathname.startsWith('/api')) {
    const apiModule = await import('./api/[[route]].js');
    return apiModule.onRequest(context);
  }
  
  return new Response('Not found', { status: 404 });
}
