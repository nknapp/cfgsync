import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("multi-group-owner", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./nginx-source"
      target = "./nginx-target"
      globs = ["**/*.conf"]
      owner = "root:root"

      [[sync]]
      source = "./app-source"
      target = "./app-target"
      globs = ["**/*.conf"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | nginx-source/",
      "user:user | 0644  | nginx-source/nginx.conf | server { listen 80; }",
      "user:user | 0755  | nginx-target/",
      "user:user | 0755  | app-source/",
      "user:user | 0644  | app-source/app.conf | debug = false",
      "user:user | 0755  | app-target/",
    ],
  });

  await testbed.run({ args: ["status", "config.toml"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 2
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  await testbed.run({ args: ["sync", "config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0755 | app-source/",
    "user:user | 0644 | app-source/app.conf | debug = false",
    "user:user | 0755 | app-target/",
    "user:user | 0644 | app-target/app.conf | debug = false",
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | nginx-source/",
    "user:user | 0644 | nginx-source/nginx.conf | server { listen 80; }",
    "user:user | 0755 | nginx-target/",
    "user:user | 0644 | nginx-target/nginx.conf | server { listen 80; }",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied nginx.conf -> target
      copied app.conf -> target

      source -> target: 2
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 1
    `,
    stderr: deindent`
      Owner warning: 'nginx.conf' should be owned by 'root:root' (run as root to fix)
    `,
  });
});
