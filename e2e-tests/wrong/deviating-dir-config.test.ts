import { assertEquals, CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("deviating-dir-config", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]

      [[sync.deviating]]
      path = "./target/special-dir"
      owner = "root:root"
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | hello world",
      "user:user | 755 | 0 | target/",
      "user:user | 755 | 0 | target/special-dir/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  // TODO: Should this run not complain that the special-dir has the wrong owner?
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 1
      target -> source: 0
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  assertEquals(testbed.getExitCode(), 0);

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.txt | hello world",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.txt | hello world",
    "user:user | 755 | 0 | target/special-dir/",
  ]);
});
