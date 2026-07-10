import { Globe, Plane, Users, ShieldAlert, LayoutDashboard, ExternalLink, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const NAV_ITEMS = [
  { key: "emails", label: "Flight Emails", icon: Plane, path: "/admin/flight-tracker" },
  { key: "accounts", label: "Accounts", icon: Users, path: "/admin/accounts", developerOnly: true },
];

export default function FlightTrackerSidebar({ active }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/admin/flight-tracker-login", { replace: true });
  };

  const items = NAV_ITEMS.filter((item) => !item.developerOnly || user?.role === "super_admin");

  return (
    <aside className="hidden md:flex flex-col w-64 h-screen sticky top-0 shrink-0 bg-sidebar border-r border-sidebar-border">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-gradient-to-br from-orange-500 to-amber-400 rounded-lg">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-display font-bold text-sm text-sidebar-foreground leading-none">GladexHub</p>
            <p className="text-[10px] text-sidebar-foreground/60 leading-tight">Flight Tracker</p>
          </div>
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span className="text-xs font-bold tracking-wide">ADMIN VIEW</span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              className={
                isActive
                  ? "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-sidebar-primary text-sidebar-primary-foreground w-full text-left"
                  : "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full text-left"
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-1">
        <a
          href="/admin"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LayoutDashboard className="w-4 h-4" />
          Admin Dashboard
        </a>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Customer Portal
        </a>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </aside>
  );
}