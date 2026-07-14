import { assertEquals, deindent } from "../lib/index.ts";
import { TestBed } from "../lib/TestBed.ts";

Deno.test("dry-run-shows-actions-without-modifying-files", async (t) => {
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
      "user:user | 644 | 0 | source/file.txt | new file content",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync", "--dry-run"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      [dry-run] copy file.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | new file content",
    "user:user | 755 | 0 | target/",
  ]);
});

Deno.test("dry-run-then-real-sync", async (t) => {
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
      "user:user | 644 | 0 | source/file.txt | new file content",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync", "--dry-run"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      [dry-run] copy file.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | new file content",
    "user:user | 755 | 0 | target/",
  ]);

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | new file content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | new file content",
  ]);
});
