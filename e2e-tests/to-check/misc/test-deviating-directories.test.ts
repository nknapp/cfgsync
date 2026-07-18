import { assertEquals, TestBed } from "@/lib/index.ts";

Deno.test("deviating-directories", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: `
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.conf"]

      [[sync.deviating]]
      path = "./target/special-dir"
      owner = "root:root"
    `,
    files: [
      "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.conf | hello",
      "user:user | 755 | 0 | target/",
      "user:user | 755 | 0 | target/special-dir/",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });
  assertEquals(testbed.getExitCode(), 0);
});
