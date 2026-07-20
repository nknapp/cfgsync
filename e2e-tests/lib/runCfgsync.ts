import { InteractiveChildProcess } from "./spawn.ts";
import { cfgSync, cfgSyncFaketime } from "./env.ts";

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
  const binary = faketimeFile ? cfgSyncFaketime : cfgSync;
  const cmdAndArgs: string[] = [binary, ...args];
  const mergedEnv: Record<string, string> = { TZ: "UTC", ...env };

  if (faketimeFile) {
    if (faketimeFile) {
      mergedEnv["FAKETIME"] = faketimeFile;
    }
  }

  if (sudo) {
    const preserveEnv = Object.keys(mergedEnv).join(",");
    cmdAndArgs.unshift("sudo", `--preserve-env=${preserveEnv}`);
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
