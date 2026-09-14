import assert from "node:assert/strict";
import { test } from "node:test";
import { largeReadReason, normalizeSearchInput } from "./core.ts";

test("search inputs stay within the output budget", () => {
	assert.deepEqual(normalizeSearchInput({ limit: 50, context: 20 }), {
		limit: 20,
		context: 3,
	});
	assert.deepEqual(normalizeSearchInput({ limit: 5, context: 1 }), {
		limit: 5,
		context: 1,
	});
});

test("small files remain directly readable", () => {
	assert.equal(largeReadReason({ path: "small.ts" }, 32 * 1024), undefined);
});

test("large unbounded reads are blocked", () => {
	const reason = largeReadReason({ path: "large.log" }, 100 * 1024);
	assert.match(reason ?? "", /Direct read blocked/);
	assert.match(reason ?? "", /ffgrep/);
});

test("bounded large reads remain available", () => {
	assert.match(
		largeReadReason({ path: "large.log", offset: 1 }, 100 * 1024) ?? "",
		/Direct read blocked/,
	);
	assert.equal(
		largeReadReason({ path: "large.log", offset: 1, limit: 200 }, 100 * 1024),
		undefined,
	);
	assert.match(
		largeReadReason({ path: "large.log", limit: 1000 }, 100 * 1024) ?? "",
		/Direct read blocked/,
	);
});
