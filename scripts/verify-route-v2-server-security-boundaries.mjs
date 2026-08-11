import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  RequestBodyTooLargeError,
  downloadTrustedImage,
  readRequestBody,
  safeStaticPath,
  validateTrustedImageUrl,
} = require(path.join(projectRoot, "server-security.js"));

const publicLookup = async () => [{ address: "8.8.8.8", family: 4 }];

assert.equal(safeStaticPath(projectRoot, "/travel-collection/index.html"), path.join(projectRoot, "index.html"));
assert.equal(safeStaticPath(projectRoot, "/../travel-collection-secret/secret.txt"), "");
assert.equal(safeStaticPath(projectRoot, "/%2e%2e/travel-collection-secret/secret.txt"), "");
assert.equal(safeStaticPath(projectRoot, "/%2e%2e%5ctravel-collection-secret%5csecret.txt"), "");
assert.equal(safeStaticPath(projectRoot, "/..%5ctravel-collection-secret%5csecret.txt"), "");
assert.equal(safeStaticPath(projectRoot, "/../travel-collection-sibling/index.html"), "");
assert.equal(safeStaticPath(projectRoot, "/%00index.html"), "");

const exactBody = await readRequestBody(Readable.from([Buffer.alloc(8)]), { maxBytes: 8 });
assert.equal(exactBody.length, 8);
await assert.rejects(
  readRequestBody(Readable.from([Buffer.alloc(5), Buffer.alloc(4)]), { maxBytes: 8 }),
  (error) => error instanceof RequestBodyTooLargeError && error.statusCode === 413,
);
const declaredOversize = Readable.from([]);
declaredOversize.headers = { "content-length": "9" };
await assert.rejects(
  readRequestBody(declaredOversize, { maxBytes: 8 }),
  (error) => error?.code === "request_body_too_large",
);

await assert.rejects(validateTrustedImageUrl("http://upload.wikimedia.org/a.jpg", { lookup: publicLookup }), /image_https_required/u);
await assert.rejects(validateTrustedImageUrl("https://localhost/a.jpg", { lookup: publicLookup }), /image_host_not_allowed/u);
await assert.rejects(validateTrustedImageUrl("https://127.0.0.1/a.jpg", { lookup: publicLookup }), /image_host_not_allowed/u);
await assert.rejects(validateTrustedImageUrl("https://example.com/a.jpg", { lookup: publicLookup }), /image_host_not_allowed/u);
await assert.rejects(validateTrustedImageUrl("https://user:pass@upload.wikimedia.org/a.jpg", { lookup: publicLookup }), /image_credentials_not_allowed/u);
await assert.rejects(validateTrustedImageUrl("https://upload.wikimedia.org:444/a.jpg", { lookup: publicLookup }), /image_port_not_allowed/u);
await assert.rejects(
  validateTrustedImageUrl("https://upload.wikimedia.org/a.jpg", {
    lookup: async () => [{ address: "169.254.169.254", family: 4 }],
  }),
  /image_private_address_blocked/u,
);
for (const address of ["127.0.0.1", "172.16.0.1", "192.168.1.1", "::ffff:7f00:1"]) {
  await assert.rejects(
    validateTrustedImageUrl("https://upload.wikimedia.org/a.jpg", {
      lookup: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
    }),
    /image_private_address_blocked/u,
    `${address} must remain blocked after allowlisted-host DNS resolution`,
  );
}
await assert.rejects(
  validateTrustedImageUrl("https://upload.wikimedia.org/a.jpg", {
    lookup: async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "192.168.1.1", family: 4 },
    ],
  }),
  /image_private_address_blocked/u,
  "a mixed public/private DNS response must fail closed",
);
await assert.rejects(
  validateTrustedImageUrl("https://upload.wikimedia.org/a.jpg", {
    lookup: async () => [{ address: "10.1.2.3", family: 4 }],
  }),
  /image_private_address_blocked/u,
);
await assert.rejects(
  validateTrustedImageUrl("https://upload.wikimedia.org/a.jpg", {
    lookup: async () => [{ address: "::1", family: 6 }],
  }),
  /image_private_address_blocked/u,
);
const allowed = await validateTrustedImageUrl("https://upload.wikimedia.org/a.jpg", { lookup: publicLookup });
assert.equal(allowed.url.hostname, "upload.wikimedia.org");

const redirectCalls = [];
await assert.rejects(
  downloadTrustedImage("https://upload.wikimedia.org/a.jpg", {
    lookup: async (hostname) => hostname === "upload.wikimedia.org"
      ? [{ address: "8.8.8.8", family: 4 }]
      : [{ address: "127.0.0.1", family: 4 }],
    requestHop: async ({ url }) => {
      redirectCalls.push(url.href);
      return { statusCode: 302, headers: { location: "https://localhost/private.jpg" }, body: Buffer.alloc(0) };
    },
  }),
  /image_host_not_allowed/u,
);
assert.equal(redirectCalls.length, 1);

let rebindingLookupCount = 0;
await assert.rejects(
  downloadTrustedImage("https://upload.wikimedia.org/a.jpg", {
    lookup: async () => {
      rebindingLookupCount += 1;
      return [{ address: rebindingLookupCount === 1 ? "8.8.8.8" : "192.168.1.1", family: 4 }];
    },
    requestHop: async () => ({
      statusCode: 302,
      headers: { location: "https://upload.wikimedia.org/rebound.jpg" },
      body: Buffer.alloc(0),
    }),
  }),
  /image_private_address_blocked/u,
);
assert.equal(rebindingLookupCount, 2, "every redirect hop must repeat DNS validation");

await assert.rejects(
  downloadTrustedImage("https://upload.wikimedia.org/a.jpg", {
    lookup: publicLookup,
    maxRedirects: 1,
    requestHop: async ({ url }) => ({ statusCode: 302, headers: { location: url.href }, body: Buffer.alloc(0) }),
  }),
  /image_redirect_limit/u,
);

await assert.rejects(
  downloadTrustedImage("https://upload.wikimedia.org/a.jpg", {
    lookup: publicLookup,
    maxBytes: 4,
    requestHop: async () => ({
      statusCode: 200,
      headers: { "content-type": "image/jpeg", "content-length": "5" },
      body: Buffer.alloc(5),
    }),
  }),
  /image_too_large/u,
);

await assert.rejects(
  downloadTrustedImage("https://upload.wikimedia.org/a.jpg", {
    lookup: publicLookup,
    maxBytes: 4,
    requestHop: async () => ({
      statusCode: 200,
      headers: { "content-type": "image/jpeg" },
      body: Readable.from([Buffer.alloc(3), Buffer.alloc(2)]),
    }),
  }),
  /image_too_large/u,
  "streamed bodies without Content-Length must remain byte bounded",
);

await assert.rejects(
  downloadTrustedImage("https://upload.wikimedia.org/a.jpg", {
    lookup: publicLookup,
    requestHop: async () => ({
      statusCode: 200,
      headers: { "content-type": "text/html" },
      body: Buffer.from("not an image"),
    }),
  }),
  /image_content_type_not_allowed/u,
);

const image = await downloadTrustedImage("https://upload.wikimedia.org/a.jpg", {
  lookup: publicLookup,
  requestHop: async ({ address }) => {
    assert.equal(address.address, "8.8.8.8", "the validated address must be pinned for the request hop");
    return {
      statusCode: 200,
      headers: { "content-type": "image/jpeg", "content-length": "4" },
      body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    };
  },
});
assert.equal(image.body.length, 4);
assert.equal(image.contentType, "image/jpeg");

process.stdout.write(`${JSON.stringify({
  verifier: "route-v2-server-security-boundaries",
  status: "PASS",
  staticTraversalMutationsKilled: 6,
  requestBodyMutationsKilled: 2,
  ssrfMutationsKilled: 18,
  validImageAccepted: true,
  realNetworkRequests: 0,
}, null, 2)}\n`);
