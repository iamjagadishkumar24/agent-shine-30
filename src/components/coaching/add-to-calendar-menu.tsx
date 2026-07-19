import { CalendarPlus, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildIcs,
  downloadIcs,
  googleCalendarUrl,
  outlook365Url,
  outlookLiveUrl,
  type CalendarEvent,
} from "@/lib/calendar-links";

type Props = {
  event: CalendarEvent;
  triggerLabel?: string;
  size?: "sm" | "default";
  variant?: "outline" | "secondary" | "ghost" | "default";
};

/**
 * Universal "Add to Calendar" dropdown. Works from any coaching session without OAuth:
 * - Google Calendar / Outlook Web / Outlook.com — open the provider compose view in a new tab.
 * - Download .ics — opens Outlook desktop, Apple Calendar, and every RFC-5545 client.
 */
export function AddToCalendarMenu({ event, triggerLabel = "Add to calendar", size = "sm", variant = "outline" }: Props) {
  const open = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const download = () => {
    const ics = buildIcs([event], { method: "REQUEST" });
    downloadIcs(`${event.title.replace(/[^\w-]+/g, "-").slice(0, 60) || "coaching"}.ics`, ics);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className="gap-1.5">
          <CalendarPlus className="h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs">Open in…</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => open(googleCalendarUrl(event))}>
          <ExternalLink className="h-3.5 w-3.5" /> Google Calendar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(outlook365Url(event))}>
          <ExternalLink className="h-3.5 w-3.5" /> Outlook 365 (work)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(outlookLiveUrl(event))}>
          <ExternalLink className="h-3.5 w-3.5" /> Outlook.com (personal)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">Desktop calendar</DropdownMenuLabel>
        <DropdownMenuItem onSelect={download}>
          <Download className="h-3.5 w-3.5" /> Download .ics (Outlook, Apple, …)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
