import { readTestDir, setupTestDir, TestSpec } from "./setupTestDir.ts";
import { RunArgs, runCfgsync } from "./runCfgsync.ts";
import { assertEquals, assertOutput as assertStr } from "./assert.ts";

type ExecReturn = { code: number; stdout: string; stderr: string };

export class TestBed {
  private lastRun?: ExecReturn;
  private skipped = false;

  static async create(t: Deno.TestContext, spec: TestSpec) {
    const dir = await setupTestDir(t, spec);
    return new TestBed(t, spec, dir);
  }

  constructor(
    private t: Deno.TestContext,
    private spec: TestSpec,
    private testDir: URL,
  ) {
  }

  readTestDir() {
    return readTestDir(this.t, this.spec);
  }

  async deleteFile(relativePath: string) {
    await Deno.remove(new URL(relativePath, this.testDir));
  }

  async run(runArgs: Omit<RunArgs, "cwd">) {
    if (this.skipped) {
      this.lastRun = { code: 0, stdout: "", stderr: "" };
      return;
    }
    this.lastRun = await runCfgsync({ cwd: this.testDir, ...runArgs });
  }

  assertOutput(expectedOutput: ExecReturn) {
    if (this.lastRun == null) {
      throw new Error("Call 'run' before checking output");
    }

    assertEquals(
      this.normalizeOutput(this.lastRun),
      this.normalizeOutput(expectedOutput),
    );
  }

  private normalizeOutput({ code, stdout, stderr }: ExecReturn): ExecReturn {
    return {
      code,
      stdout: stdout.replace(/ $/mg, "").trim(),
      stderr: stderr.replace(/ $/mg, "").trim(),
    };
  }
}
