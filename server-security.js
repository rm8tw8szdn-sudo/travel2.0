const dns = require("node:dns");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");

const DEFAULT_REQUEST_BODY_MAX_BYTES = 1024 * 1024;
const DEFAULT_IMAGE_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_IMAGE_TIMEOUT_MS = 12_000;
const DEFAULT_IMAGE_REDIRECTS = 3;
const TRUSTED_IMAGE_HOSTS = new Set([
  "commons.wikimedia.org",
  "images.unsplash.com",
  "plus.unsplash.com",
  "upload.wikimedia.org",
]);
const ALLOWED_RASTER_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const blockedAddresses = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) blockedAddresses.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) blockedAddresses.addSubnet(network, prefix, "ipv6");

class ServerBoundaryError extends Error {
  constructor(code, statusCode = 400) {
    super(code);
    this.name = "ServerBoundaryError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

class RequestBodyTooLargeError extends ServerBoundaryError {
  constructor() {
    super("request_body_too_large", 413);
    this.name = "RequestBodyTooLargeError";
  }
}

function safeStaticPath(root, urlPath) {
  const base = path.resolve(String(root || ""));
  let pathname;
  try {
    pathname = decodeURIComponent(String(urlPath || "/").split("?")[0] || "/");
  } catch {
    return "";
  }
  if (pathname.includes("\0")) return "";
  if (pathname === "/" || pathname === "/travel-collection") pathname = "/travel-collection/";
  if (pathname === "/travel-collection/") pathname = "/travel-collection/index.html";
  if (pathname.startsWith("/travel-collection/")) pathname = pathname.slice("/travel-collection".length);
  const resolved = path.resolve(base, `.${pathname}`);
  const relative = path.relative(base, resolved);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return "";
  return resolved;
}

async function readRequestBody(request, { maxBytes = DEFAULT_REQUEST_BODY_MAX_BYTES } = {}) {
  const limit = Number(maxBytes);
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new TypeError("request_body_limit_invalid");
  const declaredLength = Number(request?.headers?.["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new RequestBodyTooLargeError();
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > limit) throw new RequestBodyTooLargeError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, totalBytes);
}

function parseTrustedImageUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch {
    throw new ServerBoundaryError("image_url_invalid", 400);
  }
  if (url.protocol !== "https:") throw new ServerBoundaryError("image_https_required", 400);
  if (url.username || url.password) throw new ServerBoundaryError("image_credentials_not_allowed", 400);
  if (url.port && url.port !== "443") throw new ServerBoundaryError("image_port_not_allowed", 400);
  const hostname = url.hostname.toLowerCase();
  if (!TRUSTED_IMAGE_HOSTS.has(hostname)) throw new ServerBoundaryError("image_host_not_allowed", 400);
  return url;
}

function isBlockedIpAddress(address) {
  const normalized = String(address || "").trim().toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/u)?.[1];
  if (mappedIpv4) return net.isIP(mappedIpv4) !== 4 || blockedAddresses.check(mappedIpv4, "ipv4");
  const family = net.isIP(normalized);
  if (family === 4) return blockedAddresses.check(normalized, "ipv4");
  if (family === 6) return blockedAddresses.check(normalized, "ipv6");
  return true;
}

async function validateTrustedImageUrl(rawUrl, { lookup = dns.promises.lookup } = {}) {
  const url = parseTrustedImageUrl(rawUrl);
  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new ServerBoundaryError("image_dns_resolution_failed", 502);
  }
  const normalizedAddresses = (Array.isArray(addresses) ? addresses : [addresses])
    .map((entry) => ({ address: String(entry?.address || ""), family: Number(entry?.family || net.isIP(entry?.address)) }))
    .filter((entry) => entry.address && (entry.family === 4 || entry.family === 6));
  if (!normalizedAddresses.length) throw new ServerBoundaryError("image_dns_resolution_failed", 502);
  if (normalizedAddresses.some((entry) => isBlockedIpAddress(entry.address))) {
    throw new ServerBoundaryError("image_private_address_blocked", 400);
  }
  return { url, addresses: normalizedAddresses };
}

function headerValue(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "");
}

function rasterContentType(headers) {
  const contentType = headerValue(headers, "content-type").split(";", 1)[0].trim().toLowerCase();
  if (!ALLOWED_RASTER_IMAGE_TYPES.has(contentType)) {
    throw new ServerBoundaryError("image_content_type_not_allowed", 502);
  }
  return contentType;
}

async function bufferResponseBody(body, maxBytes) {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    const buffer = Buffer.from(body);
    if (!buffer.length) throw new ServerBoundaryError("image_empty_body", 502);
    if (buffer.length > maxBytes) throw new ServerBoundaryError("image_too_large", 413);
    return buffer;
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of body || []) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) throw new ServerBoundaryError("image_too_large", 413);
    chunks.push(buffer);
  }
  if (!totalBytes) throw new ServerBoundaryError("image_empty_body", 502);
  return Buffer.concat(chunks, totalBytes);
}

function defaultRequestHop({ url, address, signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "GET",
      headers: {
        accept: "image/avif,image/webp,image/apng,image/png,image/jpeg,image/gif",
        "user-agent": "TravelCollectionRouteImageProxy/2.0",
        referer: "https://commons.wikimedia.org/",
      },
      lookup(_hostname, options, callback) {
        const answer = { address: address.address, family: address.family };
        if (options?.all) callback(null, [answer]);
        else callback(null, answer.address, answer.family);
      },
      servername: url.hostname,
      signal,
    }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      if (statusCode >= 300 && statusCode < 400) {
        response.resume();
        resolve({ statusCode, headers: response.headers, body: Buffer.alloc(0) });
        return;
      }
      resolve({ statusCode, headers: response.headers, body: response });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new ServerBoundaryError("image_timeout", 502)));
    request.on("error", (error) => reject(error instanceof ServerBoundaryError
      ? error
      : new ServerBoundaryError("image_upstream_unavailable", 502)));
    request.end();
  });
}

async function downloadTrustedImage(rawUrl, {
  lookup = dns.promises.lookup,
  requestHop = defaultRequestHop,
  maxBytes = DEFAULT_IMAGE_MAX_BYTES,
  timeoutMs = DEFAULT_IMAGE_TIMEOUT_MS,
  maxRedirects = DEFAULT_IMAGE_REDIRECTS,
  signal,
} = {}) {
  let currentUrl = rawUrl;
  for (let redirects = 0; ; redirects += 1) {
    const validated = await validateTrustedImageUrl(currentUrl, { lookup });
    const upstream = await requestHop({
      url: validated.url,
      address: validated.addresses[0],
      signal,
      timeoutMs,
      maxBytes,
    });
    const statusCode = Number(upstream?.statusCode || 0);
    if (statusCode >= 300 && statusCode < 400) {
      if (redirects >= maxRedirects) throw new ServerBoundaryError("image_redirect_limit", 502);
      const location = headerValue(upstream.headers, "location");
      if (!location) throw new ServerBoundaryError("image_redirect_invalid", 502);
      currentUrl = new URL(location, validated.url).href;
      continue;
    }
    if (statusCode < 200 || statusCode >= 300) throw new ServerBoundaryError("image_upstream_unavailable", 502);
    const contentType = rasterContentType(upstream.headers);
    const contentLength = Number(headerValue(upstream.headers, "content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new ServerBoundaryError("image_too_large", 413);
    }
    const body = await bufferResponseBody(upstream.body, maxBytes);
    return { body, contentType, finalUrl: validated.url.href };
  }
}

module.exports = Object.freeze({
  ALLOWED_RASTER_IMAGE_TYPES,
  DEFAULT_IMAGE_MAX_BYTES,
  DEFAULT_REQUEST_BODY_MAX_BYTES,
  RequestBodyTooLargeError,
  ServerBoundaryError,
  TRUSTED_IMAGE_HOSTS,
  downloadTrustedImage,
  isBlockedIpAddress,
  parseTrustedImageUrl,
  readRequestBody,
  safeStaticPath,
  validateTrustedImageUrl,
});
