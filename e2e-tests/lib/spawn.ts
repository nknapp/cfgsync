export interface Step {
  match: RegExp;
  write: string;
}

export async function spawn(
  cmd: Deno.Command,
  steps: Step[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = cmd.spawn();
  const writer = child.stdin.getWriter();

  let stdoutText = "";
  let stderrText = "";

  const stdoutReader = child.stdout
    .pipeThrough(new TextDecoderStream())
    .getReader();
  const stderrReader = child.stderr
    .pipeThrough(new TextDecoderStream())
    .getReader();

  let stepIdx = 0;

  async function readStream(
    reader: ReadableStreamDefaultReader<string>,
    into: "stdout" | "stderr",
  ) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (into === "stdout") stdoutText += value;
        else stderrText += value;
        const combined = stdoutText + stderrText;
        while (stepIdx < steps.length && steps[stepIdx].match.test(combined)) {
          await writer.write(new TextEncoder().encode(steps[stepIdx].write));
          stepIdx++;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  await Promise.all([
    readStream(stdoutReader, "stdout"),
    readStream(stderrReader, "stderr"),
  ]);

  await writer.close();
  const { code } = await child.status;
  return { code, stdout: stdoutText, stderr: stderrText };
}
