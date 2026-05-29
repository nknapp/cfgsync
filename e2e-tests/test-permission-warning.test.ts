import { assertEquals, assertOutput, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("permission-warning", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      source_dir = "./source"
      target_dir = "./target"

      [[filter]]
      glob = "**/*.conf"
      permissions = 0o600
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/nginx.conf | worker_processes 1;",
      "user:user | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/nginx.conf | worker_processes 1;",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/nginx.conf | worker_processes 1;",
  ]);
  testbed.assertExitCode(0);
  testbed.assertStdout(deindent`
    copied nginx.conf -> target

    source -> target: 1
    target -> source: 0
    deleted target:   0
    deleted source:   0
    permission skips: 1
  `);
  testbed.assertStderr(deindent`
    Permission warning: 'nginx.conf' has 0o644, should be 0o600 (run as root to fix)
  `);
});
