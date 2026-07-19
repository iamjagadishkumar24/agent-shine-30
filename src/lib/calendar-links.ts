// Client- and server-safe helpers to export a coaching session to external calendars.
// - Deep links open the compose view in Outlook Web / Outlook.com / Google Calendar.
// - buildIcs() emits an RFC-5545 VCALENDAR the browser can download; opens in Outlook desktop,
//   Apple Calendar, and every standards-compliant client.

export type CalendarEvent = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startISO: string; // ISO 8601 UTC or with tz offset
  endISO: string;
  organizerEmail?: string;
  organizerName?: string;
  attendees?: Array<{ email: string; name?: string }>;
  reminderMinutes?: number | null;
  url?: string; // meeting link
};

// -------- .ics generation (RFC 5545) ---------------------------------------

const foldLine = (line: string): string => {
  // Fold at 75 octets per RFC 5545 §3.1.
  if (line.length <= 75) return line;
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  out.push(rest);
  return out.join("\r\n");
};

const escapeText = (v: string): string =>
  v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

const toIcsDate = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    "T" +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds()) +
    "Z"
  );
};

export function buildIcs(events: CalendarEvent[], opts?: { method?: "PUBLISH" | "REQUEST"; prodId?: string }): string {
  const method = opts?.method ?? "PUBLISH";
  const prodId = opts?.prodId ?? "-//Zenwork Performance Manager//Coaching//EN";
  const now = toIcsDate(new Date().toISOString());

  const blocks: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "X-WR-CALNAME:Zenwork Coaching",
    "X-WR-TIMEZONE:UTC",
  ];

  for (const e of events) {
    blocks.push("BEGIN:VEVENT");
    blocks.push(`UID:${e.uid}`);
    blocks.push(`DTSTAMP:${now}`);
    blocks.push(`DTSTART:${toIcsDate(e.startISO)}`);
    blocks.push(`DTEND:${toIcsDate(e.endISO)}`);
    blocks.push(foldLine(`SUMMARY:${escapeText(e.title)}`));
    if (e.description) blocks.push(foldLine(`DESCRIPTION:${escapeText(e.description)}`));
    if (e.location) blocks.push(foldLine(`LOCATION:${escapeText(e.location)}`));
    if (e.url) blocks.push(foldLine(`URL:${e.url}`));
    if (e.organizerEmail) {
      const cn = e.organizerName ? `;CN=${escapeText(e.organizerName)}` : "";
      blocks.push(`ORGANIZER${cn}:mailto:${e.organizerEmail}`);
    }
    for (const a of e.attendees ?? []) {
      const cn = a.name ? `;CN=${escapeText(a.name)}` : "";
      blocks.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE${cn}:mailto:${a.email}`);
    }
    blocks.push("STATUS:CONFIRMED");
    blocks.push("TRANSP:OPAQUE");
    if (e.reminderMinutes && e.reminderMinutes > 0) {
      blocks.push("BEGIN:VALARM");
      blocks.push(`TRIGGER:-PT${e.reminderMinutes}M`);
      blocks.push("ACTION:DISPLAY");
      blocks.push(foldLine(`DESCRIPTION:${escapeText(e.title)}`));
      blocks.push("END:VALARM");
    }
    blocks.push("END:VEVENT");
  }

  blocks.push("END:VCALENDAR");
  return blocks.join("\r\n") + "\r\n";
}

// -------- Deep links --------------------------------------------------------

export function googleCalendarUrl(e: CalendarEvent): string {
  const fmt = (iso: string) => toIcsDate(iso); // Google accepts YYYYMMDDTHHMMSSZ
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${fmt(e.startISO)}/${fmt(e.endISO)}`,
  });
  if (e.description) params.set("details", e.description + (e.url ? `\n\nJoin: ${e.url}` : ""));
  if (e.location) params.set("location", e.location);
  if (e.attendees?.length) params.set("add", e.attendees.map((a) => a.email).join(","));
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

const outlookDeepLink = (host: "outlook.office.com" | "outlook.live.com", e: CalendarEvent): string => {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.title,
    startdt: e.startISO,
    enddt: e.endISO,
  });
  const body = (e.description ?? "") + (e.url ? `\n\nJoin: ${e.url}` : "");
  if (body.trim()) params.set("body", body);
  if (e.location) params.set("location", e.location);
  if (e.attendees?.length) params.set("to", e.attendees.map((a) => a.email).join(";"));
  return `https://${host}/calendar/0/deeplink/compose?${params.toString()}`;
};

export const outlook365Url = (e: CalendarEvent): string => outlookDeepLink("outlook.office.com", e);
export const outlookLiveUrl = (e: CalendarEvent): string => outlookDeepLink("outlook.live.com", e);

// -------- Download helper (browser) ----------------------------------------

export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
