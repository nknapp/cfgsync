import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("multi-group-independent", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source-a"
      target = "./target-a"
      globs = ["**/*.txt"]

      [[sync]]
      source = "./source-b"
      target = "./target-b"
      globs = ["**/*.conf"]
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | source-a/",
      "user:user | 0644 | 0 | source-a/file.txt | content from group a",
      "user:user | 0755 | 0 | target-a/",
      "user:user | 0755 | 0 | source-b/",
      "user:user | 0644 | 0 | source-b/file.conf | content from group b",
      "user:user | 0755 | 0 | target-b/",
    ],
  });

  // First sync: both groups copy to target
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      copied file.conf -> target

      source -> target: 2
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  // Second sync: nothing changed
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | 0 | source-a/",
    "user:user | 0644 | 0 | source-a/file.txt | content from group a",
    "user:user | 0755 | 0 | source-b/",
    "user:user | 0644 | 0 | source-b/file.conf | content from group b",
    "user:user | 0755 | 0 | target-a/",
    "user:user | 0644 | 0 | target-a/file.txt | content from group a",
    "user:user | 0755 | 0 | target-b/",
    "user:user | 0644 | 0 | target-b/file.conf | content from group b",
  ]);
});
