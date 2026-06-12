import { deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("per-glob-owner-and-permissions", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      owner = "root:root"
      permissions = "644"
      globs = [
          "*.conf",
          { pattern = "override-perms.key", permissions = "600" },
          { pattern = "override-owner.key", permissions = "644", owner = "nobody:nogroup" },
      ]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.conf | default perms and owner",
      "user:user | 0644  | source/override-perms.key | per-glob perms override",
      "user:user | 0644  | source/override-owner.key | per-glob owner override",
      "user:user | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.conf -> target
      copied override-owner.key -> target
      copied override-perms.key -> target

      source -> target: 3
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 4
    `,
    stderr: deindent`
      Owner warning: 'file.conf' should be owned by 'root:root' (run as root to fix)
      Permission warning: 'override-perms.key' has 0o644, should be 0o600 (run as root to fix)
      Owner warning: 'override-perms.key' should be owned by 'root:root' (run as root to fix)
      Owner warning: 'override-owner.key' should be owned by 'nobody:nogroup' (run as root to fix)
    `,
  });
});
