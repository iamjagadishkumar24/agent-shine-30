/**
 * Allowlist of notification types that represent meaningful business events.
 *
 * Routine successful CRUD outcomes (e.g. record updated, feedback completed,
 * coaching session completed) must never surface in the notification center;
 * the UI already refreshes in place after those actions.
 *
 * Backend triggers are the primary defense — this list is a defense-in-depth
 * filter applied when reading notifications, so historic routine rows also
 * stop appearing without a data backfill.
 */
export const MEANINGFUL_NOTIFICATION_TYPES = new Set<string>([
  // Feedback
  "feedback.sent", // new feedback assigned to an agent
  "feedback.acknowledged", // sender needs to know the agent responded
  "feedback.failed", // delivery warning — action required

  // Coaching
  "coaching.scheduled",
  "coaching.assigned",
  "coaching.cancelled",
  "coaching.rescheduled",

  // System / security (reserved for future events)
  "system.maintenance",
  "security.alert",
  "mention",
]);

export function isMeaningfulNotification(type: string | null | undefined): boolean {
  if (!type) return false;
  return MEANINGFUL_NOTIFICATION_TYPES.has(type);
}
