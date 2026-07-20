import { setupTestDir } from "./setupTestDir.ts";
import { testBaseDir } from "./env.ts";
import { RunArgs, runCfgsync } from "./runCfgsync.ts";
import { assertEquals } from "./assert.ts";
import { InteractiveChildProcess } from "./spawn.ts";
import { XXH3_128 } from "xxh3-ts";
import { Buffer } from "node:buffer";
import { readTestDir } from "./readTestDir.ts";
import { TestEntry, TestSpec } from "./config.ts";
import { FakeTime } from "./faketime.ts";
import { mapToNewBasePath } from "./mapToNewBasePath.ts";

export type ExecReturn = { code: number; stdout: string; stderr: string };

export type TestSpecOrFn = TestSpec | ((options: { testDir: string }) => TestSpec);

export function hash(content: string): string {
  return XXH3_128(Buffer.from(content)).toString(16);
}

function getUserInfo(): { username: string; groupname: string } {
  const username = new TextDecoder().decode(
    new Deno.Command("id", { args: ["-nu"] }).outputSync().stdout,
  ).trim();
  const groupname = new TextDecoder().decode(
    new Deno.Command("id", { args: ["-ng"] }).outputSync().stdout,
  ).trim();
  return { username, groupname };
}

function getTestDir(t: Deno.TestContext) {
  const desiredBaseDir = new URL(t.origin + ".tmp/");
  const e2eTestDir = new URL("../", import.meta.url);
  const baseDir = mapToNewBasePath(desiredBaseDir, e2eTestDir, testBaseDir);
  const testNameSlug = t.name.replace(/\W/g, "_") + "/";
  return new URL(testNameSlug, baseDir);
}

export class TestBed {
  private lastRun?: ExecReturn;
  private faketime: FakeTime | null = null;

  static async create(
    t: Deno.TestContext,
    specOrFn: TestSpecOrFn,
  ): Promise<{ testbed: TestBed; testDir: string; username: string; groupname: string }> {
    const testDirUrl = getTestDir(t);
    const testDir = testDirUrl.pathname.replace(/\/$/, "");
    const spec = typeof specOrFn === "function" ? specOrFn({ testDir: testDir }) : specOrFn;
    await setupTestDir(testDirUrl, spec);
    const bed = new TestBed(spec, testDirUrl);
    if (spec.faketime) {
      bed.faketime = new FakeTime(new Date(spec.faketime));
    }
    const { username, groupname } = getUserInfo();
    return { testbed: bed, testDir, username, groupname };
  }

  constructor(
    private spec: TestSpec,
    private testDir: URL,
  ) {
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

  async assertTestDir(files: TestEntry[]) {
    assertEquals(await readTestDir(this.testDir, this.spec.configToml), files);
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
      ...runArgs,
      cwd: this.testDir,
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
      stdout: stdout.replace(/\s+$/mg, "").trim(),
      stderr: stderr.replace(/\s+$/mg, "").trim(),
    };
  }
}
