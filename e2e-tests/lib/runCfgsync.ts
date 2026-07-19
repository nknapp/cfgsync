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
  let mergedEnv: Record<string, string> | undefined;

  if (faketimeFile || env) {
    mergedEnv = { ...Deno.env.toObject(), ...env };
    if (faketimeFile) {
      mergedEnv["FAKETIME"] = faketimeFile;
    }
  }

  if (sudo) {
    cmdAndArgs.unshift("sudo", "--preserve-env=FAKETIME");
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
