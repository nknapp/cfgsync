import { CONFIG_TOML, deindent, TestBed } from "@/lib/index.ts";

Deno.test("directory-permission-warning", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      dir_perms = "private"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | source/subdir/",
      "user:user | 644 | 0 | source/subdir/file.txt | hello",
      "user:user | 755 | 0 | target/",
      "user:user | 755 | 0 | target/subdir/",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  await testbed.testStatus("config.toml", {
    short: deindent`
      1→
    `,
    normal: deindent`
      source -> target: 1
      target -> source: 0
    `,
  });

  await testbed.testDiff(
    "config.toml",
    `=== subdir/file.txt (source -> target) ===\n` +
      `--- ${testDir}/source/subdir/file.txt\t2020-01-01 00:00:00.000000000 +0000\n` +
      `+++ ${testDir}/target/subdir/file.txt\n` +
      `@@ -1 +1 @@\n` +
      `-hello\n` +
      `\\ No newline at end of file\n` +
      `+(file missing)\n` +
      `\\ No newline at end of file`,
  );

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      copied subdir/file.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });
});
