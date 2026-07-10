import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("copy data to absolute target path", async (t) => {
  const { testbed } = await TestBed.create(t, ({ testDir }) => ({
    configToml: deindent`
      [[sync]]
      source = "./source/"
      target = "${testDir}/target"
      globs = [".subdir/**/*"]
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | source/",
      "user:user | 0755 | 0 | source/.subdir/",
      "user:user | 0755 | 0 | source/.subdir/subsub/",
      "user:user | 0644 | 0 | source/.subdir/subsub/new.txt | newfile",
      "user:user | 0755 | 0 | target/",
    ],
  }));

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  assertEquals(await testbed.readTestDir(), [
    "user:user | 0644 | 0 | config.cfgsync.state | CFGSYNC_STATE",
    "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | 0 | source/",
    "user:user | 0755 | 0 | source/.subdir/",
    "user:user | 0755 | 0 | source/.subdir/subsub/",
    "user:user | 0644 | 0 | source/.subdir/subsub/new.txt | newfile",
    "user:user | 0755 | 0 | target/",
    "user:user | 0755 | 0 | target/.subdir/",
    "user:user | 0755 | 0 | target/.subdir/subsub/",
    "user:user | 0644 | 0 | target/.subdir/subsub/new.txt | newfile",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied .subdir/subsub/new.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
