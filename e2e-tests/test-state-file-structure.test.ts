import { assertEquals, deindent } from "./lib/index.ts";
import { hash, TestBed } from "./lib/TestBed.ts";

Deno.test("state-file-structure-after-sync", async (t) => {
  const { testbed, testDir, username, groupname } = await TestBed.create(t, {
    configToml: deindent`
      [[sync]]
      source = "./source"
      target = "./target"
      globs = ["**/*"]
    `,
    files: [
      "user:user | 0755 | 0 | config.toml | __CONFIG_TOML__",
      "user:user | 0755 | 0 | source/",
      "user:user | 0644 | 0 | source/file.txt | hello",
      `user:user |      | 0 | source/link.txt -> file.txt`,
      "user:user | 0755 | 0 | source/subdir/",
      "user:user | 0644 | 0 | source/subdir/nested.txt | nested content",
      "user:user | 0755 | 0 | target/",
    ],
    faketime: "2026-05-20T15:00:00Z",
  });

  await testbed.run({ args: ["--config", "config.toml", "sync"] });

  const stateToml = await testbed.readTextFile("config.cfgsync.state");

  const expected = deindent`
    last_sync = "2026-05-20T15:00:00Z"

    [[file]]
    group = "${testDir}/target"
    path = "file.txt"
    hash = "${hash("hello")}"
    perms = "644"
    owner = "${username}:${groupname}"
    mtime = "2026-05-20T15:00:00.000Z"

    [[file]]
    group = "${testDir}/target"
    path = "link.txt"
    hash = "${hash("file.txt")}"
    perms = "0"
    owner = ""
    mtime = "2026-05-20T15:00:00.000Z"

    [[file]]
    group = "${testDir}/target"
    path = "subdir/nested.txt"
    hash = "${hash("nested content")}"
    perms = "644"
    owner = "${username}:${groupname}"
    mtime = "2026-05-20T15:00:00.000Z"
  `;

  assertEquals(stateToml, expected);
});
