import { assertEquals, deindent } from "../lib/index.ts";
import { TestBed } from "../lib/TestBed.ts";

Deno.test("symlinks-status-detected", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | file content",
      "user:user |      | source/link.txt -> file.txt",
      "user:user | 0755 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 2
      target -> source: 0
    `,
    stderr: "",
  });
});

Deno.test("symlinks-preserved-during-sync", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      "user:user | 0755 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | source/",
      "user:user | 0644 | source/file.txt | file content",
      "user:user |      | source/link.txt -> file.txt",
      "user:user | 0755 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      copied link.txt -> target

      source -> target: 2
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
    "user:user | 0644 | source/file.txt | file content",
    "user:user |      | source/link.txt -> file.txt",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | file content",
    "user:user |      | target/link.txt -> file.txt",
  ]);
});
