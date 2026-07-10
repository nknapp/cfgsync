import { InteractiveChildProcess } from "./spawn.ts";
import { cfgSync } from "./env.ts";

export interface RunArgs {
  args: string[];
  cwd: URL;
  sudo?: boolean;
  env?: Record<string, string>;
  faketime?: string;
}

export function runCfgsync(
  { args, cwd, sudo, env, faketime }: RunArgs,
): InteractiveChildProcess {
  let cmd: string;
  let realArgs: string[];

  if (faketime) {
    if (sudo) {
      cmd = "sudo";
      realArgs = ["faketime", faketime, cfgSync, ...args];
    } else {
      cmd = "faketime";
      realArgs = [faketime, cfgSync, ...args];
    }
  } else if (sudo) {
    cmd = "sudo";
    realArgs = [cfgSync, ...args];
  } else {
    cmd = cfgSync;
    realArgs = args;
  }

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
