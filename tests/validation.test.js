import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPasswordPolicy,
  isEthAddress,
  isUuid,
  normalizeSlug,
  sanitizeText,
} from "../api/_lib/validation.js";

test("sanitizeText strips unsafe characters and trims", () => {
  const value = sanitizeText("  <script>alert('x')</script>  ", { maxLength: 100 });
  assert.equal(value.includes("<"), false);
  assert.equal(value.includes(">"), false);
  assert.equal(value.startsWith("script"), true);
});

test("normalizeSlug generates URL-safe slug", () => {
  assert.equal(normalizeSlug("College of Engineering & Tech"), "college-of-engineering-tech");
});

test("UUID and Ethereum validators match expected formats", () => {
  assert.equal(isUuid("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isEthAddress("0x1111111111111111111111111111111111111111"), true);
  assert.equal(isEthAddress("0x123"), false);
});

test("password policy rejects weak passwords and allows strong passwords", () => {
  assert.throws(() => assertPasswordPolicy("weakpass"), /Password policy violation/);
  assert.doesNotThrow(() => assertPasswordPolicy("StrongPass!2026"));
});

