import { useState, useEffect, type FormEvent } from "react";
import { useParams, useLocation } from "wouter";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const logoImg = `${import.meta.env.BASE_URL}proxhub-logo.png`;

const API = `${import.meta.env.BASE_URL}api`;

export default function AcceptInvitePage({ onAccepted }: { onAccepted: () => void }) {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [, navigate] = useLocation();
  const [invite, setInvite] = useState<{ email: string; role: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    fetch(`${API}/auth/invite/${token}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Invalid invite link");
        }
        return res.json();
      })
      .then((data) => {
        setInvite(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API}/auth/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, fullName, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create account");
        setSubmitting(false);
        return;
      }

      navigate("/");
      onAccepted();
    } catch {
      setError("Unable to connect to the server");
      setSubmitting(false);
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

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-sand" />
          </div>
        ) : !invite ? (
          <div className="rounded-lg border border-red-500/30 bg-card p-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
            <p className="text-red-400 font-medium">{error || "Invalid invite link"}</p>
            <p className="text-sm text-muted-foreground">This invite may have expired or already been used.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="text-center mb-2">
              <h2 className="text-lg font-semibold text-foreground">Create Your Account</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Invited as <span className="text-sand capitalize font-medium">{invite.role}</span>
              </p>
            </div>

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <div className="rounded-md border border-olive/20 bg-olive/5 p-3">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm text-foreground font-medium">{invite.email}</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="fullName" className="text-sm font-medium text-foreground">Full Name</label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium text-foreground">Username</label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">Confirm Password</label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                autoComplete="new-password"
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  Create Account
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
