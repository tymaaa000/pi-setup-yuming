import assert from "node:assert/strict";
import { test } from "node:test";
import { failureReason } from "./failure.js";
import { HttpError } from "./source.js";

test("failureReason reports the HTTP status", () => {
  assert.equal(failureReason(new HttpError(429)), "HTTP 429");
});

test("failureReason reports timeouts", () => {
  const abort = new Error("This operation was aborted");
  abort.name = "AbortError";
  assert.equal(failureReason(abort), "timeout");
});

test("failureReason unwraps the fetch cause code", () => {
  const cause = Object.assign(new Error("socket disconnected"), {
    code: "ECONNRESET",
  });
  const err = Object.assign(new TypeError("fetch failed"), { cause });
  assert.equal(failureReason(err), "TypeError: fetch failed [ECONNRESET]");
});

test("failureReason unwraps AggregateError causes", () => {
  const cause = new AggregateError([
    Object.assign(new Error("getaddrinfo ENOTFOUND chatgpt.com"), {
      code: "ENOTFOUND",
    }),
  ]);
  const err = Object.assign(new TypeError("fetch failed"), { cause });
  assert.equal(failureReason(err), "TypeError: fetch failed [ENOTFOUND]");
});

test("failureReason falls back to the cause message", () => {
  const cause = new Error("Client network socket disconnected before TLS");
  const err = Object.assign(new TypeError("fetch failed"), { cause });
  const reason = failureReason(err);
  assert.ok(
    reason.startsWith("TypeError: fetch failed [Client network socket"),
  );
  assert.ok(reason.length <= 48);
});

test("failureReason falls back to the error itself", () => {
  assert.equal(
    failureReason(new TypeError("fetch failed")),
    "TypeError: fetch failed",
  );
  assert.equal(failureReason(undefined), "error");
});
