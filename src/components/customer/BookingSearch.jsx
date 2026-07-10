import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Ticket, Hash, Mail, Loader2 } from "lucide-react";

export default function BookingSearch({ onSearch, isLoading }) {
  const [searchType, setSearchType] = useState("pnr");
  const [pnr, setPnr] = useState("");
  const [gdxNumber, setGdxNumber] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");
  const [email, setEmail] = useState("");
  const [lastName, setLastName] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const params = { type: searchType };
    if (searchType === "pnr") params.pnr = pnr.toUpperCase().trim();
    else if (searchType === "gdx") params.gdx_booking_number = gdxNumber.trim();
    else if (searchType === "ticket") params.ticket_number = ticketNumber.trim();
    else if (searchType === "email") {
      params.customer_email = email.trim().toLowerCase();
      params.last_name = lastName.trim();
    }
    onSearch(params);
  };

  return (
    <Card className="shadow-lg border-0 bg-card/80 backdrop-blur-sm">
      <CardContent className="p-6 md:p-8">
        <h2 className="text-lg font-heading font-semibold mb-1">Find Your Booking</h2>
        <p className="text-sm text-muted-foreground mb-6">Search using any of the methods below</p>

        <Tabs value={searchType} onValueChange={setSearchType}>
          <TabsList className="grid grid-cols-4 mb-6 bg-muted/60">
            <TabsTrigger value="pnr" className="text-xs md:text-sm gap-1.5">
              <Hash className="w-3.5 h-3.5 hidden md:block" />PNR
            </TabsTrigger>
            <TabsTrigger value="gdx" className="text-xs md:text-sm gap-1.5">
              <Ticket className="w-3.5 h-3.5 hidden md:block" />GDX#
            </TabsTrigger>
            <TabsTrigger value="ticket" className="text-xs md:text-sm gap-1.5">
              <Ticket className="w-3.5 h-3.5 hidden md:block" />Ticket
            </TabsTrigger>
            <TabsTrigger value="email" className="text-xs md:text-sm gap-1.5">
              <Mail className="w-3.5 h-3.5 hidden md:block" />Email
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit}>
            <TabsContent value="pnr">
              <div className="space-y-2">
                <Label htmlFor="pnr">PNR (Passenger Name Record)</Label>
                <Input id="pnr" placeholder="e.g. ABC123" value={pnr} onChange={(e) => setPnr(e.target.value)} className="h-12 text-lg tracking-widest uppercase" />
              </div>
            </TabsContent>
            <TabsContent value="gdx">
              <div className="space-y-2">
                <Label htmlFor="gdx">GDX Booking Number</Label>
                <Input id="gdx" placeholder="e.g. GDX-2025-0001" value={gdxNumber} onChange={(e) => setGdxNumber(e.target.value)} className="h-12" />
              </div>
            </TabsContent>
            <TabsContent value="ticket">
              <div className="space-y-2">
                <Label htmlFor="ticket">Ticket Number</Label>
                <Input id="ticket" placeholder="e.g. 0791234567890" value={ticketNumber} onChange={(e) => setTicketNumber(e.target.value)} className="h-12" />
              </div>
            </TabsContent>
            <TabsContent value="email">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input id="lastName" placeholder="Your last name" value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-12" />
                </div>
              </div>
            </TabsContent>

            <Button type="submit" className="w-full mt-6 h-12 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold text-base shadow-lg shadow-orange-500/20" disabled={isLoading}>
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Search className="w-5 h-5 mr-2" />}
              Search Booking
            </Button>
          </form>
        </Tabs>
      </CardContent>
    </Card>
  );
}