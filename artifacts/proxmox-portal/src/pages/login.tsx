import { useState, useRef, type FormEvent } from "react";
import { Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const logoImg = `${import.meta.env.BASE_URL}proxhub-logo.png`;

interface LoginPageProps {
  onLogin: () => void;
  onForgotPassword?: () => void;
}

export default function LoginPage({ onLogin, onForgotPassword }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const totpRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const base = import.meta.env.BASE_URL || "/";
      const body: any = { username, password };
      if (requiresTwoFactor) {
        body.totpCode = totpCode;
      }

      const res = await fetch(`${base}api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        if (requiresTwoFactor) {
          setTotpCode("");
        }
        setLoading(false);
        return;
      }

      if (data.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setLoading(false);
        setTimeout(() => totpRef.current?.focus(), 100);
        return;
      }

      onLogin();
    } catch {
      setError("Unable to connect to the server");
      setLoading(false);
    }
  }

  function handleBackToLogin() {
    setRequiresTwoFactor(false);
    setTotpCode("");
    setError(null);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse 70% 60% at 15% 15%, rgba(83,86,31,0.45) 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 85% 85%, rgba(24,45,12,0.5) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 50% 50%, rgba(230,202,167,0.06) 0%, transparent 60%), #050505",
      }}
    >
      <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.12 }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#E6CAA7" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      <div className="w-full max-w-sm relative z-10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-3">
            <img src={logoImg} alt="ProxHub" className="h-28 w-auto rounded-lg" />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {requiresTwoFactor ? "Enter your authentication code" : "Sign in to manage your infrastructure"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 space-y-4">
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {requiresTwoFactor ? (
            <>
              <div className="flex items-center justify-center py-2">
                <div className="w-12 h-12 rounded-full bg-olive/20 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-olive" />
                </div>
              </div>
              <p className="text-sm text-center text-muted-foreground">
                Open your authenticator app and enter the 6-digit code for <span className="font-medium text-foreground">{username}</span>.
              </p>
              <div className="space-y-1.5">
                <label htmlFor="totpCode" className="text-sm font-medium text-foreground">
                  Authentication Code
                </label>
                <Input
                  id="totpCode"
                  ref={totpRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  className="text-center text-lg tracking-[0.5em] font-mono"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading || totpCode.length !== 6}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Sign In"
                )}
              </Button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-xs text-muted-foreground hover:text-sand transition-colors"
                >
                  Back to login
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-sm font-medium text-foreground">
                  Username
                </label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-foreground">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>

              {onForgotPassword && (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-xs text-muted-foreground hover:text-sand transition-colors"
                  >
                    Forgot your password?
                  </button>
                </div>
              )}
            </>
          )}
        </form>
      </div>
    </div>
  );
}
