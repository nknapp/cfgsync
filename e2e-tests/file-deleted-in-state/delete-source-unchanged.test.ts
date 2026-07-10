import { assertEquals, deindent } from "../lib/index.ts";
import { TestBed } from "../lib/TestBed.ts";

Deno.test("delete-source-unchanged", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | file content",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/file.txt | file content",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  await testbed.deleteFile("target/file.txt");

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 0
      target -> source: 1
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      deleted source/file.txt

      source -> target: 0
      target -> source: 0
      deleted target:   0
      deleted source:   1
    `,
    stderr: "",
  });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0755 | target/",
  ]);
});
