import { assertEquals, assertOutput, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("basic-sync-to-target", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      source_dir = "./source"
      target_dir = "./target"

      [[filter]]
      glob = "**/*.txt"
    `,
    files: [
      "user:user | 0755  | config.toml | __CONFIG_TOML__",
      "user:user | 0755  | source/",
      "user:user | 0644  | source/hello.txt | hello from source",
      "user:user | 0755  | source/subdir/",
      "user:user | 0644  | source/subdir/deep.txt | deep nested file",
      "user:user | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0644 | source/hello.txt | hello from source",
    "user:user | 0755 | source/subdir/",
    "user:user | 0644 | source/subdir/deep.txt | deep nested file",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/hello.txt | hello from source",
    "user:user | 0755 | target/subdir/",
    "user:user | 0644 | target/subdir/deep.txt | deep nested file",
  ]);
  testbed.assertExitCode(0);
  testbed.assertStdout(deindent`
    copied hello.txt -> target
    copied subdir/deep.txt -> target

    source -> target: 2
    target -> source: 0
    deleted target:   0
    deleted source:   0
  `);
  testbed.assertStderr("");
});
