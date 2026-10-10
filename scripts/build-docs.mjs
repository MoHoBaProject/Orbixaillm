import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// هر فایل داخل knowledge/ یک سند است. خط‌های اول (به ترتیب دلخواه):
//   keywords: کلمه۱, کلمه۲, ...     ← کلمه‌هایی که اگه تو سوال باشن این سند پیدا می‌شه
//   type: steps | overview | answer  ← پیش‌فرض answer
//   title: عنوان                      ← برای type: steps
//   requires: تلگرام|telegram & بله|bale  ← سند فقط وقتی انتخاب می‌شه که از هر گروه (جدا شده با &) یکی از کلمه‌ها (جدا شده با |) تو سوال باشه
//   excludes: بله, bale               ← اگه یکی از این کلمه‌ها تو سوال بود، این سند انتخاب نمی‌شه
// بعدش متن سند. برای type: steps هر مرحله یک خطه:
//   1. 🤖 | عنوان مرحله | توضیح مرحله | app=telegram | input=botToken     (آیکون، app و input اختیاری‌اند)
const dir = "knowledge";
const META = /^(keywords|type|title|requires|excludes):\s*(.*)$/i;

function parseSteps(body) {
  return body
    .split("\n")
    .map((l) => l.match(/^\s*\d+[.)\-]\s*(.+)$/))
    .filter(Boolean)
    .map((m) => {
      let parts = m[1].split("|").map((s) => s.trim());
      const opts = {};
      // گزینه‌های آخر خط: input=... و app=...
      while (parts.length > 1 && /^(input|app)\s*=/i.test(parts[parts.length - 1])) {
        const o = parts.pop().match(/^(input|app)\s*=\s*(.*)$/i);
        opts[o[1].toLowerCase()] = o[2].trim();
      }
      const [icon, title, text] = parts.length >= 3 ? parts : ["", parts[0] || "", parts[1] || ""];
      return { icon, title, text, ...opts };
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
  const type = ["steps", "overview"].includes(meta.type) ? meta.type : "answer";
  return {
    id: f,
    type,
    title: meta.title || "",
    keywords: (meta.keywords || "").split(/[,،]/).map((s) => s.trim()).filter(Boolean),
    requires: (meta.requires || "").split("&").map((g) => g.split("|").map((s) => s.trim()).filter(Boolean)).filter((g) => g.length),
    excludes: (meta.excludes || "").split(/[,،]/).map((s) => s.trim()).filter(Boolean),
    text,
    steps: type === "steps" ? parseSteps(text) : [],
  };
});

const version = crypto.createHash("md5").update(JSON.stringify(docs)).digest("hex").slice(0, 8);
fs.writeFileSync(
  "app/knowledge.generated.ts",
  `export type Step = { icon: string; title: string; text: string; input?: string; app?: string };\n` +
    `export const VERSION = "${version}";\n` +
    `export const DOCS: { id: string; type: string; title: string; keywords: string[]; requires: string[][]; excludes: string[]; text: string; steps: Step[] }[] = ${JSON.stringify(docs, null, 1)};\n`
);
console.log(docs.length + " docs built");
