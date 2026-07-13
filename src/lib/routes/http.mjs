import { RouteDiscoveryError, asRouteDiscoveryError } from "./errors.mjs";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

async function readInput(request) {
  try {
    return await request.json();
  } catch {
    throw new RouteDiscoveryError("INVALID_JSON", "Request body must be valid JSON.", { status: 400 });
  }
}

export function createRouteDiscoveryHandler({ discovery } = {}) {
  if (!discovery || typeof discovery.discover !== "function") {
    throw new RouteDiscoveryError("INVALID_DISCOVERY_SERVICE", "A route discovery service is required.");
  }

  return async function routeDiscoveryHandler(request, context = {}) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } }, 405, { allow: "POST, OPTIONS" });
    }

    try {
      return json(await discovery.discover(await readInput(request), {
        requestId: context.requestId,
        waitUntil: typeof context.waitUntil === "function" ? context.waitUntil.bind(context) : null,
        abortSignal: request.signal || null,
      }));
    } catch (error) {
      const routeError = asRouteDiscoveryError(error);
      const payload = { code: routeError.code, message: routeError.message };
      if (routeError.details !== undefined) payload.details = routeError.details;
      return json({ ok: false, error: payload, requestId: context.requestId || null }, routeError.status);
    }
  };
}
