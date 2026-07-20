import { assertEquals, CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("delete-target-changed", async (t) => {
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
    faketime: "2020-01-01T00:00:00Z",
  });
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.advance("1 sec");
  await testbed.deleteFile("source/file.txt");
  await testbed.writeTextFile("target/file.txt", "different content");

  // Run and verify status
  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      conflict:         1
    `,
    stderr: "",
  });

  // Run and verify sync
  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 1,
    stdout: "",
    stderr: deindent`
      Conflicts detected (1 files):
        file.txt
      Error: Aborting due to 1 conflict(s). Use -i/--interactive to resolve.
    `,
  });

  assertEquals(await testbed.readTestDir(), [
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | different content",
  ]);
});
