import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inventoryExpiryDeadline,
  validateLinkedExpiry,
} from "../services/rescueExpiry.js";
test("linked expiry allows the entire inventory calendar day in Singapore", () => {
  const inventory = new Date("2026-11-05T00:00:00Z");
  assert.equal(
    inventoryExpiryDeadline(inventory).toISOString(),
    "2026-11-05T15:59:59.999Z",
  );
  assert.doesNotThrow(() =>
    validateLinkedExpiry("2026-11-05T15:59:59.999Z", inventory),
  );
  assert.throws(() => validateLinkedExpiry("2026-11-05T16:00:00Z", inventory));
  assert.doesNotThrow(() => validateLinkedExpiry("2026-11-05T16:00:00Z", null));
});
