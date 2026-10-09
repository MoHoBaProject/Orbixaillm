import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const dir = "knowledge";
const docs = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => {
  const raw = fs.readFileSync(path.join(dir, f), "utf8").replace(/\r/g, "").trim();
  const m = raw.match(/^keywords:\s*(.+)\n+([\s\S]*)$/);
  return {
    id: f,
    keywords: m ? m[1].split(/[,،]/).map((s) => s.trim()).filter(Boolean) : [],
    text: (m ? m[2] : raw).trim(),
  };
});
const version = crypto.createHash("md5").update(JSON.stringify(docs)).digest("hex").slice(0, 8);
fs.writeFileSync(
  "app/knowledge.generated.ts",
  `export const VERSION = "${version}";\nexport const DOCS: { id: string; keywords: string[]; text: string }[] = ${JSON.stringify(docs, null, 1)};\n`
);
console.log(docs.length + " docs built");
