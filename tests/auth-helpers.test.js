import test from "node:test";
import assert from "node:assert/strict";
import { getHeaderValue, parseAuthToken } from "../api/_lib/http.js";

test("getHeaderValue handles arrays and scalar values", () => {
  assert.equal(getHeaderValue(["alpha", "beta"]), "alpha");
  assert.equal(getHeaderValue("gamma"), "gamma");
  assert.equal(getHeaderValue(undefined), "");
});

test("parseAuthToken extracts bearer token safely", () => {
  const token = parseAuthToken({
    headers: {
      authorization: "Bearer test.jwt.token",
    },
  });
  assert.equal(token, "test.jwt.token");

  const missing = parseAuthToken({
    headers: {
      authorization: "Basic xyz",
    },
  });
  assert.equal(missing, "");
});

