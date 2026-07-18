import { assertEquals, deindent, runningOutsideDocker, TestBed } from "@/lib/index.ts";

Deno.test({
  name: "chown-applied-when-root",
  ignore: runningOutsideDocker,
}, async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.conf"]
      owner = "root:root"
    `,
    files: [
      "root:root | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.conf | some content",
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
    "root:root | 644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "root:root | 755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/file.conf | some content",
    "user:user | 755 | 0 | target/",
    "root:root | 644 | 0 | target/file.conf | some content",
  ]);
});
