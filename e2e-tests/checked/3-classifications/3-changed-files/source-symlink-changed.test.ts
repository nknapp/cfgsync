import { CONFIG_TOML, deindent, STATE_FILE, TestBed } from "@/lib/index.ts";

Deno.test("sync-changed-symlink-replaces-symlink", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      "user:user | 755 | 0 | source/",
      "user:user |     | 0 | source/link.txt -> hello.txt",
      "user:user | 644 | 0 | source/hello.txt | hello",
      "user:user | 755 | 0 | target/",
      "user:user |     | 0 | target/link.txt -> hello.txt",
      "user:user | 644 | 0 | target/hello.txt | hello",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  testbed.advance("1 sec");
  await testbed.deleteFile("source/link.txt");
  await Deno.symlink("hello-new.txt", `${testDir}/source/link.txt`);

  // Sync detects the type change (file -> symlink) and copies to target
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
    deindent`
    === link.txt (source -> target) ===
    --- ${testDir}/source/link.txt${"\t"}
    +++ ${testDir}/target/link.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
    @@ -1 +1 @@
    -(file missing)
    \ No newline at end of file
    +hello
    \ No newline at end of file`,
  );

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      copied link.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  // Both sides now have the symlink
  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/hello.txt | hello",
    "user:user |     | 0 | source/link.txt -> hello-new.txt",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/hello.txt | hello",
    "user:user |     | 0 | target/link.txt -> hello-new.txt",
  ]);
});

Deno.test("sync-changed-symlink-replaces-file", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/link.txt | hello",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/link.txt | hello",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  testbed.advance("1 sec");
  await testbed.deleteFile("source/link.txt");
  await Deno.symlink("hello", `${testDir}/source/link.txt`);

  // Sync detects the type change (file -> symlink) and copies to target
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
    deindent`
    === link.txt (source -> target) ===
    --- ${testDir}/source/link.txt${"\t"}
    +++ ${testDir}/target/link.txt${"\t"}2020-01-01 00:00:00.000000000 +0000
    @@ -1 +1 @@
    -(file missing)
    \ No newline at end of file
    +hello
    \ No newline at end of file`,
  );

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      copied link.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  // Both sides now have the symlink
  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user |     | 0 | source/link.txt -> hello",
    "user:user | 755 | 0 | target/",
    "user:user |     | 0 | target/link.txt -> hello",
  ]);
});

Deno.test("sync-changed-file-replaces-symlink", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      "user:user | 755 | 0 | source/",
      "user:user | 644 | 0 | source/link.txt -> hello",
      "user:user | 755 | 0 | target/",
      "user:user | 644 | 0 | target/link.txt -> hello",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  testbed.advance("1 sec");
  await testbed.deleteFile("source/link.txt");
  await testbed.writeTextFile("source/link.txt", "file contents");

  // Sync detects the type change (file -> symlink) and copies to target
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
    deindent`
    === link.txt (source -> target) ===
    --- ${testDir}/source/link.txt${"\t"}2020-01-01 00:00:01.000000000 +0000
    +++ ${testDir}/target/link.txt${"\t"}
    @@ -1 +1 @@
    -file contents
    \ No newline at end of file
    +(file missing)
    \ No newline at end of file`,
  );

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      copied link.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  // Both sides now have the symlink
  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user | 644 | 0 | source/link.txt | file contents",
    "user:user | 755 | 0 | target/",
    "user:user | 644 | 0 | target/link.txt | file contents",
  ]);
});

Deno.test("sync-changed-broken-symlink-replaces-broken-symlink", async (t) => {
  const { testbed, testDir } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
      `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
      "user:user | 755 | 0 | source/",
      "user:user |     | 0 | source/link.txt -> hello.txt",
      "user:user | 755 | 0 | target/",
      "user:user |     | 0 | target/link.txt -> hello.txt",
    ],
    faketime: "2020-01-01T00:00:00Z",
  });

  testbed.advance("1 sec");
  await testbed.deleteFile("source/link.txt");
  await Deno.symlink("hello-new.txt", `${testDir}/source/link.txt`);

  // Sync detects the type change (file -> symlink) and copies to target
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
    deindent`
    === link.txt (source -> target) ===
    --- ${testDir}/source/link.txt${"\t"}
    +++ ${testDir}/target/link.txt${"\t"}
    `,
  );

  await testbed.testSync("config.toml", {
    code: 0,
    stdout: deindent`
      copied link.txt -> target

      source -> target: 1
      target -> source: 0
      deleted target:   0
      deleted source:   0
    `,
    stderr: "",
  });

  // Both sides now have the symlink
  await testbed.assertTestDir([
    `user:user | 644 | 0 | config.cfgsync.state | ${STATE_FILE}`,
    `user:user | 644 | 0 | config.toml | ${CONFIG_TOML}`,
    "user:user | 755 | 0 | source/",
    "user:user |     | 0 | source/link.txt -> hello-new.txt",
    "user:user | 755 | 0 | target/",
    "user:user |     | 0 | target/link.txt -> hello-new.txt",
  ]);
});
