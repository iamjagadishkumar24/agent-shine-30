// File-upload validation shared by client + server. Enforces:
//   - explicit allowlist of extensions + MIME types
//   - maximum file size
//   - magic-byte sniff to catch MIME/extension spoofing
//   - safe randomized storage path (no user-controlled filename)
//
// The set of allowed types is intentionally narrow. Add types only after
// explicit product review.

export const FEEDBACK_ATTACHMENT_ALLOWED = {
  extensions: ["pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "csv"],
  mimeTypes: [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "text/plain",
    "text/csv",
  ],
  maxBytes: 10 * 1024 * 1024, // 10 MB
} as const;

// Magic-byte signatures. Text formats (txt/csv) have no reliable signature;
// we accept them only when Content-Type + extension both match the allowlist.
const MAGIC: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/png",       bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg",      bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif",       bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/webp",      bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF (WEBP has WEBP at offset 8)
];

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

/** Client-side pre-flight (fast, cheap). */
export function validateFileMeta(file: {
  name: string;
  size: number;
  type: string;
}): { ok: true } | { ok: false; reason: string } {
  const ext = extOf(file.name);
  if (!FEEDBACK_ATTACHMENT_ALLOWED.extensions.includes(ext as never)) {
    return { ok: false, reason: "This file type is not supported." };
  }
  if (!FEEDBACK_ATTACHMENT_ALLOWED.mimeTypes.includes(file.type as never)) {
    return { ok: false, reason: "This file type is not supported." };
  }
  if (file.size > FEEDBACK_ATTACHMENT_ALLOWED.maxBytes) {
    return { ok: false, reason: "File exceeds the maximum size." };
  }
  if (file.name.length > 200) {
    return { ok: false, reason: "Filename is too long." };
  }
  if (/[\x00-\x1f/\\]/.test(file.name)) {
    return { ok: false, reason: "Filename contains unsupported characters." };
  }
  return { ok: true };
}

/** Server-side magic-byte sniff. Buffer is the first ~16 bytes of the file. */
export function sniffMagicBytes(head: Uint8Array, claimedMime: string): boolean {
  // Text formats: accept without a signature check (they have none).
  if (claimedMime === "text/plain" || claimedMime === "text/csv") return true;
  for (const sig of MAGIC) {
    if (sig.mime !== claimedMime) continue;
    const off = sig.offset ?? 0;
    if (head.length < off + sig.bytes.length) continue;
    let ok = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (head[off + i] !== sig.bytes[i]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/** Randomized, path-traversal-safe storage key. */
export function makeStorageKey(userId: string, originalName: string): string {
  const ext = extOf(originalName);
  const safeExt = FEEDBACK_ATTACHMENT_ALLOWED.extensions.includes(ext as never)
    ? ext
    : "bin";
  const rand =
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36);
  return `${userId}/${rand}.${safeExt}`;
}
