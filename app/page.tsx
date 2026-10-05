"use client";
import { useState } from "react";

type Msg = { role: "user" | "bot"; text: string };

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
      setMsgs((m) => [...m, { role: "bot", text: data.reply ?? data.error ?? "خطا" }]);
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
          <div key={i} className={`msg ${m.role}`}>{m.text}</div>
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
