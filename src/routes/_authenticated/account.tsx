import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { useTheme, type AccentColor, type ThemeMode, type Density } from "@/lib/theme";
import { Sun, Moon, Monitor, Upload, Loader2, KeyRound, User as UserIcon, Palette, CalendarDays, Copy, RefreshCw, Trash2 } from "lucide-react";
import { getMyCalendarFeed, rotateCalendarFeed, revokeCalendarFeed } from "@/lib/calendar-feed.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/account")({
  component: AccountPage,
});

function AccountPage() {
  return (
    <div>
      <PageHeader title="Account" subtitle="Manage your profile, password and appearance" />
      <div className="mx-auto max-w-5xl p-8">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList>
            <TabsTrigger value="profile"><UserIcon className="mr-2 h-3.5 w-3.5" />Profile</TabsTrigger>
            <TabsTrigger value="security"><KeyRound className="mr-2 h-3.5 w-3.5" />Password</TabsTrigger>
            <TabsTrigger value="calendar"><CalendarDays className="mr-2 h-3.5 w-3.5" />Calendar</TabsTrigger>
            <TabsTrigger value="appearance"><Palette className="mr-2 h-3.5 w-3.5" />Appearance</TabsTrigger>
          </TabsList>
          <TabsContent value="profile"><ProfileTab /></TabsContent>
          <TabsContent value="security"><SecurityTab /></TabsContent>
          <TabsContent value="calendar"><CalendarTab /></TabsContent>
          <TabsContent value="appearance"><AppearanceTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ProfileTab() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);
  const { data: profile, isLoading } = useQuery({ queryKey: ["my-profile"], queryFn: () => fetchProfile() });

  const [form, setForm] = useState({ full_name: "", designation: "", phone: "", bio: "", avatar_url: "" });
  const [initial, setInitial] = useState(form);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      const next = {
        full_name: profile.full_name ?? "",
        designation: profile.designation ?? "",
        phone: profile.phone ?? "",
        bio: profile.bio ?? "",
        avatar_url: profile.avatar_url ?? "",
      };
      setForm(next);
      setInitial(next);
    }
  }, [profile]);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const save = useMutation({
    mutationFn: () => {
      const trimmed = {
        full_name: form.full_name.trim(),
        designation: form.designation.trim(),
        phone: form.phone.trim(),
        bio: form.bio.trim(),
        avatar_url: form.avatar_url,
      };
      if (!trimmed.full_name) throw new Error("Full name is required");
      return saveProfile({ data: trimmed });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const MAX_BYTES = 2 * 1024 * 1024;
  const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

  const onUpload = async (file: File) => {
    if (!ALLOWED.includes(file.type)) return toast.error("Only PNG, JPG or WebP allowed");
    if (file.size > MAX_BYTES) return toast.error("Image must be 2 MB or smaller");
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr) throw sErr;
      setForm((f) => ({ ...f, avatar_url: signed.signedUrl }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const initials = (form.full_name || "?").split(/\s+/).map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  if (isLoading) return <Card className="p-6"><Loader2 className="h-4 w-4 animate-spin" /></Card>;

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20">
          {form.avatar_url && <AvatarImage src={form.avatar_url} alt={form.full_name} />}
          <AvatarFallback className="bg-primary/20 text-primary text-lg font-semibold">{initials}</AvatarFallback>
        </Avatar>
        <div className="space-y-1">
          <div className="text-sm font-medium">Profile photo</div>
          <div className="text-xs text-muted-foreground">PNG or JPG, up to 2 MB</div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-2 h-3.5 w-3.5" />}
              Upload
            </Button>
            {form.avatar_url && (
              <Button size="sm" variant="ghost" onClick={() => setForm((f) => ({ ...f, avatar_url: "" }))}>Remove</Button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Full name</Label>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Designation</Label>
          <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Customer Success Manager" />
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 0100" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Bio</Label>
        <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={4} placeholder="Tell your team a bit about yourself" />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending || !dirty || !form.full_name.trim()}>
          {save.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Save changes
        </Button>
      </div>
    </Card>
  );
}

function SecurityTab() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (pw.length < 8) return toast.error("Password must be at least 8 characters");
    if (pw !== confirm) return toast.error("Passwords do not match");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSaving(false);
    if (error) return toast.error(error.message);
    setPw(""); setConfirm("");
  };

  return (
    <Card className="p-6 space-y-4 max-w-xl">
      <div>
        <div className="text-sm font-medium">Change password</div>
        <div className="text-xs text-muted-foreground">Use at least 8 characters. You'll stay signed in on this device.</div>
      </div>
      <div className="space-y-1.5">
        <Label>New password</Label>
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      </div>
      <div className="space-y-1.5">
        <Label>Confirm password</Label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={saving || pw.length < 8 || pw !== confirm}>
          {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
          Update password
        </Button>
      </div>
    </Card>
  );
}

const ACCENTS: { value: AccentColor; label: string; swatch: string }[] = [
  { value: "purple", label: "Purple", swatch: "oklch(0.72 0.16 275)" },
  { value: "blue",   label: "Blue",   swatch: "oklch(0.65 0.18 240)" },
  { value: "green",  label: "Green",  swatch: "oklch(0.68 0.16 155)" },
  { value: "orange", label: "Orange", swatch: "oklch(0.72 0.17 55)" },
  { value: "red",    label: "Red",    swatch: "oklch(0.62 0.22 25)" },
  { value: "gold",   label: "Gold",   swatch: "oklch(0.78 0.15 85)" },
];

const MODES: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
];

function AppearanceTab() {
  const { prefs, update, reset } = useTheme();
  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-4">
        <div>
          <div className="text-sm font-medium">Theme</div>
          <div className="text-xs text-muted-foreground">Light, dark, or follow your OS.</div>
        </div>
        <div className="grid grid-cols-3 gap-2 max-w-md">
          {MODES.map(({ value, label, Icon }) => (
            <button
              key={value}
              onClick={() => update({ mode: value })}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border p-4 text-xs transition-all",
                prefs.mode === value ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:border-border/80",
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <div className="text-sm font-medium">Accent color</div>
          <div className="text-xs text-muted-foreground">Applies across buttons, links and highlights.</div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 max-w-2xl">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              onClick={() => update({ accent: a.value })}
              className={cn(
                "group flex flex-col items-center gap-2 rounded-lg border p-3 text-xs transition-all",
                prefs.accent === a.value ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-border/80",
              )}
            >
              <span className="h-8 w-8 rounded-full ring-2 ring-background" style={{ background: a.swatch }} />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <div className="text-sm font-medium">Density</div>
          <div className="text-xs text-muted-foreground">Adjusts corner radius and overall spacing feel.</div>
        </div>
        <RadioGroup
          value={prefs.density}
          onValueChange={(v) => update({ density: v as Density })}
          className="grid max-w-md grid-cols-3 gap-2"
        >
          {(["compact", "cozy", "comfy"] as Density[]).map((d) => (
            <label
              key={d}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-xs capitalize transition-all",
                prefs.density === d ? "border-primary bg-primary/5" : "border-border hover:border-border/80",
              )}
            >
              <RadioGroupItem value={d} />
              {d}
            </label>
          ))}
        </RadioGroup>
      </Card>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={reset}>Reset to defaults</Button>
      </div>
    </div>
  );
}

function CalendarTab() {
  const qc = useQueryClient();
  const fetchFeed = useServerFn(getMyCalendarFeed);
  const rotate = useServerFn(rotateCalendarFeed);
  const revoke = useServerFn(revokeCalendarFeed);

  const { data, isLoading } = useQuery({
    queryKey: ["my-calendar-feed"],
    queryFn: () => fetchFeed(),
  });

  const rotateMut = useMutation({
    mutationFn: () => rotate(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-calendar-feed"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not rotate link"),
  });

  const revokeMut = useMutation({
    mutationFn: () => revoke(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-calendar-feed"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not revoke link"),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const feedUrl = data?.token ? `${origin}/api/public/calendar/${data.token}.ics` : null;
  const webcalUrl = feedUrl ? feedUrl.replace(/^https?:/, "webcal:") : null;

  const copy = (v: string) => {
    navigator.clipboard.writeText(v).then(() => {});
  };

  return (
    <div className="space-y-4">
      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">Calendar subscription</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Subscribe to a live feed of your coaching sessions in Outlook, Google Calendar, or Apple Calendar.
              Changes made in QualiPulse appear automatically — no import needed.
            </p>
          </div>
          {feedUrl ? (
            <Button variant="outline" size="sm" onClick={() => rotateMut.mutate()} disabled={rotateMut.isPending}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Rotate link
            </Button>
          ) : (
            <Button size="sm" onClick={() => rotateMut.mutate()} disabled={rotateMut.isPending}>
              {rotateMut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="mr-1.5 h-3.5 w-3.5" />}
              Generate my link
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : feedUrl ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">HTTPS URL (Google, Outlook Web)</Label>
              <div className="flex gap-2">
                <Input readOnly value={feedUrl} className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => copy(feedUrl)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">webcal:// URL (Apple Calendar, Outlook desktop)</Label>
              <div className="flex gap-2">
                <Input readOnly value={webcalUrl ?? ""} className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => webcalUrl && copy(webcalUrl)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">How to subscribe:</strong>
              <ul className="mt-2 list-disc pl-4 space-y-1">
                <li><span className="text-foreground">Google Calendar</span> — Other calendars → “From URL” → paste the HTTPS URL.</li>
                <li><span className="text-foreground">Outlook Web / 365</span> — Add calendar → Subscribe from web → paste HTTPS URL.</li>
                <li><span className="text-foreground">Apple Calendar / Outlook desktop</span> — File → New calendar subscription → paste the webcal:// URL.</li>
              </ul>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                Anyone with this link can view your session titles and times — keep it private.
              </p>
              <Button variant="ghost" size="sm" onClick={() => revokeMut.mutate()} disabled={revokeMut.isPending} className="text-destructive hover:text-destructive">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Revoke
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Generate a personal link to subscribe your calendar app to QualiPulse coaching sessions.
          </p>
        )}
      </Card>
    </div>
  );
}
