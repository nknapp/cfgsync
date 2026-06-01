import { InteractiveChildProcess } from "./spawn.ts";
import { cfgSync } from "./env.ts";

export interface RunArgs {
  args: string[];
  cwd: URL;
  sudo?: boolean;
  env?: Record<string, string>;
}

export function runCfgsync(
  { args, cwd, sudo, env }: RunArgs,
): InteractiveChildProcess {
  const [cmd, realArgs] = sudo ? ["sudo", [cfgSync, ...args]] : [cfgSync, args];
  const command = new Deno.Command(cmd, {
    args: realArgs,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    cwd: cwd.pathname,
    env,
  });
  return new InteractiveChildProcess(command);
}
