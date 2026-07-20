import {
  assertEquals,
  CONFIG_TOML,
  deindent,
  runningOutsideDocker,
  STATE_FILE,
  TestBed,
} from "@/lib/index.ts";

import { readTestDir } from "@/lib/readTestDir.ts";

Deno.test.beforeEach(async () => {
  try {
    await Deno.remove("/home/user/cfgsync-test-subdir", { recursive: true });
  } catch (_error) {
    // ignore error
  }
});

Deno.test({ name: "resolve tilde in target path", ignore: runningOutsideDocker }, async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "~"
      globs = ["**/*.txt"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      "user:user | 755 | 0 | source/",
      "user:user | 755 | 0 | source/cfgsync-test-subdir/",
      "user:user | 644 | 0 | source/cfgsync-test-subdir/data-source.txt | My data",
      `user:user | 0755 | 0 | /home/user/cfgsync-test-subdir/`,
      `user:user | 0755 | 0 | /home/user/cfgsync-test-subdir/subdir/`,
      `user:user | 0644 | 0 | /home/user/cfgsync-test-subdir/subdir/data-home.txt | My data`,
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  // Status shows both copies before sync
  await testbed.run({ args: ["--config", "config.toml", "status", "--short"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      1→ 1←
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "status"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      source -> target: 1
      target -> source: 1
    `,
    stderr: "",
  });

  // Diff with tilde-expanded target paths
  await testbed.run({ args: ["--config", "config.toml", "diff"] });
  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      === cfgsync-test-subdir/data-source.txt (source -> target) ===
      --- ${testDir}/source/cfgsync-test-subdir/data-source.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
      +++ /home/user/cfgsync-test-subdir/data-source.txt
      @@ -1 +1 @@
      -My data
      \ No newline at end of file
      +(file missing)
      \ No newline at end of file
      === cfgsync-test-subdir/subdir/data-home.txt (target -> source) ===
      --- /home/user/cfgsync-test-subdir/subdir/data-home.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
      +++ ${testDir}/source/cfgsync-test-subdir/subdir/data-home.txt
      @@ -1 +1 @@
      -My data
      \ No newline at end of file
      +(file missing)
      \ No newline at end of file
    `,
    stderr: "",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"]});

  testbed.assertOutput({
    code: 0,
    stdout: deindent`
      copied cfgsync-test-subdir/data-source.txt -> target
      copied target -> cfgsync-test-subdir/subdir/data-home.txt

      source -> target: 1
      target -> source: 1
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 755 | 0 | source/cfgsync-test-subdir/",
    "user:user | 644 | 0 | source/cfgsync-test-subdir/data-source.txt | My data",
    "user:user | 755 | 0 | source/cfgsync-test-subdir/subdir/",
    "user:user | 644 | 0 | source/cfgsync-test-subdir/subdir/data-home.txt | My data",
  ]);

  assertEquals(
    await readTestDir(new URL("/home/user/cfgsync-test-subdir/", import.meta.url), ""),
    [
      "user:user | 644 | 0 | data-source.txt | My data",
      "user:user | 755 | 0 | subdir/",
      "user:user | 644 | 0 | subdir/data-home.txt | My data",
    ],
  );
});
