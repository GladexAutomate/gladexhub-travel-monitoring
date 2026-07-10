import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, ExternalLink } from "lucide-react";

export default function VoucherLinks({ booking }) {
  if (!booking.voucher_url && !booking.itinerary_url) return null;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display flex items-center gap-2">
          <FileText className="w-5 h-5 text-orange-500" />
          Documents
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {booking.voucher_url && (
          <a href={booking.voucher_url} target="_blank" rel="noopener noreferrer" className="block">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors group">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-50">
                  <Download className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Travel Voucher</p>
                  <p className="text-xs text-muted-foreground">Download your travel voucher</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-orange-500 transition-colors" />
            </div>
          </a>
        )}
        {booking.itinerary_url && (
          <a href={booking.itinerary_url} target="_blank" rel="noopener noreferrer" className="block">
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors group">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-50">
                  <FileText className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Itinerary</p>
                  <p className="text-xs text-muted-foreground">View your complete itinerary</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-orange-500 transition-colors" />
            </div>
          </a>
        )}
      </CardContent>
    </Card>
  );
}