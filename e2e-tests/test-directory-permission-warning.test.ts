import { deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("directory-permission-warning", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      dir_perms = "private"
      globs = ["**/*"]
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | source/",
      "user:user | 0755 | 0 | source/subdir/",
      "user:user | 0644 | 0 | source/subdir/file.txt | hello",
      "user:user | 0755 | 0 | target/",
      "user:user | 0755 | 0 | target/subdir/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied subdir/file.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
      permission skips: 1
    `,
    stderr: deindent`
      Permission warning: directory 'subdir' has 0o755, should be 0o700 (run as root to fix)
    `,
  });
});
