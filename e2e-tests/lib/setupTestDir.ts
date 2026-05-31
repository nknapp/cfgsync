import { testBaseDir } from "./env.ts";
import { invertKeyValues } from "./invertKeyValues.ts";

type TestPath = string;
type TestContents = string;
type TestUser = keyof typeof userIdMap;
type TestGroup = keyof typeof groupIdMap;
type TestOwner = `${"user" | "root"}:${"user" | "root"}`;
type TestPerms = `${number | ""}${number}${number}${number}`;

type TestFile = `${TestOwner} | ${TestPerms} | ${TestPath} | ${TestContents}`;
type TestSymlink = `${TestOwner} | ${TestPerms} | ${TestPath} -> ${TestPath}`;
type TestDir = `${TestOwner} | ${TestPerms} | ${TestPath}/`;
export type TestEntry = TestFile | TestSymlink | TestDir;

export interface TestSpec {
  files: TestEntry[];
  configToml: string;
}

const userIdMap = {
  user: Deno.uid() ?? 1000,
  root: 0,
};
const idToUser = invertKeyValues(userIdMap);

const groupIdMap = {
  user: Deno.gid() ?? 1000,
  root: 0,
};
const idToGroup = invertKeyValues(groupIdMap);

function userToId(user: TestUser): number {
  if (user in userIdMap) return userIdMap[user] as number;
  throw new Error(
    `User must be one of ${Object.keys(userToId)} but was '${user}'`,
  );
}

function groupToId(group: TestGroup): number {
  if (group in groupIdMap) return groupIdMap[group] as number;
  throw new Error(
    `Group must be one of ${Object.keys(groupIdMap)} but was '${group}'`,
  );
}

function assertNotNull<T>(
  value: T | null | undefined,
  message: string,
): asserts value is T {
  if (value == null) {
    throw new Error(message);
  }
}

const CONFIG_TOML_PLACEHOLDER = "__CONFIG_TOML__";

async function createDirOrFile(line: string, testDir: URL, configToml: string) {
  const [owner, perms, path, contents] = line.split(" | ");
  assertNotNull(owner, "owner must not be null");
  assertNotNull(perms, "perms must not be null");
  assertNotNull(path, "path must not be null");
  const [user, group] = owner.split(":");
  const uid = userToId(user as TestUser);
  const gid = groupToId(group as TestGroup);
  const realPath = await createNoOwnerAndPerms(path, testDir, contents, configToml);
  if (!(await Deno.lstat(realPath)).isSymlink) {
    await Deno.chmod(realPath, parseInt(perms, 8));

    if (Deno.uid() === 0) {
      await Deno.chown(realPath, uid, gid);
    }
  }
}

async function createDirectory(path: string, testDir: URL) {
  const realPath = new URL(encodeURI(path), testDir);
  await Deno.mkdir(realPath);
  return realPath;
}

async function createRegularFile(path: string, testDir: URL, contents: string, configToml: string) {
  const realPath = new URL(encodeURI(path), testDir);
  await Deno.create(realPath);
  await Deno.writeTextFile(
    realPath,
    contents == CONFIG_TOML_PLACEHOLDER ? configToml : contents,
  );
  return realPath;
}

async function createSymlink(symlinkSpec: string, testDir: URL) {
  const [sourcePath, targetPath] = symlinkSpec.split(" -> ");
  const absoluteSourcePath = new URL(encodeURI(sourcePath), testDir);
  await Deno.symlink(targetPath, absoluteSourcePath);
  return absoluteSourcePath;
}

async function createNoOwnerAndPerms(
  path: string,
  testDir: URL,
  contents: string | undefined,
  configToml: string,
) {
  const type = path.endsWith("/") ? "directory" : (path.includes(" -> ") ? "symlink" : "file");

  switch (type) {
    case "directory":
      return await createDirectory(path, testDir);
    case "file":
      assertNotNull(
        contents,
        "contents must not be null if path does not end with '/'",
      );
      return await createRegularFile(path, testDir, contents, configToml);
    case "symlink":
      return await createSymlink(path, testDir);
  }
}

export function getTestDir(t: Deno.TestContext) {
  return new URL(t.name.replace(/\W/g, "_") + "/", testBaseDir);
}

export async function setupTestDir(
  t: Deno.TestContext,
  spec: TestSpec,
): Promise<URL> {
  const testDir = getTestDir(t);
  try {
    await Deno.remove(testDir, { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  await Deno.mkdir(testDir, { recursive: true });

  for (const file of spec.files) {
    await createDirOrFile(file, testDir, spec.configToml);
  }
  return testDir;
}

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
      const perms = (mode & 0o7777).toString(8).padStart(4, "0") as TestPerms;
      if (stat.isDirectory) {
        return `${user}:${group} | ${perms} | ${path}/`;
      } else if (stat.isSymlink) {
        const linkTarget = await Deno.readLink(fullPath);
        return `${user}:${group} | ${perms} | ${path} -> ${linkTarget}`;
      } else {
        const raw = await Deno.readTextFile(fullPath);
        const contents = getContents(raw, configToml, path);
        return `${user}:${group} | ${perms} | ${path} | ${contents}`;
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
    contents = CONFIG_TOML_PLACEHOLDER;
  } else if (path.endsWith(".cfgsync.state")) {
    contents = "CFGSYNC_STATE";
  }
  return contents;
}

function byPath(o1: WalkDirResult, o2: WalkDirResult) {
  if (o1.path < o2.path) return -1;
  if (o1.path > o2.path) return 1;
  return 0;
}
