import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const dir = "test/slash-b64";
const parts = readdirSync(dir).filter((n) => n.endsWith(".txt")).sort();
if (parts.length !== 19) throw new Error(`expected 19 slash payload parts, got ${parts.length}`);
const b64 = parts.map((n) => readFileSync(`${dir}/${n}`, "utf8").replace(/\s/g, "")).join("");
writeFileSync("test/slash.test.mjs", Buffer.from(b64, "base64"));
