import { fail } from "./rescueValidation.js";
// Inventory expiry is a calendar date, matching the fridge's displayed date.
export function inventoryExpiryDeadline(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) fail(400, "Invalid inventory expiry.");
  return new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999+08:00`);
}
export function validateLinkedExpiry(listingExpiry, inventoryExpiry) {
  const deadline = inventoryExpiryDeadline(inventoryExpiry);
  if (deadline && new Date(listingExpiry) > deadline)
    fail(400, "Listing expiry cannot be later than inventory expiry.");
}
