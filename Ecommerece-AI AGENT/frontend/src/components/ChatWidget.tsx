import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2, Wrench } from "lucide-react";
import { api, ApiError } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { useCart } from "../hooks/useCart";
import { useNavigate } from "react-router-dom";

interface ChatTurn {
  role: "user" | "assistant" | "error";
  content: string;
  toolCalls?: string[];
}

function sessionId(): string {
  const key = "chat_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

const SUGGESTIONS = [
  "I need a laptop under Rs. 150,000",
  "Compare iPhone 15 and Pixel 9",
  "Show me waterproof smartwatches",
  "Do you have any active coupons?",
];

export default function ChatWidget() {
  const { user } = useAuth();
  const { refresh: refreshCart } = useCart();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, sending]);

  async function send(message: string) {
    if (!message.trim() || sending) return;
    if (!user) {
      setOpen(false);
      navigate("/login");
      return;
    }

    setTurns((t) => [...t, { role: "user", content: message }]);
    setInput("");
    setSending(true);

    try {
      const res = await api.chat.send(sessionId(), message);
      setTurns((t) => [...t, { role: "assistant", content: res.reply, toolCalls: res.tool_calls }]);
      // Tool calls that touch cart/orders may have changed shared state - refresh it.
      if (res.tool_calls.some((c) => ["add_to_cart", "remove_from_cart", "cancel_order"].includes(c))) {
        refreshCart();
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong reaching the assistant.";
      setTurns((t) => [...t, { role: "error", content: msg }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ink-950 px-5 py-3.5 text-white shadow-lg transition hover:bg-signal-600 hover:shadow-xl"
        >
          <Sparkles size={18} />
          <span className="text-sm font-semibold">Ask Aria</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-5 right-5 z-40 flex h-[600px] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-ink-900/10 bg-white shadow-2xl animate-fade-in-up">
          <div className="flex items-center justify-between bg-ink-950 px-4 py-3.5 text-white">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-signal-500">
                <Sparkles size={14} />
              </span>
              <div>
                <p className="font-display text-sm font-semibold leading-tight">Aria</p>
                <p className="text-[11px] leading-tight text-white/60">AI shopping assistant</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-full p-1.5 hover:bg-white/10">
              <X size={16} />
            </button>
          </div>

          <div ref={scrollRef} className="slim-scroll flex-1 space-y-3 overflow-y-auto bg-paper px-4 py-4">
            {turns.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-ink-700/70">
                  Hi{user ? ` ${user.full_name.split(" ")[0]}` : ""} — I can help you find products, compare
                  options, manage your cart, or track an order. What are you looking for?
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-ink-900/10 bg-white px-2.5 py-1.5 text-left text-xs text-ink-700 transition hover:border-signal-500 hover:text-signal-600"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    t.role === "user"
                      ? "bg-ink-950 text-white"
                      : t.role === "error"
                        ? "bg-red-50 text-red-700"
                        : "border border-ink-900/5 bg-white text-ink-950 shadow-sm"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{t.content}</p>
                  {t.toolCalls && t.toolCalls.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1 border-t border-ink-900/5 pt-1.5">
                      {t.toolCalls.map((tc, j) => (
                        <span
                          key={j}
                          className="flex items-center gap-1 rounded-full bg-ink-900/5 px-2 py-0.5 text-[10px] text-ink-700/60"
                        >
                          <Wrench size={9} />
                          {tc.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl border border-ink-900/5 bg-white px-3.5 py-2.5 text-sm text-ink-700/60 shadow-sm">
                  <Loader2 size={14} className="animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-ink-900/5 bg-white p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={user ? "Ask about products, orders, coupons..." : "Sign in to chat with Aria"}
              disabled={!user}
              className="flex-1 rounded-full border border-ink-900/10 bg-paper px-3.5 py-2 text-sm outline-none focus:border-signal-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-950 text-white transition hover:bg-signal-600 disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
