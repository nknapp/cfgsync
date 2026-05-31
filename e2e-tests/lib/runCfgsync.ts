import { spawn, Step } from "./spawn.ts";
import { cfgSync } from "./env.ts";

export interface RunArgs {
  args: string[];
  cwd: URL;
  steps?: Step[];
  sudo?: boolean;
  env?: Record<string, string>;
}

export function runCfgsync(
  { args, cwd, steps = [], sudo, env }: RunArgs,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const [cmd, realArgs] = sudo ? ["sudo", [cfgSync, ...args]] : [cfgSync, args];
  const command = new Deno.Command(cmd, {
    args: realArgs,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    cwd: cwd.pathname,
    env,
  });
  return spawn(command, steps);
}
