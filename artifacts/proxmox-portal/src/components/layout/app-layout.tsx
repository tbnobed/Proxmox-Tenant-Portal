import React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Server, 
  Users, 
  Building2, 
  MonitorPlay,
  ShieldAlert,
  Bell,
  LogOut,
  Sun,
  Moon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
const logoImg = `${import.meta.env.BASE_URL}proxhub-logo.png`;

interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { href: "/clusters", label: "Clusters", icon: Server, adminOnly: true },
  { href: "/tenants", label: "Tenants", icon: Building2, adminOnly: true },
  { href: "/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/vms", label: "Virtual Machines", icon: MonitorPlay, adminOnly: false },
  { href: "/access", label: "Access Control", icon: ShieldAlert, adminOnly: true },
  { href: "/notifications", label: "Notifications", icon: Bell, adminOnly: true },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen bg-background">
      <div className="w-64 border-r border-forest/40 bg-forest flex flex-col hidden md:flex fixed inset-y-0 z-10">
        <div className="h-20 flex items-center px-5 border-b border-forest/40 bg-black">
          <Link href="/" className="flex items-center">
            <img src={logoImg} alt="ProxHub" className="h-16 w-auto" />
          </Link>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1">
          {navItems
            .filter((item) => !item.adminOnly || user?.role === "admin")
            .map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
                    isActive 
                      ? "bg-olive/30 text-sand" 
                      : "text-sand/60 hover:text-sand hover:bg-olive/20"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
        </nav>
        <div className="p-4 border-t border-forest/40 text-xs text-sand/40">
          v0.1.0-alpha
        </div>
      </div>
      
      <div className="flex-1 md:pl-64 flex flex-col min-h-[100dvh]">
        <header className="h-16 border-b border-border flex items-center px-6 bg-card/50 backdrop-blur sticky top-0 z-20">
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            {user && (
              <>
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-foreground">{user.fullName || user.username}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-olive/30 text-olive flex items-center justify-center font-bold text-sm">
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
