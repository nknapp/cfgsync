import { readTestDir, setupTestDir, TestSpec } from "./setupTestDir.ts";
import { RunArgs, runCfgsync } from "./runCfgsync.ts";
import TestContext = Deno.TestContext;
import { assertEquals, assertOutput } from "./assert.ts";

type ExecReturn = { code: number; stdout: string; stderr: string };

export class TestBed {
  private lastRun?: ExecReturn;
  private skipped = false;

  static async create(t: TestContext, spec: TestSpec) {
    const dir = await setupTestDir(t, spec);
    if (dir === null) {
      return new TestBed(t, spec, new URL("file:///dev/null/"), true);
    }
    return new TestBed(t, spec, dir, false);
  }

  constructor(
    private t: TestContext,
    private spec: TestSpec,
    private testDir: URL,
    skipped = false,
  ) {
    this.skipped = skipped;
  }

  async readTestDir() {
    if (this.skipped) return [];
    return readTestDir(this.t, this.spec);
  }

  get dir(): URL {
    return this.testDir;
  }

  async deleteFile(relativePath: string) {
    if (this.skipped) return;
    await Deno.remove(new URL(relativePath, this.testDir));
  }

  async run(runArgs: Omit<RunArgs, "cwd">) {
    if (this.skipped) {
      this.lastRun = { code: 0, stdout: "", stderr: "" };
      return;
    }
    this.lastRun = await runCfgsync({ cwd: this.testDir, ...runArgs });
  }

  assertExitCode(code: number) {
    assertEquals(code, this.getLastRun().code);
  }

  assertStdout(stdout: string) {
    assertOutput(this.getLastRun().stdout, stdout);
  }

  assertStderr(stderr: string) {
    assertOutput(this.getLastRun().stderr, stderr);
  }

  private getLastRun(): ExecReturn {
    if (this.lastRun == null) {
      throw new Error("Call 'run' before checkout output");
    }
    return this.lastRun;
  }
}
