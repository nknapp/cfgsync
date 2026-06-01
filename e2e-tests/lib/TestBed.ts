import { readTestDir, setupTestDir, TestSpec } from "./setupTestDir.ts";
import { RunArgs, runCfgsync } from "./runCfgsync.ts";
import { assertEquals } from "./assert.ts";
import { InteractiveChildProcess } from "./spawn.ts";

type ExecReturn = { code: number; stdout: string; stderr: string };

export class TestBed {
  private lastRun?: ExecReturn;

  static async create(t: Deno.TestContext, spec: TestSpec) {
    const dir = await setupTestDir(t, spec);
    return new TestBed(spec, dir);
  }

  constructor(
    private spec: TestSpec,
    private testDir: URL,
  ) {
  }

  readTestDir() {
    return readTestDir(this.testDir, this.spec.configToml);
  }

  async deleteFile(relativePath: string) {
    await Deno.remove(new URL(relativePath, this.testDir));
  }

  async writeTextFile(relativePath: string, newContents: string) {
    await Deno.writeTextFile(new URL(relativePath, this.testDir), newContents);
  }

  async mkdir(relativePath: string) {
    await Deno.mkdir(new URL(relativePath, this.testDir));
  }

  async run(runArgs: Omit<RunArgs, "cwd">) {
    this.lastRun = await runCfgsync({ cwd: this.testDir, ...runArgs }).waitForExit();
  }

  spawn(runArgs: Omit<RunArgs, "cwd">): InteractiveChildProcess {
    return runCfgsync({ cwd: this.testDir, ...runArgs });
  }

  getStdout(): string {
    if (this.lastRun == null) {
      throw new Error("Call 'run' before getting stdout");
    }
    return this.lastRun.stdout;
  }

  getStderr(): string {
    if (this.lastRun == null) {
      throw new Error("Call 'run' before getting stderr");
    }
    return this.lastRun.stderr;
  }

  getExitCode(): number {
    if (this.lastRun == null) {
      throw new Error("Call 'run' before getting exit code");
    }
    return this.lastRun.code;
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
