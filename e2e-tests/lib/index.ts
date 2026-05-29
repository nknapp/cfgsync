export { deindent } from "./deindent.ts";
export { setupTestDir } from "./setupTestDir.ts";
export { spawn } from "./spawn.ts";
export { runCfgsync } from "./runCfgsync.ts";
export * from "./assert.ts";

export const runningOutsideDocker = Deno.env.get("E2E_IN_DOCKER") !== "true";
