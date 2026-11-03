export const DEFAULT_CENTRE = { lat: 1.3008, lng: 103.8555 };
export function validPoint(coordinates) {
  return (
    Array.isArray(coordinates) &&
    coordinates.length === 2 &&
    coordinates.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    ) &&
    coordinates[0] >= -180 &&
    coordinates[0] <= 180 &&
    coordinates[1] >= -90 &&
    coordinates[1] <= 90
  );
}
export function distanceKm(origin, coordinates) {
  const rad = (value) => (value * Math.PI) / 180;
  const [lng, lat] = coordinates,
    dLat = rad(lat - origin.lat),
    dLng = rad(lng - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(origin.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export function distanceLabel(km) {
  if (!Number.isFinite(km)) return "Distance unavailable";
  return km < 1
    ? `${Math.round(km * 1000)} m`
    : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
export function dayWindow(day, now = new Date()) {
  if (day === "any") return {};
  if (!["today", "tomorrow"].includes(day))
    throw new Error("Invalid pickup day.");
  const offset = day === "tomorrow" ? 1 : 0;
  // Local calendar boundaries, including daylight-saving transitions.
  return {
    pickupFrom: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
    ).toISOString(),
    pickupUntil: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset + 1,
    ).toISOString(),
  };
}
export function boundsForApi(bounds) {
  const west = bounds.getWest(),
    east = bounds.getEast(),
    south = Math.max(-90, bounds.getSouth()),
    north = Math.min(90, bounds.getNorth());
  if (
    ![west, east, south, north].every(Number.isFinite) ||
    south >= north ||
    west >= east
  )
    throw new Error("Choose a valid map area.");
  if (east - west >= 360) return { west: -180, east: 180, south, north };
  if (west < -180 || east > 180)
    throw new Error(
      "This view crosses the date line. Move or zoom the map to search one side at a time.",
    );
  return { west, east, south, north };
}
export function requestPayload(
  { start, end, message, listing },
  now = Date.now(),
) {
  let pickupStart = new Date(start),
    pickupEnd = new Date(end);
  if (
    !start ||
    !end ||
    !Number.isFinite(pickupStart.getTime()) ||
    !Number.isFinite(pickupEnd.getTime())
  )
    throw new Error("Enter both pickup dates and times.");
  if (pickupEnd <= pickupStart || pickupEnd.getTime() <= now)
    throw new Error("Pickup must end in the future and after its start.");
  if (pickupEnd > new Date(listing.expiresAt))
    throw new Error(
      "Your requested pickup must end on or before the use-by time.",
    );
  if (typeof message !== "string" || message.length > 1000)
    throw new Error("Keep your message to 1,000 characters or fewer.");
  return {
    pickupStart: pickupStart.toISOString(),
    pickupEnd: pickupEnd.toISOString(),
    message: message.trim(),
  };
}
