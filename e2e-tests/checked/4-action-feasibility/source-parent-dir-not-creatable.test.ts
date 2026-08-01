import { CONFIG_TOML, deindent, TestBed } from "@/lib/index.ts";

Deno.test("source-parent-dir-not-creatable", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "root:root | 555 | 0 | source/",
      "user:user | 755 | 0 | target/",
      "user:user | 755 | 0 | target/subdir/",
      "user:user | 644 | 0 | target/subdir/file.txt | hello",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.testStatus("config.toml", {
    short: deindent`
      ✗1
    `,
    normal: deindent`
      source -> target: 0
      target -> source: 0
      failed:           1
    `,
  });
});
