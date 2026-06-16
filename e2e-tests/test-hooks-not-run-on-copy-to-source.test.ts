import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("hooks-not-run-on-copy-to-source", async (t) => {
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
      "user:user | 0755  | target/",
      "user:user | 0644  | target/file.txt | target only content",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/file.txt | target only content",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/file.txt | target only content",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied target -> file.txt

      source -> target: 0
      target -> source: 1
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
