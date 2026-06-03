import { Card, CardContent } from "@/components/ui/card";

export default function StatCard({ title, value, icon: Icon, trend, color = "orange" }) {
  const colorMap = {
    orange: "from-orange-500 to-amber-400",
    green: "from-emerald-500 to-teal-400",
    blue: "from-blue-500 to-indigo-400",
    red: "from-red-500 to-rose-400",
    purple: "from-purple-500 to-violet-400",
    amber: "from-amber-500 to-yellow-400",
  };

  return (
    <Card className="border-0 shadow-md overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
            <p className="text-3xl font-display font-bold mt-1">{value}</p>
            {trend && <p className="text-xs text-muted-foreground mt-1">{trend}</p>}
          </div>
          <div className={`p-3 rounded-xl bg-gradient-to-br ${colorMap[color]} shadow-lg`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}