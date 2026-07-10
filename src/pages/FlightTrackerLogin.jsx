import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Mail, Lock, Loader2, ShieldAlert } from "lucide-react";

// Separate from src/pages/Login.jsx on purpose — that page belongs to the
// existing base44 auth system (Customer Portal / general admin), gated at
// /login. This is a different auth system (employeeaccount, for flight
// booking RBAC only), so it gets its own page and route instead of
// overwriting or piggybacking on the existing one.
export default function FlightTrackerLogin() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(identifier, password);
      navigate("/admin/flight-tracker", { replace: true });
    } catch (err) {
      setError(err.message || "Invalid email/username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="p-2.5 bg-gradient-to-br from-orange-500 to-amber-400 rounded-xl mb-3">
            <Globe className="w-6 h-6 text-white" />
          </div>
          <p className="font-display font-bold text-lg leading-none">GladexHub</p>
          <p className="text-xs text-muted-foreground mt-1">Flight Tracker — Admin Login</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6 rounded-xl border shadow-md bg-card">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="identifier">Email or Employee Code</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="identifier"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10"
                required
              />
            </div>
          </div>

          <Button type="submit" className="w-full gap-2 bg-orange-500 hover:bg-orange-600 text-white" disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Logging in..." : "Log In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
