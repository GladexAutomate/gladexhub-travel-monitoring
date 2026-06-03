import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link2 } from "lucide-react";

const KEYS = ["gdx", "record_id", "dashboard_id", "id", "booking_id"];

export default function RelationshipSettings({ settings, update }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="w-4 h-4 text-orange-500" />
          Relationship / Join Settings
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Key used to join related tables. Fallback order: <code className="bg-muted px-1 rounded">gdx</code> → <code className="bg-muted px-1 rounded">record_id</code> → <code className="bg-muted px-1 rounded">dashboard_id</code>
        </p>
      </CardHeader>
      <CardContent>
        <div className="max-w-xs">
          <Label>Relationship Key</Label>
          <Select value={settings.relationship_key || "gdx"} onValueChange={v => update("relationship_key", v)}>
            <SelectTrigger className="mt-1 font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KEYS.map(k => (
                <SelectItem key={k} value={k} className="font-mono">{k}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}