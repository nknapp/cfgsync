import { assertEquals, deindent } from "./lib/index.ts";
import { TestBed } from "./lib/TestBed.ts";

Deno.test("state-file-structure-after-sync", async (t) => {
  const { testbed } = await TestBed.create(t, {
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
    group = "TARGET_ABS"
    path = "file.txt"
    hash = "404d463254077143e09d7ae4ea7f4b2"
    perms = "644"
    owner = "user:user"
    mtime = "2026-05-20T15:00:00.000Z"

    [[file]]
    group = "TARGET_ABS"
    path = "link.txt"
    hash = "334786b6e9f5ba82ec18e5f50f5d9b13"
    perms = "0"
    owner = ""
    mtime = "2026-05-20T15:00:00.000Z"

    [[file]]
    group = "TARGET_ABS"
    path = "subdir/nested.txt"
    hash = "5b73c721e0c7fe27b3ef8ae8bfe589c6"
    perms = "644"
    owner = "user:user"
    mtime = "2026-05-20T15:00:00.000Z"
  `;

  const actual = stateToml.replace(
    /group = ".*"/g,
    'group = "TARGET_ABS"',
  );
  assertEquals(actual.trim(), expected.trim());
});
