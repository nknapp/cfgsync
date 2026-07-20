import { assertEquals, CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("delete-from-state", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | file content",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/file.txt | file content",
    ],
    faketime: "2024-10-10T08:11:33.000Z",
  });

  await testbed.deleteFile("source/file.txt");
  await testbed.deleteFile("target/file.txt");

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  // TODO: This should not say "all clean" but "update state: 1"
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      all clean
    `,
    stderr: "",
  });

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
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 755 | 0 | target/",
  ]);
});
