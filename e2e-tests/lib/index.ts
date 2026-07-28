export { deindent } from "./deindent.ts";
export { hash, TestBed } from "./TestBed.ts";
export * from "./assert.ts";

export { CONFIG_TOML, nobodyOwner, rootOwner, STATE_FILE } from "./config.ts";

export const runningOutsideDocker = Deno.env.get("E2E_IN_DOCKER") !== "true";
