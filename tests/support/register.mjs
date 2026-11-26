// Test-only module hooks: map the "@/..." alias to src/ and swap the Prisma client for an in-memory fake.
import { register } from "node:module";
register("./hooks.mjs", import.meta.url);
