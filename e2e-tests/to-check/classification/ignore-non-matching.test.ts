import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("ignore-non-matching", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | source file content",
      "user:user | 644 | 0 | source/not-matched.conf | should not be synced",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/unmatched-target.txt | target file content",
      "user:user | 644 | 0 | target/not-matched.conf | should not be synced",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | source file content",
    "user:user | 644 | 0 | source/not-matched.conf | should not be synced",
    "user:user | 644 | 0 | source/unmatched-target.txt | target file content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | source file content",
    "user:user | 644 | 0 | target/not-matched.conf | should not be synced",
    "user:user | 644 | 0 | target/unmatched-target.txt | target file content",
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
