import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("ignore-non-matching", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["*.txt"]
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/hello.txt | hello source",
      "user:user | 0644  | source/skip-me.conf | skip me",
      "user:user | 0755  | target/",
      "user:user | 0644  | target/data.txt | data target",
      "user:user | 0644  | target/no-sync.conf | no sync",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/data.txt | data target",
    "user:user | 0644 | source/hello.txt | hello source",
    "user:user | 0644 | source/skip-me.conf | skip me",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/data.txt | data target",
    "user:user | 0644 | target/hello.txt | hello source",
    "user:user | 0644 | target/no-sync.conf | no sync",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied target -> data.txt
      copied hello.txt -> target

      source -> target: 1
      target -> source: 1
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
