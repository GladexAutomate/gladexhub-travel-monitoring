import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, XCircle, AlertTriangle, RefreshCw, ArrowUpCircle, CircleDot } from "lucide-react";

const statusConfig = {
  confirmed: { label: "Confirmed", icon: CheckCircle, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending: { label: "Pending", icon: Clock, className: "bg-amber-50 text-amber-700 border-amber-200" },
  cancelled: { label: "Cancelled", icon: XCircle, className: "bg-red-50 text-red-700 border-red-200" },
  flight_changed: { label: "Flight Changed", icon: RefreshCw, className: "bg-blue-50 text-blue-700 border-blue-200" },
  schedule_updated: { label: "Schedule Updated", icon: ArrowUpCircle, className: "bg-purple-50 text-purple-700 border-purple-200" },
  action_needed: { label: "Action Needed", icon: AlertTriangle, className: "bg-orange-50 text-orange-700 border-orange-200" },
  completed: { label: "Completed", icon: CircleDot, className: "bg-slate-50 text-slate-600 border-slate-200" },
};

export default function StatusBadge({ status }) {
  const config = statusConfig[status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} gap-1.5 font-medium px-3 py-1`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </Badge>
  );
}