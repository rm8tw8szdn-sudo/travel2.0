import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Readable } from "node:stream";
import security from "../server-security.js";

const lookup = async () => [{ address: "8.8.8.8", family: 4 }];
const url = "https://upload.wikimedia.org/test.jpg";

test("public static paths expose only application assets", () => {
  const root = path.resolve("C:/audit/travel");
  assert.equal(security.resolvePublicStaticPath(root, "/travel-collection/mobile.html"), path.join(root, "mobile.html"));
  assert.equal(security.resolvePublicStaticPath(root, "/travel-collection/assets/icon.svg"), path.join(root, "assets", "icon.svg"));
  assert.equal(security.resolvePublicStaticPath(root, "/travel-collection/data/countries.zh.json"), path.join(root, "data", "countries.zh.json"));
  assert.equal(security.resolvePublicStaticPath(root, "/travel-collection/vendor/d3.min.js"), path.join(root, "vendor", "d3.min.js"));
  for (const internal of [
    "/travel-collection/.git/HEAD",
    "/travel-collection/.cache/runtime.json",
    "/travel-collection/.env",
    "/travel-collection/server.js",
    "/travel-collection/server-security.js",
    "/travel-collection/package.json",
    "/travel-collection/tests/server-security.test.mjs",
    "/travel-collection/scripts/verify.mjs",
    "/travel-collection/src/lib/routes/index.mjs",
    "/travel-collection/docs/report.md",
    "/travel-collection/%2egit/HEAD",
  ]) assert.equal(security.resolvePublicStaticPath(root, internal), "", internal);
});

for (const [name, statusCode, headers, error] of [
  ["HTTP failure", 503, {}, /image_upstream_unavailable/],
  ["invalid MIME", 200, { "content-type": "text/html" }, /image_content_type_not_allowed/],
  ["declared oversize", 200, { "content-type": "image/jpeg", "content-length": "9" }, /image_too_large/],
  ["missing redirect", 302, {}, /image_redirect_invalid/],
  ["invalid redirect", 302, { location: "https://[" }, /Invalid URL/],
]) {
  test(`${name} closes an unconsumed upstream response`, async () => {
    const body = new Readable({ read() {} });
    await assert.rejects(security.downloadTrustedImage(url, {
      lookup, maxBytes: 8,
      requestHop: async () => ({ statusCode, headers, body }),
    }), error);
    assert.equal(body.destroyed, true);
  });
}

test("redirect responses close before following the next hop", async () => {
  const redirected = new Readable({ read() {} });
  let calls = 0;
  const result = await security.downloadTrustedImage(url, {
    lookup,
    requestHop: async () => {
      if (++calls === 1) return { statusCode: 302, headers: { location: "/next.jpg" }, body: redirected };
      assert.equal(redirected.destroyed, true);
      return { statusCode: 200, headers: { "content-type": "image/jpeg" }, body: Buffer.from("image") };
    },
  });
  assert.equal(result.body.toString(), "image");
  assert.equal(result.finalUrl, "https://upload.wikimedia.org/next.jpg");
});

test("streamed limits count UTF-8 bytes and close on overflow", async () => {
  const body = Readable.from(["旅", "行"]);
  await assert.rejects(security.downloadTrustedImage(url, {
    lookup, maxBytes: 5,
    requestHop: async () => ({ statusCode: 200, headers: { "content-type": "image/jpeg" }, body }),
  }), /image_too_large/);
  assert.equal(body.destroyed, true);
  await assert.rejects(security.readRequestBody(Readable.from(["旅", "行"]), { maxBytes: 5 }), /request_body_too_large/);
  assert.equal((await security.readRequestBody(Readable.from(["旅", "行"]), { maxBytes: 6 })).length, 6);
});

test("image and request empty-body policies remain distinct", async () => {
  assert.equal((await security.readRequestBody(Readable.from([]))).length, 0);
  await assert.rejects(security.downloadTrustedImage(url, {
    lookup,
    requestHop: async () => ({ statusCode: 200, headers: { "content-type": "image/jpeg" }, body: Readable.from([]) }),
  }), /image_empty_body/);
});
