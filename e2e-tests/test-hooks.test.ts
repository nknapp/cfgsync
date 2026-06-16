import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("hooks-basic-execution", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./target/hook-ran" }
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/file.txt | file content",
      "user:user | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | file content",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | file content",
    "user:user | 0644 | target/hook-ran | ",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      running hook: touch ./target/hook-ran

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
