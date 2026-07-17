import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/hooks/useAuth";
import FlightTrackerSidebar from "@/components/FlightTrackerSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, UserCircle, Search, ChevronUp, ChevronDown, KeyRound, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_LABELS = {
  agent: "Agent",
  team_leader: "Team Leader",
  hr: "HR",
  admin: "Admin",
  super_admin: "Super Admin",
};

const ROLE_FILTERS = ["all", "agent", "team_leader", "hr", "admin", "super_admin"];
const STATUS_FILTERS = ["all", "active", "inactive"];

function SortableHead({ sortField, sortKey, sortDir, onToggle, children }) {
  const active = sortKey === sortField;
  return (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => onToggle(sortField)}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </span>
    </TableHead>
  );
}

export default function EmployeeAccounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortKey, setSortKey] = useState("employee_code");
  const [sortDir, setSortDir] = useState("asc");
  const [resetResult, setResetResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const { data: accounts = [], isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["synced_employee_list"],
    enabled: user?.role === "super_admin" && !!user?.email,
    queryFn: async () => {
      try {
        const response = await base44.functions.invoke("employeeList", {
          requesterEmail: user?.email,
        });
        return response.data?.accounts || [];
      } catch (err) {
        throw new Error(err.response?.data?.error || err.message);
      }
    },
  });

  const resetPassword = useMutation({
    mutationFn: async (account) => {
      try {
        const response = await base44.functions.invoke("resetEmployeePassword", {
          requesterEmail: user?.email,
          targetId: account.id,
        });
        return { account, password: response.data.password };
      } catch (err) {
        throw new Error(err.response?.data?.error || err.message);
      }
    },
    onSuccess: (result) => setResetResult(result),
    onError: (err) => alert(`Failed to reset password: ${err.message}`),
  });

  const updateAccount = useMutation({
    mutationFn: async ({ account, patch }) => {
      try {
        await base44.functions.invoke("updateEmployeeAccount", {
          requesterEmail: user?.email,
          targetId: account.id,
          ...patch,
        });
        return { account, patch };
      } catch (err) {
        throw new Error(err.response?.data?.error || err.message);
      }
    },
    onSuccess: ({ account, patch }) => {
      queryClient.setQueryData(["synced_employee_list"], (old) =>
        (old || []).map((a) => (a.id === account.id ? { ...a, ...patch } : a))
      );
    },
    onError: (err) => alert(`Failed to update: ${err.message}`),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = accounts;
    if (statusFilter !== "all") {
      rows = rows.filter((a) => (a.is_active ? "active" : "inactive") === statusFilter);
    }
    if (roleFilter !== "all") {
      rows = rows.filter((a) => a.role === roleFilter);
    }
    if (q) {
      rows = rows.filter(
        (a) =>
          (a.full_name || "").toLowerCase().includes(q) ||
          (a.employee_code || "").toLowerCase().includes(q) ||
          (a.department || "").toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => {
      const va = String(a[sortKey] ?? "").toLowerCase();
      const vb = String(b[sortKey] ?? "").toLowerCase();
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [accounts, search, statusFilter, roleFilter, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function copyCredentials() {
    if (!resetResult) return;
    const text = `Employee Code: ${resetResult.account.employee_code}\nPassword: ${resetResult.password}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (user?.role !== "super_admin") {
    return <Navigate to="/admin/flight-tracker" replace />;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <FlightTrackerSidebar active="accounts" />

      <div className="flex-1 flex flex-col">
        <main className="flex-1 p-4 md:p-8 overflow-auto space-y-6 max-w-7xl w-full mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-display font-bold">Accounts</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Employee login accounts — reset a password, change a role, or activate/deactivate access.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm">
                <UserCircle className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{user?.name || "—"}</span>
                <Badge variant="outline" className="text-[10px]">{ROLE_LABELS[user?.role] || user?.role}</Badge>
              </div>
              <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <CardTitle className="text-base font-display">Employees ({filtered.length})</CardTitle>
                <div className="flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((s) => (
                    <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} className="capitalize" onClick={() => setStatusFilter(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ROLE_FILTERS.map((r) => (
                    <Button key={r} size="sm" variant={roleFilter === r ? "default" : "outline"} onClick={() => setRoleFilter(r)}>
                      {r === "all" ? "All Roles" : ROLE_LABELS[r] || r}
                    </Button>
                  ))}
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search name, code, department…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead sortField="full_name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort}>Name</SortableHead>
                    <SortableHead sortField="employee_code" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort}>Employee ID</SortableHead>
                    <TableHead>Department</TableHead>
                    <SortableHead sortField="role" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort}>Role</SortableHead>
                    <SortableHead sortField="is_active" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort}>Status</SortableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Loading accounts…</TableCell></TableRow>
                  )}
                  {isError && !isLoading && (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-red-600">Failed to load accounts.</TableCell></TableRow>
                  )}
                  {!isLoading && !isError && filtered.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">No accounts match your filters.</TableCell></TableRow>
                  )}
                  {!isLoading && !isError && filtered.map((account) => {
                    const isResetting = resetPassword.isPending && resetPassword.variables?.id === account.id;
                    const isUpdating = updateAccount.isPending && updateAccount.variables?.account.id === account.id;
                    const isSelf = account.email && account.email === user?.email;
                    return (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.full_name || "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{account.employee_code || "—"}</TableCell>
                        <TableCell>{account.department || "—"}</TableCell>
                        <TableCell>
                          <Select value={account.role || ""} disabled={isSelf || isUpdating} onValueChange={(role) => updateAccount.mutate({ account, patch: { role } })}>
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {account.is_active ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200">Active</Badge>
                          ) : (
                            <Badge className="bg-muted text-muted-foreground border border-border">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="gap-1.5" disabled={isResetting} onClick={() => resetPassword.mutate(account)}>
                              <KeyRound className={cn("w-3.5 h-3.5", isResetting && "animate-pulse")} />
                              Reset Password
                            </Button>
                            <Button
                              size="sm"
                              variant={account.is_active ? "outline" : "default"}
                              disabled={isSelf || isUpdating}
                              title={isSelf ? "Can't deactivate your own account here." : undefined}
                              onClick={() => updateAccount.mutate({ account, patch: { is_active: !account.is_active } })}
                            >
                              {account.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </main>
      </div>

      <Dialog open={!!resetResult} onOpenChange={(open) => !open && setResetResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset</DialogTitle>
            <DialogDescription>
              New password for {resetResult?.account.full_name} ({resetResult?.account.employee_code}). Copy and share it now — it won't be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted font-mono text-lg tracking-wider justify-center">
            {resetResult?.password}
          </div>
          <DialogFooter>
            <Button onClick={copyCredentials} className="gap-2">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy code + password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}