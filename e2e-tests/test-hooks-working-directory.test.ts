import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("hooks-working-directory-is-config-dir", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./hook-marker" }
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | subdir/",
      "user:user | 0755  | subdir/config.toml | __CONFIG_TOML__",
      "user:user | 0755  | subdir/source/",
      "user:user | 0644  | subdir/source/file.txt | file content",
      "user:user | 0755  | subdir/target/",
    ],
  });

  await testbed.run({ args: ["--config", "subdir/config.toml", "sync"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0755 | subdir/",
    "user:user | 0644 | subdir/config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | subdir/config.toml | __CONFIG_TOML__",
    "user:user | 0644 | subdir/hook-marker | ",
    "user:user | 0755 | subdir/source/",
    "user:user | 0644 | subdir/source/file.txt | file content",
    "user:user | 0755 | subdir/target/",
    "user:user | 0644 | subdir/target/file.txt | file content",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      running hook: touch ./hook-marker

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
