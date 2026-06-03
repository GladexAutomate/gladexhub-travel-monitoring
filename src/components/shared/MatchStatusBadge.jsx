import { Badge } from "@/components/ui/badge";
import { Link2, HelpCircle, Unlink } from "lucide-react";

const matchConfig = {
  matched: { label: "Matched", icon: Link2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  possible_match: { label: "Possible Match", icon: HelpCircle, className: "bg-amber-50 text-amber-700 border-amber-200" },
  unmatched: { label: "Unmatched", icon: Unlink, className: "bg-red-50 text-red-700 border-red-200" },
};

export default function MatchStatusBadge({ status }) {
  const config = matchConfig[status] || matchConfig.unmatched;
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} gap-1.5 font-medium px-3 py-1`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </Badge>
  );
}