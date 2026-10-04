// Regenerates tests/snapshots from tests/fixtures/golden (cross-platform: npm scripts cannot set env vars on Windows).
process.env.UPDATE_GOLDEN = "1";
await import("../tests/golden.test.js");
