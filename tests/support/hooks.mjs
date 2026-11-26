import { pathToFileURL } from "node:url";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "../..");
export async function resolve(specifier, context, next) {
  if (specifier === "@/lib/db") return { url: pathToFileURL(path.join(root, "tests/support/fake-db.ts")).href, shortCircuit: true };
  if (specifier.startsWith("@/")) return { url: pathToFileURL(path.join(root, "src", specifier.slice(2) + ".ts")).href, shortCircuit: true };
  return next(specifier, context);
}
