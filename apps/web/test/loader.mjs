// Test-only loader. Resolves "@/x" → apps/web/x and extensionless relative imports → .ts, so the engine runs under plain Node.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

// apps/web/ — resolved relative to this file so the repo can live anywhere.
const WEB = fileURLToPath(new URL("../", import.meta.url));

function tryTs(p) {
  for (const c of [p, p + ".ts", p + ".tsx", path.join(p, "index.ts")]) if (existsSync(c) && !c.endsWith(path.sep)) return c;
  return null;
}

export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) {
    const f = tryTs(path.join(WEB, spec.slice(2)));
    if (f) return { url: pathToFileURL(f).href, shortCircuit: true, format: "module-typescript" };
  }
  if ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:")) {
    const base = path.dirname(fileURLToPath(ctx.parentURL));
    const f = tryTs(path.join(base, spec));
    if (f && /\.tsx?$/.test(f)) return { url: pathToFileURL(f).href, shortCircuit: true, format: "module-typescript" };
  }
  // Bare packages imported from this test folder resolve as if from the web app.
  if (!/^(\.|\/|node:|file:|data:|[A-Za-z]:)/.test(spec) && ctx.parentURL?.includes("/test/")) {
    return next(spec, { ...ctx, parentURL: pathToFileURL(WEB + "package.json").href });
  }
  return next(spec, ctx);
}
