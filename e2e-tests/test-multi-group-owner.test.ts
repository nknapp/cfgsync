import { assertEquals, deindent, runningOutsideDocker } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test({
  name: "multi-group-owner",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source-with-owner"
      target = "./target-with-owner"
      globs = ["**/*.conf"]
      owner = "root:root"

      [[sync]]
      source = "./source-no-owner"
      target = "./target-no-owner"
      globs = ["**/*.conf"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source-with-owner/",
      "user:user | 0644  | source-with-owner/file.conf | owner group file",
      "user:user | 0755  | target-with-owner/",
      "user:user | 0755  | source-no-owner/",
      "user:user | 0644  | source-no-owner/file.conf | no owner group file",
      "user:user | 0755  | target-no-owner/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"], sudo: true });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.conf -> target
      copied file.conf -> target

      source -> target: 2
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source-no-owner/",
    "user:user | 0644 | source-no-owner/file.conf | no owner group file",
    "user:user | 0755 | source-with-owner/",
    "user:user | 0644 | source-with-owner/file.conf | owner group file",
    "user:user | 0755 | target-no-owner/",
    "user:user | 0644 | target-no-owner/file.conf | no owner group file",
    "user:user | 0755 | target-with-owner/",
    "root:root | 0644 | target-with-owner/file.conf | owner group file",
  ]);
});
