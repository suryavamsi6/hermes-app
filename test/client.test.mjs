import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
execSync("npx -y esbuild@0.24.0 src/hermes.ts --bundle --platform=node --format=esm --alias:expo/fetch=./test/fetch-shim.mjs --outfile=node_modules/.cache/hm-client/hermes.js --log-level=error");
const { HermesClient } = await import("../node_modules/.cache/hm-client/hermes.js");

async function headersFor(cfg) {
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, headers: init.headers }; return new Response("{}", { status: 200 }); };
  await new HermesClient(cfg).capabilities();
  return seen;
}

test("Funnel setup: no Cloudflare fields -> only the bearer key is sent", async () => {
  const { url, headers } = await headersFor({ baseUrl: "https://homelab.tail1234.ts.net/", apiKey: "k", cfClientId: "", cfClientSecret: "" });
  assert.strictEqual(url, "https://homelab.tail1234.ts.net/v1/capabilities");
  assert.strictEqual(headers.Authorization, "Bearer k");
  assert.ok(!("CF-Access-Client-Id" in headers) && !("CF-Access-Client-Secret" in headers));
});

test("half-filled Cloudflare fields are not sent", async () => {
  const { headers } = await headersFor({ baseUrl: "https://x", apiKey: "k", cfClientId: "id.access", cfClientSecret: "" });
  assert.ok(!("CF-Access-Client-Id" in headers));
});

test("Cloudflare Access setup: both service-token headers are sent", async () => {
  const { headers } = await headersFor({ baseUrl: "https://x", apiKey: "k", cfClientId: "id.access", cfClientSecret: "s" });
  assert.strictEqual(headers["CF-Access-Client-Id"], "id.access");
  assert.strictEqual(headers["CF-Access-Client-Secret"], "s");
});
