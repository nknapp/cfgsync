import { readTestDir, setupTestDir, TestSpec } from "./setupTestDir.ts";
import { RunArgs, runCfgsync } from "./runCfgsync.ts";
import TestContext = Deno.TestContext;
import { assertEquals, assertOutput } from "./assert.ts";

type ExecReturn = { code: number; stdout: string; stderr: string };

export class TestBed {
  private lastRun?: ExecReturn;

  static async create(t: TestContext, spec: TestSpec) {
    return new TestBed(t, spec, await setupTestDir(t, spec));
  }

  constructor(
    private t: TestContext,
    private spec: TestSpec,
    private testDir: URL,
  ) {
  }

  async readTestDir() {
    return readTestDir(this.t, this.spec);
  }

  async run(runArgs: Omit<RunArgs, "cwd">) {
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
