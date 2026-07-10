import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabaseAccounts } from "@/lib/supabaseAccounts";
import { useAuth } from "@/hooks/useAuth";
import FlightTrackerSidebar from "@/components/FlightTrackerSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_LABELS = {
  agent: "Agent",
  team_leader: "Team Leader",
  hr: "HR",
  admin: "Admin",
  super_admin: "Super Admin",
};

export default function EmployeeAccounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: accounts = [], isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["admin_accounts_list"],
    queryFn: async () => {
      const { data, error } = await supabaseAccounts
        .from("admin_accounts")
        .select("id, full_name, employee_code, department, role, is_active")
        .order("employee_code", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: user?.role === "super_admin",
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }) => {
      const { error } = await supabaseAccounts
        .from("admin_accounts")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin_accounts_list"] }),
  });

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
                Employee login accounts — activate or deactivate access.
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
              <CardTitle className="text-base font-display">Employees ({accounts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
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
                  {!isLoading && !isError && accounts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        No accounts found.
                      </TableCell>
                    </TableRow>
                  )}
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="font-medium">{account.full_name || "—"}</TableCell>
                      <TableCell>{account.employee_code || "—"}</TableCell>
                      <TableCell>{account.department || "—"}</TableCell>
                      <TableCell>{ROLE_LABELS[account.role] || account.role || "—"}</TableCell>
                      <TableCell>
                        {account.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200">Active</Badge>
                        ) : (
                          <Badge className="bg-muted text-muted-foreground border border-border">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={account.is_active ? "outline" : "default"}
                          disabled={toggleActive.isPending}
                          onClick={() => toggleActive.mutate({ id: account.id, is_active: !account.is_active })}
                        >
                          {account.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
