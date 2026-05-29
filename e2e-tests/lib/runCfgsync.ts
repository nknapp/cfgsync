import { spawn, Step } from "./spawn.ts";
import { requireEnv } from "./requireEnv.ts";

export interface RunArgs {
  args: string[];
  cwd: URL;
  steps?: Step[];
  sudo?: boolean;
}

export function runCfgsync(
  { args, cwd, steps = [], sudo }: RunArgs,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const cfgSync = requireEnv("CFGSYNC");
  const [cmd, realArgs] = sudo ? ["sudo", [cfgSync, ...args]] : [cfgSync, args];
  const command = new Deno.Command(cmd, {
    args: realArgs,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    cwd: cwd.pathname,
  });
  return spawn(command, steps);
}
