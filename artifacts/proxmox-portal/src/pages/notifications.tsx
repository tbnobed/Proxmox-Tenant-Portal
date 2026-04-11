import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Bell, Send, Activity, CheckCircle2, XCircle, Loader2 } from "lucide-react";

const API = `${import.meta.env.BASE_URL}api`;

async function fetchJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const [testEmail, setTestEmail] = useState("");

  const statusQuery = useQuery({
    queryKey: ["notification-status"],
    queryFn: () => fetchJson(`${API}/notifications/status`),
  });

  const testMutation = useMutation({
    mutationFn: (email: string) =>
      fetchJson(`${API}/notifications/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    onSuccess: (data) => {
      toast({ title: "Test Email Sent", description: data.message });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const digestMutation = useMutation({
    mutationFn: () =>
      fetchJson(`${API}/notifications/digest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (data) => {
      toast({ title: "Digest Sent", description: data.message });
    },
    onError: (err: Error) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  const configured = statusQuery.data?.configured ?? false;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Email Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage email notification settings and triggers
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sand">
              {configured ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              Email Status
            </CardTitle>
            <CardDescription>
              {configured
                ? "SendGrid is configured and ready to send emails"
                : "Email not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL environment variables."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span className="text-foreground font-medium">SendGrid</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className={configured ? "text-green-500" : "text-red-500"}>
                  {configured ? "Connected" : "Not Configured"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Health Digest</span>
                <span className="text-foreground">
                  Every {((statusQuery.data?.digestIntervalMs ?? 86400000) / 3600000).toFixed(0)}h
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sand">
              <Bell className="w-5 h-5" />
              Active Triggers
            </CardTitle>
            <CardDescription>
              Events that trigger email notifications to admins
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {[
                { label: "VM Actions", desc: "Start, stop, reboot, shutdown" },
                { label: "VM Created", desc: "New virtual machines" },
                { label: "User Created", desc: "New user accounts" },
                { label: "Access Changes", desc: "VM access granted or revoked" },
                { label: "Health Alerts", desc: "Node threshold warnings" },
                { label: "Daily Digest", desc: "Infrastructure health summary" },
              ].map((t) => (
                <div key={t.label} className="flex items-start gap-3 py-1.5">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-foreground font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sand">
              <Send className="w-5 h-5" />
              Send Test Email
            </CardTitle>
            <CardDescription>
              Verify your email configuration is working
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="test-email">Recipient Email</Label>
                <Input
                  id="test-email"
                  type="email"
                  placeholder="you@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </div>
              <Button
                onClick={() => testMutation.mutate(testEmail)}
                disabled={!testEmail || testMutation.isPending}
                className="w-full"
              >
                {testMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send Test Email
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sand">
              <Activity className="w-5 h-5" />
              Health Digest
            </CardTitle>
            <CardDescription>
              Manually trigger the daily health digest email
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This will generate a health report of all clusters and nodes, then email it to all admin users.
              </p>
              <Button
                onClick={() => digestMutation.mutate()}
                disabled={digestMutation.isPending}
                variant="outline"
                className="w-full"
              >
                {digestMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Activity className="w-4 h-4 mr-2" />
                )}
                Send Health Digest Now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sand">Docker Configuration</CardTitle>
          <CardDescription>
            Environment variables for email notifications in Docker deployments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-black/50 rounded-md p-4 font-mono text-xs text-muted-foreground space-y-1">
            <p><span className="text-sand">SENDGRID_API_KEY</span>=SG.your-api-key-here</p>
            <p><span className="text-sand">SENDGRID_FROM_EMAIL</span>=noreply@yourdomain.com</p>
            <p><span className="text-sand">HEALTH_DIGEST_INTERVAL_MS</span>=86400000 <span className="text-muted-foreground/50"># 24 hours</span></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
