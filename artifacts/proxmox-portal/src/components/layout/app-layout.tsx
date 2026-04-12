import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Server, 
  Users, 
  Building2, 
  MonitorPlay,
  ShieldAlert,
  Bell,
  FileText,
  Layers,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
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
  { href: "/vm-templates", label: "VM Templates", icon: Layers, adminOnly: false },
  { href: "/access", label: "Access Control", icon: ShieldAlert, adminOnly: true },
  { href: "/notifications", label: "Notifications", icon: Bell, adminOnly: true },
  { href: "/requests", label: "Requests", icon: FileText, adminOnly: false },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location]);

  const filteredNav = navItems.filter((item) => !item.adminOnly || user?.role === "admin");

  const sidebarContent = (
    <>
      <div className="h-16 md:h-20 flex items-center justify-between px-4 md:px-5 border-b border-forest/40 bg-black shrink-0">
        <Link href="/" className="flex items-center">
          <img src={logoImg} alt="ProxHub" className="h-12 md:h-16 w-auto" />
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden h-8 w-8 p-0 text-sand/60 hover:text-sand"
          onClick={() => setMobileOpen(false)}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-md transition-colors text-sm font-medium",
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
      <div className="p-4 border-t border-forest/40 text-xs text-sand/40 shrink-0">
        v0.1.0-alpha
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <div className="w-64 border-r border-forest/40 bg-forest flex-col hidden md:flex fixed inset-y-0 z-10">
        {sidebarContent}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 bg-forest border-r border-forest/40 flex flex-col z-50 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
      
      <div className="flex-1 md:pl-64 flex flex-col min-h-[100dvh] min-w-0 overflow-x-hidden">
        <header className="h-14 md:h-16 border-b border-border flex items-center px-4 md:px-6 bg-card/50 backdrop-blur sticky top-0 z-20 gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden h-9 w-9 p-0 text-muted-foreground hover:text-foreground -ml-1"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 md:gap-3">
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
        <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
