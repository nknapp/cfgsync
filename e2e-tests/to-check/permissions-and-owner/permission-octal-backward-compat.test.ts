import { assertEquals, CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("file-perms-public-no-change", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.conf"]
      file_perms = "public"
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.conf | config content",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 1
      target -> source: 0
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.conf -> target

      source -> target: 1
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
    "user:user | 644 | 0 | source/file.conf | config content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/file.conf | config content",
  ]);
});
