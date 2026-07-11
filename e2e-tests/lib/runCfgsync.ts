import { InteractiveChildProcess } from "./spawn.ts";
import { cfgSync } from "./env.ts";

export interface RunArgs {
  args: string[];
  cwd: URL;
  sudo?: boolean;
  env?: Record<string, string>;
  faketimeFile?: string;
}

export function runCfgsync(
  { args, cwd, sudo, env, faketimeFile }: RunArgs,
): InteractiveChildProcess {
  const cmdAndArgs: string[] = [cfgSync, ...args];
  const mergedEnv: Record<string, string> = { ...env };

  if (faketimeFile) {
    mergedEnv["FAKETIME"] = faketimeFile;
  }

  if (sudo) {
    cmdAndArgs.unshift("sudo");
  }
  const [cmd, ...realArgs] = cmdAndArgs;
  const command = new Deno.Command(cmd, {
    args: realArgs,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
    cwd: cwd.pathname,
    env: mergedEnv,
  });
  return new InteractiveChildProcess(command);
}
