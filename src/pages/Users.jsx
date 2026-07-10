import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const roleConfig = {
  admin: { label: 'Admin', className: 'bg-primary/10 text-primary' },
  agent: { label: 'Agent', className: 'bg-emerald-500/10 text-emerald-400' },
  traveler: { label: 'Traveler', className: 'bg-slate-500/10 text-slate-400' },
};

export default function Users() {
  const { data: currentUser } = useCurrentUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await base44.entities.User.list();
        setUsers(result || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    setUpdatingId(userId);
    try {
      await base44.entities.User.update(userId, { role: newRole });
      setUsers(prev => prev.map(u => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground mt-1">{users.length} registered users</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-3 px-6 py-3 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <div>User</div>
          <div>Role</div>
          <div className="text-right">Change Role</div>
        </div>
        {users.map(u => {
          const role = u.role || 'traveler';
          const config = roleConfig[role] || roleConfig.traveler;
          const isSelf = u.id === currentUser?.id;
          return (
            <div
              key={u.id}
              className="grid grid-cols-3 px-6 py-4 border-b border-border last:border-0 items-center"
            >
              <div>
                <div className="text-sm font-medium text-foreground">{u.full_name || 'Unnamed'}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <div>
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${config.className}`}>
                  {config.label}
                </span>
              </div>
              <div className="flex justify-end">
                <select
                  value={role}
                  onChange={e => handleRoleChange(u.id, e.target.value)}
                  disabled={isSelf || updatingId === u.id}
                  className="bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="admin">Admin</option>
                  <option value="agent">Agent</option>
                  <option value="traveler">Traveler</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}