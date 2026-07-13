export class RouteDiscoveryError extends Error {
  constructor(code, message, { status = 500, details } = {}) {
    super(message);
    this.name = "RouteDiscoveryError";
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

export function asRouteDiscoveryError(error) {
  if (error instanceof RouteDiscoveryError) return error;
  return new RouteDiscoveryError("DISCOVERY_FAILED", "Route discovery failed.", {
    status: 502,
    details: error instanceof Error ? error.message : String(error),
  });
}
