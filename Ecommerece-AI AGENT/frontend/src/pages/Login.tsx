import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../api/client";

export default function Login() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, fullName);
      }
      navigate("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-4 py-12">
      <div className="mb-6 text-center">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-ink-950 text-white">
          <Sparkles size={18} />
        </span>
        <h1 className="mt-3 font-display text-xl font-bold text-ink-950">
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-ink-700/60">
          {mode === "login" ? "Sign in to chat with Aria and manage your orders." : "Join to start shopping with Aria."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-ink-900/5 bg-white p-6 shadow-soft">
        {mode === "register" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-700/70">Full name</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-ink-900/10 bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-signal-500"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-700/70">Email</label>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-ink-900/10 bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-signal-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-700/70">Password</label>
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-ink-900/10 bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-signal-500"
          />
        </div>

        {error && <p className="text-xs font-medium text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-ink-950 py-2.5 text-sm font-semibold text-white transition hover:bg-signal-600 disabled:opacity-50"
        >
          {submitting ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-ink-700/60">
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
          className="font-semibold text-signal-600 hover:underline"
        >
          {mode === "login" ? "Create an account" : "Sign in"}
        </button>
      </p>

      {mode === "login" && (
        <p className="mt-3 rounded-xl bg-ink-900/5 p-3 text-center text-[11px] leading-relaxed text-ink-700/60">
          Demo account: <span className="font-mono">demo@shop.ai</span> / <span className="font-mono">Demo123!</span>
        </p>
      )}

      <Link to="/" className="mt-6 text-center text-xs text-ink-700/40 hover:text-ink-700/70">
        Continue browsing without signing in
      </Link>
    </div>
  );
}
