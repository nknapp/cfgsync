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
    group_index = 0
    path = "file.txt"
    source_mtime = 1779289200000
    target_mtime = 1779289200000
    hash = "404d463254077143e09d7ae4ea7f4b2"
    last_sync = 1779289200000

    [[file]]
    group_index = 0
    path = "link.txt"
    source_mtime = 1779289200000
    target_mtime = 1779289200000
    is_symlink = true
    symlink_target = "file.txt"
    hash = "334786b6e9f5ba82ec18e5f50f5d9b13"
    last_sync = 1779289200000

    [[file]]
    group_index = 0
    path = "subdir/nested.txt"
    source_mtime = 1779289200000
    target_mtime = 1779289200000
    hash = "5b73c721e0c7fe27b3ef8ae8bfe589c6"
    last_sync = 1779289200000
  `;

  assertEquals(stateToml.trim(), expected.trim());
});
