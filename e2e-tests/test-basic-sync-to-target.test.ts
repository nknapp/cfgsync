import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("basic-sync-to-target", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | file content",
      "user:user | 0755  | source/subdir/",
      "user:user | 0644  | source/subdir/nested-file.txt | nested file content",
      "user:user | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | file content",
    "user:user | 0755 | source/subdir/",
    "user:user | 0644 | source/subdir/nested-file.txt | nested file content",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | file content",
    "user:user | 0755 | target/subdir/",
    "user:user | 0644 | target/subdir/nested-file.txt | nested file content",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      copied subdir/nested-file.txt -> target

      source -> target: 2
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
