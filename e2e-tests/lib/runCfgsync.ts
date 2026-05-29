import { spawn, Step } from "./spawn.ts";

export interface RunArgs {
  args: string[];
  cwd: URL;
  steps?: Step[];
}

export function runCfgsync(
  { args, cwd, steps = [] }: RunArgs,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cfgSync = Deno.env.get("CFGSYNC");
  if (cfgSync == null) {
    throw new Error(
      "Environment variable CFGSYNC must be set and point to the executable",
    );
  }

  const command = new Deno.Command(cfgSync, {
    args,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    cwd: cwd.pathname,
  });
  return spawn(command, steps);
}
