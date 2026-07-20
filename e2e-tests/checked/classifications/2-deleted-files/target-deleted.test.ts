import { assertEquals, CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("delete-source-unchanged", async (t) => {
  // Setup
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
      "user:user | 644 | 0 | source/file.txt | file content",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | file content",
    ],
  });
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  await testbed.deleteFile("target/file.txt");

  // Run and verify status
  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 1
    `,
    stderr: "",
  });

  // Run and verify sync
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      deleted source/file.txt

      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   1
    `,
    stderr: "",
  });
  assertEquals(await testbed.readTestDir(), [
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 755 | 0 | target/",
  ]);
});
