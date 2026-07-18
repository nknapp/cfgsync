import { deindent, TestBed } from "@/lib/index.ts";

Deno.test("status-short", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/file.txt | new file",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/other.txt | target file",
    ],
  });

  await testbed.run({ args: ["--config", "config.toml", "status", "--short"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      1→ 1←
    `,
    stderr: "",
  });
});
