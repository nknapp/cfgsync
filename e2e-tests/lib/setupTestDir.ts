import { requireEnv } from "./requireEnv.ts";
import { invertKeyValues } from "./invertKeyValues.ts";

type TestPath = string;
type TestContents = string;
type TestUser = keyof typeof userIdMap;
type TestGroup = keyof typeof groupIdMap;
type TestOwner = `${"user" | "root"}:${"user" | "root"}`;
type TestPerms = `${number | ""}${number}${number}${number}`;

export type TestFile =
  | `${TestOwner} | ${TestPerms} | ${TestPath} | ${TestContents}`
  | `${TestOwner} | ${TestPerms} | ${TestPath}/`;

export interface TestSpec {
  files: TestFile[];
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

  const isDirectory = path.endsWith("/");

  const realPath = new URL(encodeURI(path), testDir);
  if (isDirectory) {
    await Deno.mkdir(realPath);
  } else {
    assertNotNull(
      contents,
      "contents must not be null if path does not end with '/'",
    );

    await Deno.create(realPath);
    await Deno.writeTextFile(
      realPath,
      contents == CONFIG_TOML_PLACEHOLDER ? configToml : contents,
    );
  }
  await Deno.chmod(realPath, parseInt(perms, 8));

  if (Deno.uid() === 0) {
    await Deno.chown(realPath, uid, gid);
  }
}

export function getTestDir(t: Deno.TestContext) {
  const testBaseDir = requireEnv("E2E_TEST_DIR");
  const base = new URL(testBaseDir, import.meta.url);
  return new URL(t.name.replace(/\W/g, "_") + "/", base);
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
): Promise<TestFile[]> {
  const filesAndDirs = (await Array.fromAsync(walkDir(baseDir))).toSorted(
    byPath,
  );
  return await Promise.all(
    filesAndDirs.map(async ({ stat, path, fullPath }): Promise<TestFile> => {
      const user = idToUser[stat.uid ?? 1000];
      const group = idToGroup[stat.gid ?? 1000];
      const mode = stat.mode ?? 0o0000;
      const perms = (mode & 0o7777).toString(8).padStart(4, "0") as TestPerms;
      if (stat.isDirectory) {
        return `${user}:${group} | ${perms} | ${path}/`;
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
  console.log(relativeDir);
  for await (const entry of Deno.readDir(currentDir)) {
    const path = relativeDir + entry.name;
    const fullPath = new URL(encodeURI("./" + path), baseDir);
    console.log(fullPath.pathname);
    const stat = await Deno.stat(fullPath);
    yield { path, fullPath, stat };
    if (stat.isDirectory) {
      console.log("isDir", path);
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
