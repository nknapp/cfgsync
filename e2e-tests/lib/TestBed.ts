import { readTestDir, setupTestDir, TestSpec } from "./setupTestDir.ts";
import { testBaseDir } from "./env.ts";
import { RunArgs, runCfgsync } from "./runCfgsync.ts";
import { assertEquals } from "./assert.ts";
import { InteractiveChildProcess } from "./spawn.ts";

export type ExecReturn = { code: number; stdout: string; stderr: string };

export type TestSpecOrFn = TestSpec | ((options: { testDir: string }) => TestSpec);

class FakeTime {
  file: string;
  now: Date;

  constructor(now: Date) {
    this.now = now;
    this.file = Deno.makeTempFileSync({ prefix: "cfgsync-faketime-" });
    this.writeFakeTimeFile();
  }

  writeFakeTimeFile() {
    Deno.writeTextFileSync(this.file, String(this.now.getTime()));
  }

  advance(duration: string): void {
    const msMatch = duration.match(/^(\d+)\s*ms$/);
    const secMatch = duration.match(/^(\d+)\s*sec$/);
    if (msMatch) {
      this.now = new Date(this.now.getTime() + parseInt(msMatch[1]));
    } else if (secMatch) {
      this.now = new Date(this.now.getTime() + parseInt(secMatch[1]) * 1000);
    } else {
      throw new Error(`Invalid duration format: "${duration}". Use "X ms" or "Y sec"`);
    }
    this.writeFakeTimeFile();
  }
}

export class TestBed {
  private lastRun?: ExecReturn;
  private faketime: FakeTime | null = null;

  static async create(
    t: Deno.TestContext,
    specOrFn: TestSpecOrFn,
  ): Promise<{ testbed: TestBed; testDir: string }> {
    const testDirUrl = new URL(t.name.replace(/\W/g, "_") + "/", testBaseDir);
    const testDir = testDirUrl.pathname.replace(/\/$/, "");
    const spec = typeof specOrFn === "function" ? specOrFn({ testDir: testDir }) : specOrFn;
    const dir = await setupTestDir(testDirUrl, spec);
    const bed = new TestBed(spec, dir);
    if (spec.faketime) {
      bed.faketime = new FakeTime(new Date(spec.faketime));
    }
    return { testbed: bed, testDir };
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

  async readTextFile(relativePath: string): Promise<string> {
    const path = new URL(relativePath, this.testDir);
    return await Deno.readTextFile(path);
  }

  async mkdir(relativePath: string) {
    const path = new URL(relativePath, this.testDir);
    await Deno.mkdir(path);
    await Deno.utime(path, this.mtime(), this.mtime());
  }

  private mtime(): Date {
    return this.faketime?.now ?? new Date();
  }

  async run(runArgs: Omit<RunArgs, "cwd">) {
    this.lastRun = await runCfgsync({
      cwd: this.testDir,
      ...runArgs,
      faketimeFile: this.faketime?.file,
    }).waitForExit();
  }

  advance(duration: string) {
    if (!this.faketime) {
      throw new Error("Cannot advance time: no fakeTime was set");
    }
    this.faketime.advance(duration);
  }

  spawn(runArgs: Omit<RunArgs, "cwd">): InteractiveChildProcess {
    return runCfgsync({
      cwd: this.testDir,
      ...runArgs,
      faketimeFile: this.faketime?.file,
    });
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
