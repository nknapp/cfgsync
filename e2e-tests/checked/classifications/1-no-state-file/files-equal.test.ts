import { assertEquals, deindent, TestBed } from "@/lib/index.ts";

Deno.test("new-file-update-state", async (t) => {
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
      "user:user | 644 | 0 | source/file.txt | hello world",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | hello world",
    ],
  });

  // status: both sides have same content and no state entry → UpdateState
  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      state update:     1
    `,
    stderr: "",
  });

  // diff: UpdateState produces no output
  await testbed.run({ args: ["--config", "config.toml", "diff"] });
  testbed.assertOutput({
    code: 0,
    stdout: "",
    stderr: "",
  });

  // sync: no files copied, state file created with hash for tracking
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

  // After sync: both files unchanged, state file exists
  assertEquals(await testbed.readTestDir(), [
    "user:user | 644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | hello world",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | hello world",
  ]);
});
