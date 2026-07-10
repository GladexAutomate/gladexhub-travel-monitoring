import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Plane, LayoutDashboard, Ticket, Users, LogOut, Menu, Plus } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { base44 } from '@/api/base44Client';

const navItems = [
  { label: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['admin', 'agent', 'traveler'] },
  { label: 'Bookings', path: '/bookings', icon: Ticket, roles: ['admin', 'agent', 'traveler'] },
  { label: 'New Booking', path: '/bookings/new', icon: Plus, roles: ['admin', 'agent'] },
  { label: 'Users', path: '/users', icon: Users, roles: ['admin'] },
];

export default function Layout() {
  const { data: user } = useCurrentUser();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role || 'traveler';
  const items = navItems.filter(item => item.roles.includes(role));

  const handleLogout = async () => {
    await base44.auth.logout();
  };

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-2.5 px-6 h-16 border-b border-border">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center">
          <Plane className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">GladexHub</div>
          <div className="text-[10px] text-muted-foreground tracking-wider uppercase">Travel Monitor</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-border">
        <div className="px-3 py-2 mb-2">
          <div className="text-sm font-medium text-foreground truncate">{user?.full_name || user?.email || 'User'}</div>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">{role}</span>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="hidden lg:flex flex-col w-64 fixed inset-y-0 left-0 bg-[#0B1120] border-r border-border z-30">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
          <aside className="fixed inset-y-0 left-0 w-64 bg-[#0B1120] border-r border-border z-50 lg:hidden flex flex-col">
            <SidebarContent />
          </aside>
        </>
      )}

      <div className="lg:pl-64">
        <div className="lg:hidden flex items-center justify-between h-16 px-4 border-b border-border bg-[#0B1120] sticky top-0 z-20">
          <button onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <Plane className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">GladexHub</span>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}