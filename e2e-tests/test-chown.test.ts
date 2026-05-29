import { assertEquals, deindent, runningOutsideDocker } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test({
  name: "chown-applied-when-root",
  ignore: runningOutsideDocker,
}, async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      source_dir = "./source"
      target_dir = "./target"

      [[filter]]
      glob = "**/*.conf"
      owner = "root:root"
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/nginx.conf | worker_processes 1;",
      "user:user | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"], sudo: true });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied nginx.conf -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "root:root | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/nginx.conf | worker_processes 1;",
    "user:user | 0755 | target/",
    "root:root | 0644 | target/nginx.conf | worker_processes 1;",
  ]);
});
