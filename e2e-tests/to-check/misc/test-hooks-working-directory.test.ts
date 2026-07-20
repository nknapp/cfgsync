import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("hooks-working-directory-is-config-dir", async (t) => {
  const { testbed } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      hooks = { after = "touch ./hook-marker" }
      globs = ["**/*.txt"]
    `,
    files: [
      "user:user | 755 | 0 | subdir/",
      `user:user | 644 | 0 | subdir/config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | subdir/source/",
      "user:user | 644 | 0 | subdir/source/file.txt | file content",
      "user:user | 755 | 0 | subdir/target/",
    ],
  });

  await testbed.run({ args: ["--config", "subdir/config.toml", "sync"] });

  await testbed.assertTestDir([
    "user:user | 755 | 0 | subdir/",
    `user:user | 644 | 0 | subdir/config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | subdir/config.toml | ${CONFIG_TOML}`,
    "user:user | 644 | 0 | subdir/hook-marker | ",
    "user:user | 755 | 0 | subdir/source/",
    "user:user | 644 | 0 | subdir/source/file.txt | file content",
    "user:user | 755 | 0 | subdir/target/",
    "user:user | 644 | 0 | subdir/target/file.txt | file content",
  ]);
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied file.txt -> target
      running hook: touch ./hook-marker

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
