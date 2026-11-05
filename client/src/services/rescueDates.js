// Rescue forms use Singapore time, regardless of the device timezone.
export const RESCUE_TIME_ZONE = "Asia/Singapore";
export function validCalendarDay(day) {
  if (!Number.isFinite(Date.parse(`${day}T00:00:00Z`))) return false;
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
  );
}
export function rescueDate(value) {
  if (!value && value !== 0) return new Date(NaN);
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)?$/.test(value)
  ) {
    if (!validCalendarDay(value.slice(0, 10))) return new Date(NaN);
    return new Date(
      value.length === 10 ? `${value}T00:00:00+08:00` : `${value}+08:00`,
    );
  }
  return new Date(value);
}
export function singaporeInput(value) {
  const date = rescueDate(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: RESCUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function singaporeDateKey(value = new Date()) {
  return singaporeInput(value).slice(0, 10);
}
export function endOfExpiryDay(day) {
  if (!validCalendarDay(day)) throw new Error("Choose a valid expiry date.");
  return new Date(`${day}T23:59:59.999+08:00`).toISOString();
}
export function inventoryExpiryDay(item) {
  const value = item?.expiresAt || item?.expiresAtISO;
  if (!value) return "";
  const day = (
    value instanceof Date ? value.toISOString() : String(value)
  ).slice(0, 10);
  return validCalendarDay(day) ? day : "";
}
