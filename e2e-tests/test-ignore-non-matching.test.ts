import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("ignore-non-matching", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | source file content",
      "user:user | 0644  | source/not-matched.conf | should not be synced",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/unmatched-target.txt | target file content",
      "user:user | 0644  | target/not-matched.conf | should not be synced",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | source file content",
    "user:user | 0644 | source/not-matched.conf | should not be synced",
    "user:user | 0644 | source/unmatched-target.txt | target file content",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | source file content",
    "user:user | 0644 | target/not-matched.conf | should not be synced",
    "user:user | 0644 | target/unmatched-target.txt | target file content",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      copied target -> unmatched-target.txt

      source -> target: 1
      target -> source: 1
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
