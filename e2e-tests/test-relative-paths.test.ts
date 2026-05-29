import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("relative-paths", async (t) => {
  const testbed = await TestBed.create(t, {
    configToml: deindent`
      source_dir = "./source"
      target_dir = "../target"

      [[filter]]
      glob = "**/*.txt"
    `,
    files: [
      "user:user | 0755  | subdir/",
      "user:user | 0755  | subdir/config.toml | __CONFIG_TOML__",
      "user:user | 0755  | subdir/source/",
      "user:user | 0644  | subdir/source/same.txt | identical content",
      "user:user | 0755  | target/",
    ],
  });
  await testbed.run({ args: ["sync", "subdir/config.toml"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0755 | subdir/",
    "user:user | 0644 | subdir/config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | subdir/config.toml | __CONFIG_TOML__",
    "user:user | 0755 | subdir/source/",
    "user:user | 0644 | subdir/source/same.txt | identical content",
    "user:user | 0755 | target/",
    "user:user | 0644 | target/same.txt | identical content",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied same.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
