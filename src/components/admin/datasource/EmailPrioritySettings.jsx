import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Mail } from "lucide-react";

const OPTIONS = ["PNR", "E-ticket", "GDX", "Customer Last Name + Travel Date"];

export default function EmailPrioritySettings({ settings, update }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4 text-orange-500" />
          Email Matching Priority
        </CardTitle>
        <p className="text-xs text-muted-foreground">Set the priority order for matching incoming emails to bookings.</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(p => (
          <div key={p}>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-xs px-1.5 py-0 font-mono">#{p}</Badge>
              <Label>Priority {p}</Label>
            </div>
            <Select value={settings[`email_priority_${p}`] || ""} onValueChange={v => update(`email_priority_${p}`, v)}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPTIONS.map(o => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}