import { useState, useRef, type FormEvent } from "react";
import { Loader2, AlertCircle, ShieldCheck, Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const logoImg = `${import.meta.env.BASE_URL}proxhub-logo.png`;
const base = import.meta.env.BASE_URL || "/";

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

  const [requiresSetup, setRequiresSetup] = useState(false);
  const [setupQrCode, setSetupQrCode] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [copied, setCopied] = useState(false);
  const setupRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
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

      if (data.requiresTwoFactorSetup) {
        setRequiresSetup(true);
        setSetupQrCode(data.qrCode);
        setSetupSecret(data.secret);
        setLoading(false);
        setTimeout(() => setupRef.current?.focus(), 100);
        return;
      }

      onLogin();
    } catch {
      setError("Unable to connect to the server");
      setLoading(false);
    }
  }

  async function handleCompleteSetup(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${base}api/auth/2fa/complete-setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: setupCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed");
        setSetupCode("");
        setLoading(false);
        return;
      }

      onLogin();
    } catch {
      setError("Unable to connect to the server");
      setLoading(false);
    }
  }

  function copySecret() {
    if (setupSecret) {
      navigator.clipboard.writeText(setupSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleBackToLogin() {
    setRequiresTwoFactor(false);
    setRequiresSetup(false);
    setTotpCode("");
    setSetupCode("");
    setSetupQrCode(null);
    setSetupSecret(null);
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
            {requiresSetup ? "Set up two-factor authentication" : requiresTwoFactor ? "Enter your authentication code" : "Sign in to manage your infrastructure"}
          </p>
        </div>

        {requiresSetup ? (
          <form onSubmit={handleCompleteSetup} className="rounded-lg border border-border bg-card p-6 space-y-4">
            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="rounded-md border border-olive/30 bg-olive/10 p-3">
              <p className="text-sm text-sand font-medium">Your administrator requires two-factor authentication on your account.</p>
              <p className="text-xs text-muted-foreground mt-1">Set up your authenticator app to continue signing in.</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Step 1: Scan the QR Code</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Open your authenticator app (Google Authenticator, Authy, etc.) and scan this code.
              </p>
              {setupQrCode && (
                <div className="inline-block p-3 bg-white rounded-lg">
                  <img src={setupQrCode} alt="2FA QR Code" className="w-40 h-40" />
                </div>
              )}
            </div>

            {setupSecret && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">
                  Can't scan? Enter this key manually:
                </p>
                <div className="flex items-center gap-2">
                  <code className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted text-xs font-mono text-foreground">
                    {showSecret ? setupSecret : "••••••••••••••••"}
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </code>
                  <Button type="button" variant="outline" size="sm" onClick={copySecret} className="h-7 text-xs">
                    <Copy className="w-3 h-3 mr-1" />
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Step 2: Enter Verification Code</h3>
              <Input
                ref={setupRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoComplete="one-time-code"
                required
                className="text-center text-lg tracking-[0.5em] font-mono"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading || setupCode.length !== 6}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 mr-1.5" />
                  Enable 2FA & Sign In
                </>
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
          </form>
        ) : (
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
        )}
      </div>
    </div>
  );
}
