import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("deviating-directories", async (t) => {
  const { testbed, testDir: _testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.conf"]

      [[sync.deviating]]
      path = "./target/special-dir"
      owner = "root:root"
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | source/",
      "user:user | 0644 | 0 | source/file.conf | hello",
      "user:user | 0755 | 0 | target/",
      "user:user | 0755 | 0 | target/special-dir/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  const stderr = testbed.getStderr();
  assertEquals(stderr.includes("deviating directory"), true);
  assertEquals(stderr.includes("expected 'root:root'"), true);
});