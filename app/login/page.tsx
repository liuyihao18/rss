"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    setLoading(false);
    if (response.ok) {
      window.location.href = "/";
    } else {
      setError("密码不正确");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-moss/15 bg-white p-6 shadow-soft">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-mist text-moss">
            <LockKeyhole size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-ink">AI 最新消息</h1>
            <p className="text-sm text-ink/60">输入密码进入阅读器</p>
          </div>
        </div>
        <label className="mb-2 block text-sm font-medium text-ink" htmlFor="password">
          访问密码
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-3 h-11 w-full rounded-md border border-moss/20 bg-white px-3 outline-none ring-moss/20 focus:ring-4"
          autoFocus
        />
        {error ? <p className="mb-3 text-sm text-berry">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-md bg-ink px-4 text-sm font-semibold text-white transition hover:bg-moss disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
    </main>
  );
}
