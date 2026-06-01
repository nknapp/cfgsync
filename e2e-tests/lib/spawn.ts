import { StreamSniffer, WaitForOptions } from "./StreamSniffer.ts";

export interface Step {
  match: RegExp;
  write: string;
}


export class InteractiveChildProcess {
  child: Deno.ChildProcess;
  stdout: StreamSniffer;
  stderr: StreamSniffer;

  private writer: WritableStreamDefaultWriter<Uint8Array<ArrayBuffer>>;

  constructor(cmd: Deno.Command) {
    this.child = cmd.spawn();
    this.writer = this.child.stdin.getWriter();

    this.stdout = new StreamSniffer(
      "stdout",
      this.child.stdout
        .pipeThrough(new TextDecoderStream()),
    );

    this.stderr = new StreamSniffer(
      "stderr",
      this.child.stderr
        .pipeThrough(new TextDecoderStream()),
    );
  }

  async waitForExit(): Promise<{ code: number; stdout: string; stderr: string }> {
    return {
      code: (await this.child.status).code,
      stdout: await this.stdout.result,
      stderr: await this.stderr.result,
    };
  }

  waitForStdout(needle: string | RegExp, options: WaitForOptions = {}): Promise<void> {
    return this.stdout.waitFor(needle, options);
  }

  waitForStderr(needle: string | RegExp, options: WaitForOptions = {}): Promise<void> {
    return this.stderr.waitFor(needle, options);
  }

  /**
   * Type a string into stdin of the process.
   * @param text the string
   */
  async type(text: string): Promise<void> {
    await this.writer.write(new TextEncoder().encode(text));
  }

  stop(): void {
    return this.child.kill();
  }
}

export async function spawn(
  cmd: Deno.Command,
  steps: Step[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = new InteractiveChildProcess(cmd);
  for (const step of steps) {
    await Promise.race([child.waitForStdout(step.match), child.waitForStderr(step.match)]);
    await child.type(step.write);
  }
  return child.waitForExit();
}
