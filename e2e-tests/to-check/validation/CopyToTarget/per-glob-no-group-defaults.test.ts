import { CONFIG_TOML, deindent, TestBed } from "@/lib/index.ts";

Deno.test("per-glob-no-group-defaults", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = [
          { pattern = "file-with-perms.conf", file_perms = "private" },
          { pattern = "file-with-owner.conf", owner = "root" },
          { pattern = "file-no-defaults.conf" },
      ]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file-with-perms.conf | content",
      "user:user | 644 | 0 | source/file-with-owner.conf | content",
      "user:user | 644 | 0 | source/file-no-defaults.conf | content",
      "user:user | 755 | 0 | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
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
      Owner warning: 'file-with-owner.conf' should be owned by 'root' (run as root to fix)
      Permission warning: 'file-with-perms.conf' has 644, should be 600 (run as root to fix)
    `,
  });
});
