import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const dir = "scripts/bubble-b64";
const groups = {};
for (const n of readdirSync(dir).filter((n) => n.endsWith(".txt")).sort()) {
  const key = n.replace(/\.\d+\.txt$/, "");
  (groups[key] ??= []).push(n);
}
const want = {
  "src__chat-model.ts": "src/chat-model.ts",
  "src__ui__steps-row.tsx": "src/ui/steps-row.tsx",
  "app__bot__bits.tsx": "app/bot/bits.tsx",
  "test__sse.test.mjs": "test/sse.test.mjs",
};
if (Object.keys(groups).sort().join() !== Object.keys(want).sort().join()) throw new Error(`unexpected bubble parts: ${Object.keys(groups)}`);
for (const [key, dest] of Object.entries(want)) {
  const b64 = groups[key].map((n) => readFileSync(`${dir}/${n}`, "utf8").replace(/\s/g, "")).join("");
  writeFileSync(dest, Buffer.from(b64, "base64"));
}
