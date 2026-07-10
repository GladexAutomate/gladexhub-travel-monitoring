import { Outlet, Link, useLocation } from "react-router-dom";
import { Globe, LayoutDashboard, Briefcase, Mail, Clock, Settings, LogOut, ExternalLink, Database, Server } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/bookings", label: "Bookings", icon: Briefcase },
  { path: "/admin/emails", label: "Email Updates", icon: Mail },
  { path: "/admin/timeline", label: "Timeline Manager", icon: Clock },
  { path: "/admin/settings", label: "Settings", icon: Settings },
  { path: "/admin/datasource", label: "Data Source", icon: Database },
  { path: "/admin/raw-data", label: "Raw Data", icon: Server },
];

export default function AdminLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-gradient-to-br from-orange-500 to-amber-400 rounded-lg">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-display font-bold text-sm text-sidebar-foreground leading-none">GladexHub</p>
              <p className="text-[10px] text-sidebar-foreground/60 leading-tight">Admin Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-1">
          <Link to="/" target="_blank" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
            <ExternalLink className="w-4 h-4" />
            Customer Portal
          </Link>
          <button onClick={() => base44.auth.logout()} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full">
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="flex-1 flex flex-col">
        <header className="md:hidden sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-orange-500 to-amber-400 rounded-lg">
              <Globe className="w-4 h-4 text-white" />
            </div>
            <p className="font-display font-bold text-sm">GladexHub Admin</p>
          </div>
        </header>

        {/* Mobile Nav */}
        <div className="md:hidden sticky top-[53px] z-40 bg-white border-b overflow-x-auto">
          <div className="flex px-2 py-1.5 gap-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors",
                    isActive ? "bg-orange-500 text-white" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <main className="flex-1 p-4 md:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}