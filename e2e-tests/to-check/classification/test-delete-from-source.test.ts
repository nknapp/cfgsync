import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("delete-from-source", async (t) => {
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
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/delete-me.txt | delete from source",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  await testbed.deleteFile("target/delete-me.txt");
  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 755 | 0 | target/",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      deleted source/delete-me.txt

      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   1
    `,
    stderr: "",
  });
});
