import { assertEquals, assertOutput, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("chown-applied-when-root", async (t) => {
  if (Deno.env.get("E2E_IN_DOCKER") !== "true") {
    return;
  }

  const testbed = await TestBed.create(t, {
    requiresRootAccess: true,
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

  const cfgSync = Deno.env.get("CFGSYNC");
  if (!cfgSync) throw new Error("CFGSYNC not set");

  const cmd = new Deno.Command("sudo", {
    args: [cfgSync, "sync", "config.toml"],
    cwd: testbed.dir.pathname,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await cmd.output();

  assertEquals(0, output.code);

  const stdout = new TextDecoder().decode(output.stdout);
  assertOutput(
    stdout,
    deindent`
      copied nginx.conf -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
  );

  const stderr = new TextDecoder().decode(output.stderr);
  assertOutput(stderr, "");

  assertEquals(await testbed.readTestDir(), [
    "root:root | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/nginx.conf | worker_processes 1;",
    "user:user | 0755 | target/",
    "root:root | 0644 | target/nginx.conf | worker_processes 1;",
  ]);
});
