import { assertEquals, assertOutput, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("delete-from-source", async (t) => {
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
      "user:user | 0755  | target/",
      "user:user | 0644  | target/delete-me.txt | delete from source",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"] });
  await testbed.deleteFile("target/delete-me.txt");
  await testbed.run({ args: ["sync", "config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0755 | target/",
  ]);
  testbed.assertExitCode(0);
  testbed.assertStdout(deindent`
    deleted source/delete-me.txt

    source -> target: 0
    target -> source: 0
    deleted target:   0
    deleted source:   1
  `);
  testbed.assertStderr("");
});
