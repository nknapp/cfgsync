import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("new-file-update-state", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | hello world",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | hello world",
    ],
  });

  // Test short status
  await testbed.testStatus("config.toml", {
    short: deindent`
      ↺1
    `,
    normal: deindent`
      source -> target: 0
      target -> source: 0
      state update:     1
    `,
  });

  // TODO: Test short status (new icon to show that everything is fine, but sync should be run anyway)

  // diff: UpdateState produces no output
  await testbed.testDiff("config.toml", "");

  // sync: no files copied, state file created with hash for tracking
  await testbed.testSync("config.toml", {
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
  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | hello world",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | hello world",
  ]);
});
