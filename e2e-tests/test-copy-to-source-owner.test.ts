import { assertEquals, deindent, runningOutsideDocker } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test({
  name: "copy-to-source-respects-config-owner",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/file.txt | target-only file",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"], sudo: true });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "root:root | 0644 | source/file.txt | target-only file",
    "user:user | 0755 | target/",
    "root:root | 0644 | target/file.txt | target-only file",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied target -> file.txt

      source -> target: 0
      target -> source: 1
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
