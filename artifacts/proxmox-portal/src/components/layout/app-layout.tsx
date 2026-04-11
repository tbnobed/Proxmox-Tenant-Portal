import React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Server, 
  Users, 
  Building2, 
  MonitorPlay,
  ShieldAlert,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clusters", label: "Clusters", icon: Server },
  { href: "/tenants", label: "Tenants", icon: Building2 },
  { href: "/users", label: "Users", icon: Users },
  { href: "/vms", label: "Virtual Machines", icon: MonitorPlay },
  { href: "/access", label: "Access Control", icon: ShieldAlert },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      <div className="w-64 border-r border-border bg-card flex flex-col hidden md:flex fixed inset-y-0 z-10">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-2 text-primary">
            <Server className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight text-foreground">Proxmox Portal</span>
          </div>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border text-xs text-muted-foreground">
          v0.1.0-alpha
        </div>
      </div>
      
      <div className="flex-1 md:pl-64 flex flex-col min-h-[100dvh]">
        <header className="h-16 border-b border-border flex items-center px-6 bg-card/50 backdrop-blur sticky top-0 z-20">
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-foreground">{user.fullName || user.username}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">
                  {(user.fullName || user.username).charAt(0).toUpperCase()}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={logout}
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
