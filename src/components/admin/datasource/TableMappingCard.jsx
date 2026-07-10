import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableIcon } from "lucide-react";

export default function TableMappingCard({ title, fields, settings, update }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TableIcon className="w-4 h-4 text-orange-500" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map(({ key, label, hint }) => (
          <div key={key} className={key.endsWith("_table") ? "md:col-span-2" : ""}>
            <Label>{label}</Label>
            <Input
              value={settings[key] || ""}
              onChange={e => update(key, e.target.value)}
              className="mt-1 font-mono text-sm"
            />
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}