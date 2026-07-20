import { assertEquals, CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("delete-from-target", async (t) => {
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
      "user:user | 644 | 0 | source/remove-me.txt | file to delete",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  await testbed.deleteFile("source/remove-me.txt");
  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  assertEquals(await testbed.readTestDir(), [
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 755 | 0 | target/",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      deleted remove-me.txt

      source -> target: 0
      target -> source: 0
      deleted target:   1
      deleted source:   0
    `,
    stderr: "",
  });
});
