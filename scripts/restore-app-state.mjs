import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const dir = "scripts/app-state-b64";
const parts = readdirSync(dir).filter((n) => n.endsWith(".txt")).sort();
if (parts.length !== 6) throw new Error(`expected 6 app-state parts, got ${parts.length}`);
const b64 = parts.map((n) => readFileSync(`${dir}/${n}`, "utf8").replace(/\s/g, "")).join("");
writeFileSync("src/app-state.tsx", Buffer.from(b64, "base64"));
