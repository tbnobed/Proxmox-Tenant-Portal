import { useState } from "react";
import { ShieldCheck, ShieldOff, Loader2, AlertCircle, CheckCircle, Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

const base = import.meta.env.BASE_URL || "/";

export default function SecurityPage() {
  const { user, refresh } = useAuth();
  const [step, setStep] = useState<"idle" | "setup" | "verify">("idle");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function startSetup() {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`${base}api/auth/2fa/setup`, {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start 2FA setup");
        setLoading(false);
        return;
      }

      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep("setup");
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndEnable() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${base}api/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: verifyCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed");
        setVerifyCode("");
        setLoading(false);
        return;
      }

      setSuccess("Two-factor authentication has been enabled.");
      setStep("idle");
      setQrCode(null);
      setSecret(null);
      setVerifyCode("");
      await refresh();
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  async function disable2FA() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${base}api/auth/2fa/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: disablePassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to disable 2FA");
        setLoading(false);
        return;
      }

      setSuccess("Two-factor authentication has been disabled.");
      setShowDisable(false);
      setDisablePassword("");
      await refresh();
    } catch {
      setError("Unable to connect to the server");
    } finally {
      setLoading(false);
    }
  }

  function copySecret() {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function cancelSetup() {
    setStep("idle");
    setQrCode(null);
    setSecret(null);
    setVerifyCode("");
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Security Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account security preferences</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
          <p className="text-sm text-green-400">{success}</p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {user?.twoFactorEnabled ? (
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-green-500" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <ShieldOff className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold text-foreground">Two-Factor Authentication</h2>
                <p className="text-sm text-muted-foreground">
                  {user?.twoFactorEnabled
                    ? "Your account is protected with 2FA"
                    : "Add an extra layer of security to your account"}
                </p>
              </div>
            </div>
            <div>
              {user?.twoFactorEnabled ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-500/10 text-green-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Enabled
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                  Disabled
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-6">
          {step === "idle" && !user?.twoFactorEnabled && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Two-factor authentication adds an extra layer of security by requiring a code from your authenticator app (Google Authenticator, Authy, etc.) in addition to your password when signing in.
              </p>
              <Button onClick={startSetup} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 mr-1.5" />
                    Enable Two-Factor Authentication
                  </>
                )}
              </Button>
            </div>
          )}

          {step === "idle" && user?.twoFactorEnabled && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Two-factor authentication is active. You will need your authenticator app code each time you sign in.
              </p>

              {!showDisable ? (
                <Button variant="destructive" onClick={() => setShowDisable(true)}>
                  <ShieldOff className="w-4 h-4 mr-1.5" />
                  Disable Two-Factor Authentication
                </Button>
              ) : (
                <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 space-y-3">
                  <p className="text-sm text-foreground font-medium">Confirm by entering your password</p>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      placeholder="Enter your password"
                      className="max-w-xs"
                    />
                    <Button
                      variant="destructive"
                      onClick={disable2FA}
                      disabled={loading || !disablePassword}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => { setShowDisable(false); setDisablePassword(""); setError(null); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "setup" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-foreground mb-2">Step 1: Scan the QR Code</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Open your authenticator app and scan this QR code to add your account.
                </p>
                {qrCode && (
                  <div className="inline-block p-4 bg-white rounded-lg">
                    <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                  </div>
                )}
              </div>

              {secret && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Can't scan? Enter this key manually in your authenticator app:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-sm font-mono text-foreground">
                      {showSecret ? secret : "••••••••••••••••"}
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </code>
                    <Button variant="outline" size="sm" onClick={copySecret}>
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      {copied ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-base font-semibold text-foreground mb-2">Step 2: Verify Your Code</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Enter the 6-digit code from your authenticator app to complete setup.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="max-w-[160px] text-center text-lg tracking-[0.5em] font-mono"
                  />
                  <Button
                    onClick={verifyAndEnable}
                    disabled={loading || verifyCode.length !== 6}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify & Enable"
                    )}
                  </Button>
                  <Button variant="ghost" onClick={cancelSetup}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
