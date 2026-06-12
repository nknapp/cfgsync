import { assertEquals, deindent, runningOutsideDocker } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";
import { readTestDir } from "./lib/setupTestDir.ts";

Deno.test.beforeEach(async () => {
  try {
    await Deno.remove("/home/user/cfgsync-test-subdir", { recursive: true });
  } catch (_error) {
    // ignore error
  }
});

Deno.test({ name: "sync to home dir", ignore: runningOutsideDocker }, async (t) => {
  await testSyncToHomeDir(t);
});

Deno.test({ name: "sync to home dir (sudo)", ignore: runningOutsideDocker }, async (t) => {
  await testSyncToHomeDir(t);
});

async function testSyncToHomeDir(t: Deno.TestContext, { sudo = false } = {}) {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "~"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0755  | source/cfgsync-test-subdir/",
      "user:user | 0644  | source/cfgsync-test-subdir/data.txt | My data",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"], sudo });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied cfgsync-test-subdir/data.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0755 | source/cfgsync-test-subdir/",
    "user:user | 0644 | source/cfgsync-test-subdir/data.txt | My data",
  ]);

  assertEquals(await readTestDir(new URL("/home/user/cfgsync-test-subdir/", import.meta.url), ""), [
    "user:user | 0644 | data.txt | My data",
  ]);
}

Deno.test({ name: "sync from home dir", ignore: runningOutsideDocker }, async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "~/cfgsync-test-subdir"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      `user:user | 0755  | /home/user/cfgsync-test-subdir/`,
      `user:user | 0755  | /home/user/cfgsync-test-subdir/subdir/`,
      `user:user | 0644  | /home/user/cfgsync-test-subdir/subdir/data.txt | My data`,
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied target -> subdir/data.txt

      source -> target: 0
      target -> source: 1
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0755 | source/subdir/",
    "user:user | 0644 | source/subdir/data.txt | My data",
  ]);
});
