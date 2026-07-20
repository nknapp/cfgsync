import {
  CONFIG_TOML,
  idToGroup,
  idToUser,
  STATE_FILE,
  STATE_FILE_SUFFIX,
  TestEntry,
  TestPerms,
} from "./config.ts";

export async function readTestDir(
  baseDir: URL,
  configToml: string,
): Promise<TestEntry[]> {
  const filesAndDirs = (await Array.fromAsync(walkDir(baseDir))).toSorted(
    byPath,
  );
  return await Promise.all(
    filesAndDirs.map(async ({ stat, path, fullPath }): Promise<TestEntry> => {
      const user = idToUser[stat.uid ?? 1000];
      const group = idToGroup[stat.gid ?? 1000];
      const mode = stat.mode ?? 0o0000;
      const perms = (mode & 0o7777).toString(8) as TestPerms;
      if (stat.isDirectory) {
        return `${user}:${group} | ${perms} | 0 | ${path}/`;
      } else if (stat.isSymlink) {
        const linkTarget = await Deno.readLink(fullPath);
        return `${user}:${group} |     | 0 | ${path} -> ${linkTarget}`;
      } else {
        const raw = await Deno.readTextFile(fullPath);
        const contents = getContents(raw, configToml, path);
        return `${user}:${group} | ${perms} | 0 | ${path} | ${contents}`;
      }
    }),
  );
}

interface WalkDirResult {
  path: string;
  fullPath: URL;
  stat: Deno.FileInfo;
}

export async function* walkDir(
  baseDir: URL,
  relativeDir: string = "",
): AsyncGenerator<WalkDirResult> {
  const currentDir = new URL(relativeDir, baseDir);
  for await (const entry of Deno.readDir(currentDir)) {
    const path = relativeDir + entry.name;
    const fullPath = new URL(encodeURI("./" + path), baseDir);
    const stat = await Deno.lstat(fullPath);
    yield { path, fullPath, stat };
    if (stat.isDirectory) {
      yield* walkDir(baseDir, path + "/");
    }
  }
}

function getContents(raw: string, configToml: string, path: string) {
  let contents = raw;
  if (raw === configToml) {
    contents = CONFIG_TOML;
  } else if (path.endsWith(STATE_FILE_SUFFIX)) {
    contents = STATE_FILE;
  }
  return contents;
}

function byPath(o1: WalkDirResult, o2: WalkDirResult) {
  if (o1.path < o2.path) return -1;
  if (o1.path > o2.path) return 1;
  return 0;
}
