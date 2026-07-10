import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("basic-sync-to-source", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | source/",
      "user:user | 0755 | 0 | target/",
      "user:user | 0644 | 0 | target/data.txt | My data",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | 0 | source/",
    "user:user | 0644 | 0 | source/data.txt | My data",
    "user:user | 0755 | 0 | target/",
    "user:user | 0644 | 0 | target/data.txt | My data",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied target -> data.txt

      source -> target: 0
      target -> source: 1
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
