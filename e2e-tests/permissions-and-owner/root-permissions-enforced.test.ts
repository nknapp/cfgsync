import { assertEquals, deindent, runningOutsideDocker } from "../lib/index.ts";
import { TestBed } from "../lib/TestBed.ts";

Deno.test({
  name: "root-permissions-enforced",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.conf"]
      file_perms = "private"
    `,
    files: [
      "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.conf | secret config",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"], sudo: true });

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
    "user:user | 644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.conf | secret config",
    "user:user | 755 | 0 | target/",
    "user:user | 600 | 0 | target/file.conf | secret config",
  ]);
});
