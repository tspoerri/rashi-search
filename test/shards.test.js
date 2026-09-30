// Data-layout invariants the lazy loaders (nach, and later the unified app)
// depend on: every manifest entry has a shard whose length matches `count`,
// and every record in a shard belongs to that shard's unit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const load = (p) => JSON.parse(readFileSync(new URL("../" + p, import.meta.url), "utf8"));

test("nach: manifest matches shards, one book per shard", () => {
  const m = load("data/nach/manifest.json");
  assert.equal(m.books.length, 34);
  let total = 0;
  for (const b of m.books) {
    assert.ok(existsSync(new URL("../data/nach/" + b.file, import.meta.url)), b.file);
    const arr = load("data/nach/" + b.file);
    assert.equal(arr.length, b.count, b.en);
    assert.ok(arr.every((r) => r.b === b.en), b.en + " shard has foreign records");
    total += arr.length;
  }
  assert.equal(total, 20413);
});

test("bavli: manifest matches shard files", () => {
  const m = load("data/bavli/manifest.json");
  assert.equal(m.tractates.length, 36);
  for (const t of m.tractates) assert.ok(existsSync(new URL("../data/bavli/" + t.file, import.meta.url)), t.file);
});
