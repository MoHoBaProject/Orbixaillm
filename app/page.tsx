"use client";
import { useState } from "react";

type Msg = { role: "user" | "bot"; text: string };

// بلوک کد (همیشه چپ‌به‌راست) با دکمه‌ی کپی
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }
  return (
    <div className="code">
      <div className="codeHead">
        <span>{lang || "code"}</span>
        <button onClick={copy}>{copied ? "کپی شد" : "کپی"}</button>
      </div>
      <pre dir="ltr"><code>{code}</code></pre>
    </div>
  );
}

// متن معمولی: جهت هر پاراگراف خودکار، و `کد داخل خط` چپ‌به‌راست
function Text({ text }: { text: string }) {
  return (
    <div dir="auto" className="txt">
      {text.split(/(`[^`\n]+`)/).map((p, i) =>
        p.length > 2 && p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="ic">{p.slice(1, -1)}</code>
        ) : (
          p
        )
      )}
    </div>
  );
}

// متن و بلوک‌های ```کد``` رو از هم جدا می‌کنه
function Body({ text }: { text: string }) {
  const parts = text.split("```");
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 1) {
          const m = p.match(/^([\w+#-]*)\n([\s\S]*)$/);
          const lang = m ? m[1] : "";
          const code = (m ? m[2] : p).replace(/\n$/, "");
          return <CodeBlock key={i} lang={lang} code={code} />;
        }
        const t = p.replace(/^\n+|\n+$/g, "");
        return t ? <Text key={i} text={t} /> : null;
      })}
    </>
  );
}

export default function Home() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setMsgs((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      setMsgs((m) => [...m, { role: "bot", text: data.reply || data.error || "خطا" }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "اتصال برقرار نشد. دوباره تلاش کن." }]);
    }
    setLoading(false);
  }

  return (
    <main className="wrap">
      <h1>دستیار هوشمند</h1>
      <div className="msgs">
        {msgs.length === 0 && <div className="msg bot">سلام! سوالت رو بپرس.</div>}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <Body text={m.text} />
          </div>
        ))}
        {loading && <div className="msg bot">در حال نوشتن…</div>}
      </div>
      <div className="row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="پیامت رو بنویس"
        />
        <button onClick={send} disabled={loading}>ارسال</button>
      </div>
    </main>
  );
}
