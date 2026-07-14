import { deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("copy-to-source-permission-check", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      file_perms = "private"
      globs = ["**/*.conf"]
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | source/",
      "user:user | 0755 | 0 | target/",
      "user:user | 0644 | 0 | target/file.conf | from target",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 1
    `,
    stderr: deindent`
      Warning: skipping 'file.conf' (target file has unexpected permissions 0o644, expected 0o600 for this preset)
    `,
  });
});
