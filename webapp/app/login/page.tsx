"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (!result || result.error) {
      setError("Invalid email or password.");
      setBusy(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main>
      <h1>Sign in</h1>
      <p className="subtitle">Access your private AI Company Builder workspace.</p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="top-error">{error}</div>}
        <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="field-hint">
        Need an account? <a href="/signup">Create one</a>
      </p>
    </main>
  );
}
