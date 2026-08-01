import { CONFIG_TOML, deindent, TestBed } from "@/lib/index.ts";

Deno.test("target-parent-dir-not-creatable", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | source/subdir/",
      "user:user | 644 | 0 | source/subdir/file.txt | hello",
      "root:root | 555 | 0 | target/",
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
