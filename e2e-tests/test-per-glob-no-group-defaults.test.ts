import { deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("per-glob-no-group-defaults", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = [
          { pattern = "file-with-perms.conf", permissions = "600" },
          { pattern = "file-with-owner.conf", owner = "root:root" },
          { pattern = "file-no-defaults.conf" },
      ]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file-with-perms.conf | content",
      "user:user | 0644  | source/file-with-owner.conf | content",
      "user:user | 0644  | source/file-no-defaults.conf | content",
      "user:user | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file-no-defaults.conf -> target
      copied file-with-owner.conf -> target
      copied file-with-perms.conf -> target

      source -> target: 3
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 2
    `,
    stderr: deindent`
      Permission warning: 'file-with-perms.conf' has 0o644, should be 0o600 (run as root to fix)
      Owner warning: 'file-with-owner.conf' should be owned by 'root:root' (run as root to fix)
    `,
  });
});
