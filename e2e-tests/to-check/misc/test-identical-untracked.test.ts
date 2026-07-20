import { assertEquals, CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("identical-untracked", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.conf"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/duplicate.conf | same content on both sides",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/duplicate.conf | same content on both sides",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  assertEquals(await testbed.readTestDir(), [
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/duplicate.conf | same content on both sides",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/duplicate.conf | same content on both sides",
  ]);
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
});
