import { useState, type FormEvent } from "react";
import { Loader2, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const logoImg = `${import.meta.env.BASE_URL}proxhub-logo.png`;

const API = `${import.meta.env.BASE_URL}api`;

export default function ForgotPasswordPage({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to send reset email");
        setLoading(false);
        return;
      }

      setSent(true);
    } catch {
      setError("Unable to connect to the server");
      setLoading(false);
    }
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
        </div>

        {sent ? (
          <div className="rounded-lg border border-olive/30 bg-card p-6 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-olive mx-auto" />
            <p className="text-foreground font-medium">Check Your Email</p>
            <p className="text-sm text-muted-foreground">
              If an account with that email exists, we've sent a password reset link. Check your inbox and spam folder.
            </p>
            <Button variant="outline" className="w-full mt-4" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Back to Sign In
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="text-center mb-2">
              <h2 className="text-lg font-semibold text-foreground">Forgot Password</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Enter your email to receive a reset link
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Reset Link"
              )}
            </Button>

            <button
              type="button"
              onClick={onBack}
              className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center"
            >
              Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
