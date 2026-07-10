import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User } from "lucide-react";

export default function PassengerList({ passengers }) {
  if (!passengers || passengers.length === 0) return null;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <User className="w-5 h-5 text-orange-500" />
          Passengers
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {passengers.map((name, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center text-white font-bold text-sm">
                {name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <span className="font-medium text-sm">{name}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}