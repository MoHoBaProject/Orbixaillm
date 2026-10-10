import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// هر فایل داخل knowledge/ یک سند است. خط‌های اول (به ترتیب دلخواه):
//   type: app | overview | answer    ← app = آموزش وصل کردن یک اپ (تلگرام، بله، ...) | پیش‌فرض answer
//   app: telegram                    ← شناسه‌ی اپ (فقط برای type: app)
//   title: تلگرام                    ← اسم اپ (فقط برای type: app)
//   keywords: کلمه۱, کلمه۲, ...      ← کلمه‌هایی که اگه تو سوال باشن این سند پیدا می‌شه
// بعدش متن سند. برای type: app هر مرحله یک خطه:
//   1. 🤖 | عنوان مرحله | توضیح مرحله | input=botToken      (آیکون و input اختیاری‌اند)
const dir = "knowledge";
const META = /^(keywords|type|title|app):\s*(.*)$/i;

function parseSteps(body, appId) {
  return body
    .split("\n")
    .map((l) => l.match(/^\s*\d+[.)\-]\s*(.+)$/))
    .filter(Boolean)
    .map((m) => {
      let parts = m[1].split("|").map((s) => s.trim());
      let input;
      const last = parts[parts.length - 1] || "";
      if (parts.length > 1 && /^input\s*=/i.test(last)) {
        input = last.replace(/^input\s*=\s*/i, "");
        parts = parts.slice(0, -1);
      }
      const [icon, title, text] = parts.length >= 3 ? parts : ["", parts[0] || "", parts[1] || ""];
      return { icon, title, text, app: appId, ...(input ? { input } : {}) };
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
  const appId = type === "app" ? meta.app || f.replace(/\.md$/, "") : "";
  return {
    id: f,
    type,
    app: appId,
    title: meta.title || appId,
    keywords: (meta.keywords || "").split(/[,،]/).map((s) => s.trim()).filter(Boolean),
    text,
    steps: type === "app" ? parseSteps(text, appId) : [],
  };
});

const version = crypto.createHash("md5").update(JSON.stringify(docs)).digest("hex").slice(0, 8);
fs.writeFileSync(
  "app/knowledge.generated.ts",
  `export type Step = { icon: string; title: string; text: string; app: string; input?: string };\n` +
    `export const VERSION = "${version}";\n` +
    `export const DOCS: { id: string; type: string; app: string; title: string; keywords: string[]; text: string; steps: Step[] }[] = ${JSON.stringify(docs, null, 1)};\n`
);
console.log(docs.length + " docs built");
