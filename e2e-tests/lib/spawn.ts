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

  const stdoutPromise = (async () => {
    let text = "";
    const reader = child.stdout
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let stepIdx = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += value;
        while (stepIdx < steps.length && steps[stepIdx].match.test(text)) {
          await writer.write(new TextEncoder().encode(steps[stepIdx].write));
          stepIdx++;
        }
      }
    } finally {
      reader.releaseLock();
    }
    return text;
  })();

  const stderrPromise = new Response(child.stderr).text();

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  await writer.close();
  const { code } = await child.status;
  return { code, stdout, stderr };
}
