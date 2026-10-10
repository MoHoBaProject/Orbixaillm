import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// هر فایل داخل knowledge/ یک سند است. خط‌های اول (به ترتیب دلخواه):
//   type: app | overview | answer    ← app = آموزش وصل کردن یک اپ | پیش‌فرض answer
//   title: تلگرام                    ← اسم اپ (فقط برای type: app)
//   keywords: کلمه۱, کلمه۲, ...
// platform = اسم فایل (Telegram.md → telegram)
// برای type: app هر مرحله یک خطه:
//   1. 🤖 | عنوان | توضیح | input=botToken | textbox=true | end=false
const dir = "knowledge";
const META = /^(keywords|type|title|app):\s*(.*)$/i;
const OPT = /^(input|textbox|end)\s*=\s*(.*)$/i;

function parseSteps(body, platform) {
  return body
    .split("\n")
    .map((l) => l.match(/^\s*\d+[.)\-]\s*(.+)$/))
    .filter(Boolean)
    .map((m) => {
      const parts = m[1].split("|").map((s) => s.trim());
      const opt = {};
      while (parts.length > 1 && OPT.test(parts[parts.length - 1])) {
        const k = parts.pop().match(OPT);
        opt[k[1].toLowerCase()] = k[2].trim();
      }
      const [icon, title, description] =
        parts.length >= 3 ? parts : ["", parts[0] || "", parts[1] || ""];
      return {
        icon,
        platform,
        title,
        description,
        input: opt.input || "",
        textbox: opt.textbox === "true",
        end: opt.end === "true",
      };
    });
}

const docs = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => {
  const lines = fs.readFileSync(path.join(dir, f), "utf8").replace(/\r/g, "").trim().split("\n");
  const meta = {};
  let i = 0;
  while (i < lines.length && META.test(lines[i])) {
    const m = lines[i].match(META);
    meta[m[1].toLowerCase()] = m[2].trim();
    i++;
  }
  const text = lines.slice(i).join("\n").replace(/^-{3,}\s*\n?/, "").trim();
  const type = ["app", "overview"].includes(meta.type) ? meta.type : "answer";
  const platform = type === "app" ? f.replace(/\.md$/, "").toLowerCase() : "";
  return {
    id: f,
    type,
    app: platform,
    title: meta.title || platform,
    keywords: (meta.keywords || "").split(/[,،]/).map((s) => s.trim()).filter(Boolean),
    text,
    steps: type === "app" ? parseSteps(text, platform) : [],
  };
});

const version = crypto.createHash("md5").update(JSON.stringify(docs)).digest("hex").slice(0, 8);
fs.writeFileSync(
  "app/knowledge.generated.ts",
  `export type Step = { icon: string; platform: string; title: string; description: string; input: string; textbox: boolean; end: boolean };\n` +
    `export const VERSION = "${version}";\n` +
    `export const DOCS: { id: string; type: string; app: string; title: string; keywords: string[]; text: string; steps: Step[] }[] = ${JSON.stringify(docs, null, 1)};\n`
);
console.log(docs.length + " docs built");
