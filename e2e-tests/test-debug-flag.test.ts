import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";
import { getTestDir } from "./lib/setupTestDir.ts";

Deno.test("debug-flag-shows-scan-details", async (t) => {
  const testDir = getTestDir(t).pathname;

  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | file content",
      "user:user | 0644 | source/ignoredFile.md | file content",
      "user:user | 0755 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync", "--debug"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | file content",
    "user:user | 0644 | source/ignoredFile.md | file content",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | file content",
  ]);

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: deindent`
      [debug] scanning ${testDir}source with pattern '${testDir}source/**/*.txt'
      [debug]   found ${testDir}source/file.txt
      [debug] scanning ${testDir}target with pattern '${testDir}target/**/*.txt'
      files visited: 1 (source) + 0 (target) = 1 total
    `,
  });
});
