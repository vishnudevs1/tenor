// Runs the engine + checkout integration tests against live Extended data and Arc testnet,
// using a throwaway database so real data is never touched.
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../.data-test", import.meta.url));
rmSync(dir, { recursive: true, force: true });
process.env.TENOR_DATA_DIR = dir;

await import("./engine.test.mjs");
await import("./checkout.test.mjs");
await import("./profile.test.mjs");

process.exit(0); // PGlite keeps the event loop alive
