/**
 * Öffentliche Vorschau: liefert nur die statischen Dateien des Demo-Builds.
 * Es gibt keinen Server und keine Datenbank – jede /api-Anfrage endet mit 503.
 */
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "img-src 'self' data: blob: https://tile.openstreetmap.org",
    "connect-src 'self' https://tile.openstreetmap.org",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; "),
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function secured(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/") || pathname === "/health")
      return secured(
        Response.json(
          { message: "Öffentliche Demo ohne Server. Änderungen bleiben nur in diesem Browser." },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        ),
      );
    return secured(await env.ASSETS.fetch(request));
  },
};
