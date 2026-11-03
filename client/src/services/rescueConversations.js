import { photoUrl } from "./rescueApi.js";
export const entityId = (value) => String(value?._id || value || "");
export function dateTimeLabel(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-SG", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }).format(date)
    : "Not set";
}
export const windowLabel = (start, end) =>
  `${dateTimeLabel(start)} – ${dateTimeLabel(end)}`;
export function statusText(request, direction) {
  if (request.status === "accepted") return "Pickup confirmed";
  if (request.status === "completed") return "Collected";
  if (request.status === "declined") return "Request declined";
  if (request.status === "cancelled") return "Request cancelled";
  if (request.pickupProposal) return "New time proposed";
  return direction === "sent" ? "Awaiting reply" : "Awaiting your reply";
}
export function groupRequests(records, direction) {
  const groups = new Map();
  for (const raw of records) {
    const listing = raw.listing,
      listingId = entityId(listing) || `missing-${raw._id}`;
    let group = groups.get(listingId);
    if (!group) {
      group = {
        id: listingId,
        direction,
        food: listing?.title || "Listing unavailable",
        quantity: listing ? `${listing.quantity} ${listing.unit}` : "",
        image: photoUrl(listing),
        preferredPickup: listing
          ? windowLabel(listing.pickupStart, listing.pickupEnd)
          : "Unavailable",
        requests: [],
      };
      groups.set(listingId, group);
    }
    const person = direction === "received" ? raw.requester : raw.owner;
    const differentTime = Boolean(
      listing &&
      (Date.parse(raw.pickupStart) < Date.parse(listing.pickupStart) ||
        Date.parse(raw.pickupEnd) > Date.parse(listing.pickupEnd)),
    );
    group.requests.push({
      id: entityId(raw),
      person: person?.name || "Former user",
      status: raw.status,
      raw,
      differentTime,
      requestedPickup: windowLabel(raw.pickupStart, raw.pickupEnd),
      preview: statusText(raw, direction),
    });
  }
  return [...groups.values()];
}
export function makeClientKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
