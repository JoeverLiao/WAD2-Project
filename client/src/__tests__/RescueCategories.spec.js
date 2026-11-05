import { describe, expect, it } from "vitest";
import {
  CATEGORY_OPTIONS,
  categoryLabel,
} from "../services/rescueCategories.js";
import { validateForm } from "../services/rescueForm.js";
import { listingFields } from "../../../server/services/rescueValidation.js";

const form = {
  title: "Shared groceries",
  quantity: 1,
  unit: "portion",
  pickupLabel: "Lobby",
  latitude: 1.3,
  longitude: 103.8,
  expiresAt: "2099-11-05T15:59:59.999Z",
  pickupStart: "2099-11-05T17:00",
  pickupEnd: "2099-11-05T21:00",
};

describe("food rescue categories", () => {
  it.each(CATEGORY_OPTIONS)(
    "preserves $label through create and edit validation",
    ({ value, label }) => {
      const payload = validateForm({ ...form, category: value });
      expect(payload.category).toBe(value);
      expect(listingFields(payload, true).category).toBe(value);
      const update = listingFields(payload, false);
      expect(update.category).toBe(value);
      expect(categoryLabel(update.category)).toBe(label);
    },
  );
  it("defaults older forms to Other", () => {
    expect(validateForm(form).category).toBe("other");
  });
  it("rejects unsupported categories before submission", () => {
    expect(() => validateForm({ ...form, category: "invalid" })).toThrow(
      "Choose a valid food category.",
    );
  });
});
