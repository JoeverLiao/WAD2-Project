// Datetime-local inputs use the browser's timezone. API payloads use ISO instants.
export function toLocalInput(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function toISO(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime()))
    throw new Error("Enter a valid date and time.");
  return date.toISOString();
}
export function inventoryExpiry(item) {
  // The replacement store preserves the original API timestamp here.
  return item?.expiresAtISO || "";
}
export function validateForm(
  form,
  { linked = false, linkedExpiry = "", now = Date.now() } = {},
) {
  if (!form.title?.trim() || form.title.trim().length > 120)
    throw new Error("Enter a food name with at most 120 characters.");
  if (
    !Number.isFinite(Number(form.quantity)) ||
    Number(form.quantity) < 0.001 ||
    Number(form.quantity) > 1_000_000
  )
    throw new Error("Enter a quantity from 0.001 to 1,000,000.");
  if (!form.unit?.trim() || form.unit.trim().length > 40)
    throw new Error(
      "Enter a unit, such as pieces, cartons or kg (up to 40 characters).",
    );
  if ((form.description || "").length > 1000)
    throw new Error("Description must be at most 1,000 characters.");
  if (!form.pickupLabel?.trim() || form.pickupLabel.trim().length > 160)
    throw new Error(
      "Enter a pickup meeting point with at most 160 characters.",
    );
  if ((form.pickupInstructions || "").length > 500)
    throw new Error("Pickup instructions must be at most 500 characters.");
  for (const [name, value, min, max] of [
    ["latitude", form.latitude, -90, 90],
    ["longitude", form.longitude, -180, 180],
  ]) {
    if (
      value === "" ||
      value === null ||
      !Number.isFinite(Number(value)) ||
      Number(value) < min ||
      Number(value) > max
    )
      throw new Error(`Choose a valid pickup point (${name}).`);
  }
  const expiresAt = toISO(form.expiresAt),
    pickupStart = toISO(form.pickupStart),
    pickupEnd = toISO(form.pickupEnd);
  if (Date.parse(expiresAt) <= now)
    throw new Error("The use-by date and time must be in the future.");
  if (Date.parse(pickupEnd) <= now)
    throw new Error("The pickup window must end in the future.");
  if (Date.parse(pickupEnd) <= Date.parse(pickupStart))
    throw new Error("Pickup end must be after pickup start.");
  if (Date.parse(pickupEnd) > Date.parse(expiresAt))
    throw new Error("Pickup must end on or before the use-by time.");
  if (
    linked &&
    linkedExpiry &&
    Date.parse(expiresAt) > Date.parse(linkedExpiry)
  )
    throw new Error("Use-by cannot be later than the inventory expiry.");
  return {
    title: form.title.trim(),
    description: (form.description || "").trim(),
    quantity: Number(form.quantity),
    unit: form.unit.trim(),
    expiresAt,
    pickupLabel: form.pickupLabel.trim(),
    pickupInstructions: (form.pickupInstructions || "").trim(),
    pickupStart,
    pickupEnd,
    latitude: Number(form.latitude),
    longitude: Number(form.longitude),
  };
}
export function displayStatus(item, now = Date.now()) {
  if (
    item.status === "available" &&
    (Date.parse(item.expiresAt) <= now || Date.parse(item.pickupEnd) <= now)
  )
    return "expired";
  return item.status;
}
export function summariseRequests(requests) {
  const counts = new Map();
  for (const request of requests) {
    const id = String(request.listing?._id || request.listing);
    const count = counts.get(id) || { total: 0, pending: 0, accepted: 0 };
    count.total += 1;
    if (request.status === "pending") count.pending += 1;
    if (request.status === "accepted") count.accepted += 1;
    counts.set(id, count);
  }
  return counts;
}
