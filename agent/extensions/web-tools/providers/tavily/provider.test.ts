import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSearchError } from "../../core/errors.ts";
import { normalizeTavilyApiKey, normalizeTavilyBaseUrl } from "./config.ts";
import { buildTavilyPayload, createTavilyProvider } from "./provider.ts";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

test("Tavily endpoint validation excludes credentials, queries and fragments", () => {
  assert.equal(
    normalizeTavilyBaseUrl(" https://api.tavily.com/search "),
    "https://api.tavily.com/search",
  );
  for (const url of [
    "",
    "file:///tmp/search",
    "https://user:password@api.tavily.com/search",
    "https://api.tavily.com/search?api_key=secret",
    "https://api.tavily.com/search#token",
  ])
    assert.throws(() => normalizeTavilyBaseUrl(url), WebSearchError);
});

test("Tavily keys are trimmed; unsafe values resolve to undefined", () => {
  assert.equal(normalizeTavilyApiKey("  tvly-fixture  "), "tvly-fixture");
  assert.equal(normalizeTavilyApiKey(""), undefined);
  assert.equal(normalizeTavilyApiKey(undefined), undefined);
  assert.equal(normalizeTavilyApiKey("bad\r\nkey"), undefined);
  assert.equal(normalizeTavilyApiKey("x".repeat(513)), undefined);
});

test("Tavily requires a key only when the provider is actually used", () => {
  assert.throws(
    () => createTavilyProvider(),
    (error: unknown) =>
      error instanceof WebSearchError && error.code === "invalid-config",
  );
  assert.doesNotThrow(() => createTavilyProvider({ apiKey: "tvly-fixture" }));
});

test("Tavily payload maps domains, recency and caps the result count", () => {
  assert.deepEqual(
    buildTavilyPayload({ query: "latest release", maxResults: 3 }),
    {
      query: "latest release",
      max_results: 3,
      search_depth: "basic",
      include_answer: true,
      include_raw_content: false,
    },
  );
  assert.deepEqual(
    buildTavilyPayload({
      query: "docs",
      maxResults: 25,
      domains: ["github.com"],
      recencyDays: 3,
    }),
    {
      query: "docs",
      max_results: 20,
      search_depth: "basic",
      include_answer: true,
      include_raw_content: false,
      include_domains: ["github.com"],
      time_range: "w",
    },
  );
  assert.equal(
    buildTavilyPayload({ query: "old", maxResults: 1, recencyDays: 400 })
      .time_range,
    "y",
  );
});

test("Tavily sends Bearer auth and normalizes, filters and deduplicates results", async () => {
  let calledUrl: string | URL | undefined;
  let calledInit: RequestInit | undefined;
  const provider = createTavilyProvider({
    apiKey: "fixture-tavily-key",
    fetch: async (input, init) => {
      calledUrl = input;
      calledInit = init;
      return response({
        answer: "Synthetic summary.",
        results: [
          { title: "Outside", url: "https://notexample.com/" },
          { title: "First", url: "https://example.com/a#one", content: "one" },
          {
            title: "Duplicate",
            url: "https://example.com/a#two",
            content: "duplicate",
          },
          {
            title: "Second",
            url: "https://docs.example.org/b",
            content: "two",
          },
        ],
      });
    },
  });
  const result = await provider.search({
    query: "latest release",
    maxResults: 2,
    domains: ["example.com", "example.org"],
    recencyDays: 3,
  });

  assert.equal(calledUrl, "https://api.tavily.com/search");
  assert.equal(calledInit?.method, "POST");
  assert.equal(calledInit?.redirect, "error");
  assert.equal(
    new Headers(calledInit?.headers).get("authorization"),
    "Bearer fixture-tavily-key",
  );
  assert.deepEqual(JSON.parse(String(calledInit?.body)), {
    query: "latest release",
    max_results: 2,
    search_depth: "basic",
    include_answer: true,
    include_raw_content: false,
    include_domains: ["example.com", "example.org"],
    time_range: "w",
  });
  assert.equal(result.summary, "Synthetic summary.");
  assert.deepEqual(result.results, [
    { title: "First", url: "https://example.com/a", snippet: "one" },
    { title: "Second", url: "https://docs.example.org/b", snippet: "two" },
  ]);
  assert.doesNotMatch(JSON.stringify(result), /fixture-tavily-key/);
});

test("Tavily redacts the API key reflected in provider output", async () => {
  const provider = createTavilyProvider({
    apiKey: "fixture-tavily-secret",
    fetch: async () =>
      response({
        answer: "Answer quoting fixture-tavily-secret back.",
        results: [
          {
            title: "Title fixture-tavily-secret",
            url: "https://example.com/a?token=fixture-tavily-secret",
            content: "Content fixture-tavily-secret",
          },
        ],
      }),
  });
  const result = await provider.search({
    query: "fixture-tavily-secret",
    maxResults: 1,
  });

  assert.doesNotMatch(JSON.stringify(result), /fixture-tavily-secret/);
  assert.match(result.summary ?? "", /redacted/i);
  assert.match(result.results[0]?.snippet ?? "", /redacted/i);
  assert.match(result.results[0]?.title ?? "", /redacted/i);
  assert.doesNotMatch(result.query, /fixture-tavily-secret/);
});

test("Tavily classifies status, malformed responses and transport errors safely", async () => {
  const statusCases: Array<[number, string]> = [
    [400, "request"],
    [401, "auth"],
    [403, "auth"],
    [429, "rate-limit"],
    [432, "rate-limit"],
    [433, "rate-limit"],
    [500, "server"],
  ];
  for (const [status, code] of statusCases) {
    const provider = createTavilyProvider({
      apiKey: "fixture-tavily-key",
      fetch: async () => response({ detail: "fixture-secret-body" }, status),
    });
    await assert.rejects(
      provider.search({ query: "test", maxResults: 1 }),
      (error: unknown) => {
        assert.ok(error instanceof WebSearchError);
        assert.equal(error.status, status);
        assert.equal(error.code, code);
        assert.doesNotMatch(
          `${error.stack} ${JSON.stringify(error)}`,
          /fixture-secret-body|fixture-tavily-key/,
        );
        return true;
      },
    );
  }
  for (const body of ["not json", "{}", "[]", '{"results":{}}']) {
    const provider = createTavilyProvider({
      apiKey: "fixture-tavily-key",
      fetch: async () => new Response(body),
    });
    await assert.rejects(provider.search({ query: "test", maxResults: 1 }), {
      code: "invalid-response",
    });
  }
  const provider = createTavilyProvider({
    apiKey: "fixture-tavily-key",
    fetch: async () => {
      throw new Error("fixture-transport-secret");
    },
  });
  await assert.rejects(provider.search({ query: "test", maxResults: 1 }), {
    code: "network",
    message: "tavily could not be reached.",
  });
});
