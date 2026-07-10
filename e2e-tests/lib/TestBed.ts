import { readTestDir, setupTestDir, TestSpec } from "./setupTestDir.ts";
import { RunArgs, runCfgsync } from "./runCfgsync.ts";
import { assertEquals } from "./assert.ts";
import { InteractiveChildProcess } from "./spawn.ts";

type ExecReturn = { code: number; stdout: string; stderr: string };

export class TestBed {
  private lastRun?: ExecReturn;
  private currentTime: Date | null = null;

  static async create(t: Deno.TestContext, spec: TestSpec) {
    const dir = await setupTestDir(t, spec);
    const bed = new TestBed(spec, dir);
    if (spec.faketime) {
      bed.currentTime = new Date(spec.faketime);
    }
    return bed;
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
    const path = new URL(relativePath, this.testDir);
    await Deno.writeTextFile(path, newContents);
    await Deno.utime(path, this.mtime(), this.mtime());
  }

  async mkdir(relativePath: string) {
    const path = new URL(relativePath, this.testDir);
    await Deno.mkdir(path);
    await Deno.utime(path, this.mtime(), this.mtime());
  }

  async setMtime(relativePath: string, mtime: Date) {
    const path = new URL(relativePath, this.testDir);
    await Deno.utime(path, mtime, mtime);
  }

  advance(duration: string): void {
    if (!this.currentTime) {
      throw new Error("Cannot advance time: no currentTime was set");
    }
    const msMatch = duration.match(/^(\d+)\s*ms$/);
    const secMatch = duration.match(/^(\d+)\s*sec$/);
    if (msMatch) {
      this.currentTime = new Date(this.currentTime.getTime() + parseInt(msMatch[1]));
    } else if (secMatch) {
      this.currentTime = new Date(this.currentTime.getTime() + parseInt(secMatch[1]) * 1000);
    } else {
      throw new Error(`Invalid duration format: "${duration}". Use "X ms" or "Y sec"`);
    }
  }

  private formatFaketime(): string | undefined {
    if (!this.currentTime) return undefined;
    return this.currentTime.toISOString().replace("T", " ").slice(0, 19);
  }

  private mtime(): Date {
    return this.currentTime ? new Date(this.currentTime) : new Date();
  }

  async run(runArgs: Omit<RunArgs, "cwd">) {
    this.lastRun = await runCfgsync({
      cwd: this.testDir,
      ...runArgs,
      faketime: this.formatFaketime(),
    }).waitForExit();
  }

  spawn(runArgs: Omit<RunArgs, "cwd">): InteractiveChildProcess {
    return runCfgsync({ cwd: this.testDir, ...runArgs, faketime: this.formatFaketime() });
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
