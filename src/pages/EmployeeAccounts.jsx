import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invokeApi } from "@/lib/vercelApi";
import { useAuth } from "@/hooks/useAuth";
import FlightTrackerSidebar from "@/components/FlightTrackerSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, UserCircle, Search, ChevronUp, ChevronDown, Eye, EyeOff, Copy, Check } from "lucide-react";
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

// Hoisted above the component so it isn't recreated (and remounted by
// React) on every render — sortKey/sortDir/onToggle come in as props
// instead of being closed over.
function SortableHead({ sortField, sortKey, sortDir, onToggle, children }) {
  const active = sortKey === sortField;
  return (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap"
      onClick={() => onToggle(sortField)}
    >
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
  const [revealedId, setRevealedId]   = useState(null);
  const [copiedId, setCopiedId]       = useState(null);

  const { data: accounts = [], isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["synced_employee_list"],
    enabled: user?.role === "super_admin" && !!user?.email,
    queryFn: async () => {
      // invokeApi() rejects on any non-2xx response rather than resolving
      // with the error in response.data, so the real message ("Insufficient
      // permissions", etc.) has to be read out of the rejected error, not a
      // response.data.error check on success.
      try {
        const response = await invokeApi("employeeList", {
          requesterEmail: user?.email,
        });
        return response.data?.accounts || [];
      } catch (err) {
        throw new Error(err.response?.data?.error || err.message);
      }
    },
  });

  function copyCredentials(account) {
    const text = `Employee Code: ${account.employee_code}\nPassword: ${account.password}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(account.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  // Writes to role_override/is_active_override (not the synced role/
  // is_active) — see updateEmployeeAccount/entry.ts and the fields'
  // description on the SyncedEmployee entity. Survives the next sync.
  const updateAccount = useMutation({
    mutationFn: async ({ account, patch }) => {
      try {
        await invokeApi("updateEmployeeAccount", {
          requesterEmail: user?.email,
          targetEmail: account.email,
          ...patch,
        });
        return { account, patch };
      } catch (err) {
        throw new Error(err.response?.data?.error || err.message);
      }
    },
    // Patch just this row in the cache instead of refetching the whole
    // employee list (which itself re-scans every employee server-side) for
    // a one-field change.
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
                Employee login accounts — change a role or activate/deactivate access. Passwords are managed by the source account system, not here.
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
                    <Button
                      key={s}
                      size="sm"
                      variant={statusFilter === s ? "default" : "outline"}
                      className="capitalize"
                      onClick={() => setStatusFilter(s)}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {ROLE_FILTERS.map((r) => (
                    <Button
                      key={r}
                      size="sm"
                      variant={roleFilter === r ? "default" : "outline"}
                      onClick={() => setRoleFilter(r)}
                    >
                      {r === "all" ? "All Roles" : ROLE_LABELS[r] || r}
                    </Button>
                  ))}
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search name, code, department…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
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
                    <TableHead>Credentials</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        Loading accounts…
                      </TableCell>
                    </TableRow>
                  )}
                  {isError && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-red-600">
                        Failed to load accounts.
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && !isError && filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        No accounts match your filters.
                      </TableCell>
                    </TableRow>
                  )}
                  {!isLoading && !isError && filtered.map((account) => {
                    const isUpdating = updateAccount.isPending && updateAccount.variables?.account.id === account.id;
                    const isSelf = account.email && account.email === user?.email;
                    const revealed = revealedId === account.id;
                    const justCopied = copiedId === account.id;
                    return (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.full_name || "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{account.employee_code || "—"}</TableCell>
                        <TableCell>{account.department || "—"}</TableCell>
                        <TableCell>
                          <Select
                            value={account.role || ""}
                            disabled={isSelf || isUpdating}
                            onValueChange={(role) => updateAccount.mutate({ account, patch: { role } })}
                          >
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
                        <TableCell>
                          {account.password ? (
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs">
                                {revealed ? account.password : "••••••••"}
                              </span>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setRevealedId(revealed ? null : account.id)}>
                                {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyCredentials(account)}>
                                {justCopied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={account.is_active ? "outline" : "default"}
                            disabled={isSelf || isUpdating}
                            title={isSelf ? "Can't deactivate your own account here." : undefined}
                            onClick={() =>
                              updateAccount.mutate({ account, patch: { is_active: !account.is_active } })
                            }
                          >
                            {account.is_active ? "Deactivate" : "Activate"}
                          </Button>
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

    </div>
  );
}
