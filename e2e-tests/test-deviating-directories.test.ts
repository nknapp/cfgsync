import { deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("deviating-directories", async (t) => {
  const { testbed, testDir, username, groupname } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.conf"]

      [[sync.deviating]]
      path = "./target/special-dir"
      permissions = "700"
      owner = "root:root"
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | source/",
      "user:user | 0644 | 0 | source/file.conf | hello",
      "user:user | 0755 | 0 | target/",
      "user:user | 0755 | 0 | target/special-dir/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.conf -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: deindent`
      Warning: deviating directory '${testDir}/target/special-dir' has 0o755, expected 0o700 (existing directories are not modified)
      Warning: deviating directory '${testDir}/target/special-dir' is owned by ${username}:${groupname}, expected 'root:root' (existing directories are not modified)
    `,
  });
});