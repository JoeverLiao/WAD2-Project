import { describe, it, expect } from "vitest";
import {
  toISO,
  toLocalInput,
  inventoryExpiry,
  validateForm,
} from "../services/rescueForm.js";
import { dayWindow } from "../services/rescueMap.js";
import { endOfExpiryDay } from "../services/rescueDates.js";
describe("Singapore rescue listing dates", () => {
  it("roundtrips pickup inputs without using the device timezone", () => {
    expect(toISO("2026-11-05T17:00")).toBe("2026-11-05T09:00:00.000Z");
    expect(toLocalInput("2026-11-05T09:00:00.000Z")).toBe("2026-11-05T17:00");
  });
  it("uses the end of the inventory calendar day", () => {
    expect(inventoryExpiry({ expiresAt: "2026-11-05" })).toBe(
      "2026-11-05T15:59:59.999Z",
    );
    expect(inventoryExpiry({ expiresAtISO: "2026-11-05T00:00:00.000Z" })).toBe(
      "2026-11-05T15:59:59.999Z",
    );
    expect(inventoryExpiry({})).toBe("");
    expect(() => endOfExpiryDay("2026-02-30")).toThrow();
  });
  it("allows evening collection on the expiry date", () => {
    const expiresAt = endOfExpiryDay("2026-11-05");
    const form = {
      title: "Milk",
      quantity: 1,
      unit: "carton",
      pickupLabel: "Lobby",
      latitude: 1.3,
      longitude: 103.8,
      expiresAt,
      pickupStart: "2026-11-05T17:00",
      pickupEnd: "2026-11-05T21:00",
    };
    expect(
      validateForm(form, {
        linked: true,
        linkedExpiry: expiresAt,
        now: Date.parse("2026-11-05T04:00:00Z"),
      }).pickupEnd,
    ).toBe("2026-11-05T13:00:00.000Z");
    expect(() =>
      validateForm(
        { ...form, pickupEnd: "2026-11-06T01:00" },
        { now: Date.parse("2026-11-05T04:00:00Z") },
      ),
    ).toThrow();
  });
  it("uses Singapore midnight for day filtering", () => {
    expect(dayWindow("today", new Date("2026-11-05T18:00:00Z"))).toEqual({
      pickupFrom: "2026-11-05T16:00:00.000Z",
      pickupUntil: "2026-11-06T16:00:00.000Z",
    });
  });
});
