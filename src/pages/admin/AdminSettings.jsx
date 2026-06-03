import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Database, Mail, Link2, Globe, Info } from "lucide-react";
import GradientHeader from "@/components/shared/GradientHeader";

export default function AdminSettings() {
  return (
    <div className="space-y-6 max-w-4xl">
      <GradientHeader title="Settings" subtitle="Configure system connections, matching rules, and portal visibility." />

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Database className="w-5 h-5 text-orange-500" /> Supabase Connection
          </CardTitle>
          <CardDescription>Configure your Supabase database connection for booking data sync.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Supabase URL</Label>
            <Input placeholder="https://your-project.supabase.co" />
          </div>
          <div className="space-y-2">
            <Label>Anon Key</Label>
            <Input placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..." type="password" />
          </div>
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-700">Supabase integration will be available once backend functions are enabled. Contact support for setup assistance.</p>
          </div>
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">Save Connection</Button>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Mail className="w-5 h-5 text-orange-500" /> Email Parsing Rules
          </CardTitle>
          <CardDescription>Configure how emails are parsed for booking data extraction.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div>
              <p className="font-medium text-sm">Auto-detect PNR from subject</p>
              <p className="text-xs text-muted-foreground">Parse 6-character alphanumeric PNR codes from email subject lines</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div>
              <p className="font-medium text-sm">Auto-detect ticket numbers</p>
              <p className="text-xs text-muted-foreground">Parse 13-digit ticket numbers from email body</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div>
              <p className="font-medium text-sm">Auto-detect flight numbers</p>
              <p className="text-xs text-muted-foreground">Parse airline code + flight number combinations</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Link2 className="w-5 h-5 text-orange-500" /> Matching Priority Rules
          </CardTitle>
          <CardDescription>Configure the priority order for email-to-booking matching.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/50">
              <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-sm">1</span>
              <div>
                <p className="font-medium text-sm">Match by PNR</p>
                <p className="text-xs text-muted-foreground">Exact PNR match (highest priority)</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/50">
              <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-sm">2</span>
              <div>
                <p className="font-medium text-sm">Match by Ticket Number</p>
                <p className="text-xs text-muted-foreground">Exact ticket number match</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/50">
              <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-sm">3</span>
              <div>
                <p className="font-medium text-sm">Match by Flight + Passenger</p>
                <p className="text-xs text-muted-foreground">Flight number + passenger name combination</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 rounded-xl bg-muted/50">
              <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">4</span>
              <div>
                <p className="font-medium text-sm">Mark as Possible Match / Unmatched</p>
                <p className="text-xs text-muted-foreground">Requires manual admin review</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle className="text-base font-display flex items-center gap-2">
            <Globe className="w-5 h-5 text-orange-500" /> Customer Portal Visibility
          </CardTitle>
          <CardDescription>Control what customers can see on the public portal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div>
              <p className="font-medium text-sm">Show flight details</p>
              <p className="text-xs text-muted-foreground">Display flight numbers, airlines, and schedules</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div>
              <p className="font-medium text-sm">Show hotel details</p>
              <p className="text-xs text-muted-foreground">Display hotel name, check-in/out dates</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div>
              <p className="font-medium text-sm">Show travel timeline</p>
              <p className="text-xs text-muted-foreground">Display published timeline events</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
            <div>
              <p className="font-medium text-sm">Show voucher downloads</p>
              <p className="text-xs text-muted-foreground">Allow customers to download vouchers and itineraries</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}