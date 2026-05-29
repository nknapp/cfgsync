import { assertEquals, assertOutput, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("delete-from-target", async (t) => {
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
      "user:user | 0644  | source/remove-me.txt | file to delete",
      "user:user | 0755  | target/",
    ],
  });

  await testbed.run({ args: ["sync", "config.toml"] });
  await testbed.deleteFile("source/remove-me.txt");
  await testbed.run({ args: ["sync", "config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | source/",
    "user:user | 0755 | target/",
  ]);
  testbed.assertExitCode(0);
  testbed.assertStdout(deindent`
    deleted remove-me.txt

    source -> target: 0
    target -> source: 0
    deleted target:   1
    deleted source:   0
  `);
  testbed.assertStderr("");
});
