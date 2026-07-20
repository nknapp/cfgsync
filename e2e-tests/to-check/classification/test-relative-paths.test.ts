import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("relative-paths", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "../target"
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | subdir/",
      `user:user | 644 | 0 | subdir/config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | subdir/source/",
      "user:user | 644 | 0 | subdir/source/same.txt | identical content",
      "user:user | 755 | 0 | target/",
    ],
  });
  await testbed.run({ args: ["--config", "subdir/config.toml", "sync"] });

  await testbed.assertTestDir([
    "user:user | 755 | 0 | subdir/",
    `user:user | 644 | 0 | subdir/config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | subdir/config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | subdir/source/",
    "user:user | 644 | 0 | subdir/source/same.txt | identical content",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/same.txt | identical content",
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
