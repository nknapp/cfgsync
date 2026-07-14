import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("basic-sync-to-target", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | file content",
      "user:user | 755 | 0 | source/subdir/",
      "user:user | 644 | 0 | source/subdir/nested-file.txt | nested file content",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | file content",
    "user:user | 755 | 0 | source/subdir/",
    "user:user | 644 | 0 | source/subdir/nested-file.txt | nested file content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | file content",
    "user:user | 755 | 0 | target/subdir/",
    "user:user | 644 | 0 | target/subdir/nested-file.txt | nested file content",
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
