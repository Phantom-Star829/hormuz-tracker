"use client";
import { useRef, useState, useEffect } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Why are transits down?",
  "Which carriers are still moving?",
  "What does Brent at $88 tell me?",
  "How many tankers vs cargo on the map?",
];

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  async function send(text: string) {
    const clean = text.trim();
    if (!clean || streaming) return;
    const next: Msg[] = [...messages, { role: "user", content: clean }];
    setMessages(next);
    setInput("");
    setStreaming(true);

    const placeholder: Msg = { role: "assistant", content: "" };
    setMessages([...next, placeholder]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        setMessages([...next, { role: "assistant", content: `Error: ${res.status}` }]);
        setStreaming(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
      }
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="panel p-5 flex flex-col h-[520px]">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold">Ask the Dashboard</h2>
        <span className="text-xs text-muted">Claude Sonnet 4.5 · cached context</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3">
        {messages.length === 0 ? (
          <div className="text-sm text-muted py-6">
            <div className="mb-3">Ask anything about the current state of the Strait. Examples:</div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-[11px] px-2.5 py-1.5 rounded-md bg-border/60 hover:bg-border text-left border border-border/60 hover:border-border transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "ml-8 bg-accent/10 border border-accent/30 rounded-lg px-3 py-2"
                  : "mr-8 bg-border/30 border border-border rounded-lg px-3 py-2"
              }`}
            >
              {m.role === "assistant" && !m.content && streaming ? (
                <span className="inline-flex items-center gap-1 text-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse [animation-delay:300ms]" />
                </span>
              ) : (
                m.content
              )}
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          placeholder="Ask about transits, carriers, positions, oil..."
          className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="px-4 py-2 bg-accent text-bg font-medium text-sm rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/90 transition"
        >
          {streaming ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
