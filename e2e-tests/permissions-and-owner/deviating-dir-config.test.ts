import { assertEquals, deindent } from "../lib/index.ts";
import { TestBed } from "../lib/TestBed.ts";

Deno.test("deviating-dir-config", async (t) => {
  const { testbed, testDir: _ } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]

      [[sync.deviating]]
      path = "./target/special-dir"
      owner = "root:root"
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | source/",
      "user:user | 0644 | 0 | source/file.txt | hello world",
      "user:user | 0755 | 0 | target/",
      "user:user | 0755 | 0 | target/special-dir/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 1
      target -> source: 0
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  assertEquals(testbed.getExitCode(), 0);
  const stderr = testbed.getStderr();
  assertEquals(stderr.includes("deviating directory"), true);
  assertEquals(stderr.includes("expected 'root:root'"), true);

  assertEquals(await testbed.readTestDir(), [
    `user:user | 0644 | 0 | config.cfgsync.state | CFGSYNC_STATE`,
    "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
    "user:user | 0755 | 0 | source/",
    "user:user | 0644 | 0 | source/file.txt | hello world",
    "user:user | 0755 | 0 | target/",
    "user:user | 0644 | 0 | target/file.txt | hello world",
    "user:user | 0755 | 0 | target/special-dir/",
  ]);
});
