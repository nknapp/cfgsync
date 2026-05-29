import TestContext = Deno.TestContext;

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
  requiresRootAccess?: true;
  files: TestFile[];
  configToml: string;
}

const userIdMap = {
  user: 1000,
  root: 0,
};
const groupIdMap = {
  user: 1000,
  root: 0,
};

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
  console.log("Creating", realPath.pathname);
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
      contents == "__CONFIG_TOML__" ? configToml : contents,
    );
  }
  await Deno.chmod(realPath, parseInt(perms, 8));

  if (Deno.uid() === 0) {
    await Deno.chown(realPath, uid, gid);
  }
}

function resolveBaseUrl(raw: string): URL {
  if (raw.includes("://")) {
    return new URL(raw.endsWith("/") ? raw : raw + "/");
  }
  const abs = raw.startsWith("/") ? raw : "/" + raw;
  const withSlash = abs.endsWith("/") ? abs : abs + "/";
  return new URL("file://" + withSlash);
}

export function getTestDir(t: Deno.TestContext) {
  const base = Deno.env.get("E2E_TEST_DIR");
  const baseUrl = base
    ? resolveBaseUrl(base)
    : new URL("_tmp/", t.origin);
  return new URL(
    t.name.replace(/\W/g, "_") + "/",
    baseUrl,
  );
}

export async function setupTestDir(
  t: TestContext,
  spec: TestSpec,
): Promise<URL | null> {
  if (spec.requiresRootAccess && Deno.env.get("E2E_IN_DOCKER") !== "true") {
    console.log(
      `Skipping test "${t.name}" (requires root, not running in Docker)`,
    );
    return null;
  }

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

const _currentUid = Deno.uid() ?? 1000;
const _currentGid = Deno.gid() ?? 1000;
const idToUser: Record<number, TestUser> = {
  0: "root",
};
idToUser[_currentUid] = "user";
const idToGroup: Record<number, TestGroup> = {
  0: "root",
};
idToGroup[_currentGid] = "user";

async function walkDir(
  baseDir: URL,
  dir: URL,
  result: TestFile[],
  configToml: string,
) {
  const entries = [];
  for await (const entry of Deno.readDir(dir)) entries.push(entry);
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const entry of entries) {
    const fullPath = new URL(encodeURIComponent(entry.name), dir);
    const stat = await Deno.stat(fullPath);
    assertNotNull(stat.mode, "stat.mode must not be null");
    assertNotNull(stat.uid, "stat.uid must not be null");
    assertNotNull(stat.gid, "stat.gid must not be null");
    const user = idToUser[stat.uid] ?? `uid:${stat.uid}`;
    const group = idToGroup[stat.gid] ?? `gid:${stat.gid}`;
    const perms = (stat.mode & 0o7777).toString(8).padStart(4, "0");
    const relPath = fullPath.pathname.slice(baseDir.pathname.length);

    if (entry.isDirectory) {
      result.push(`${user}:${group} | ${perms} | ${relPath}/` as TestFile);
      await walkDir(
        baseDir,
        new URL(encodeURIComponent(entry.name) + "/", dir),
        result,
        configToml,
      );
    } else if (entry.isFile) {
      const raw = await Deno.readTextFile(fullPath);
      let contents: string;
      if (raw === configToml) {
        contents = "__CONFIG_TOML__";
      } else if (entry.name.endsWith("cfgsync.state")) {
        contents = "CFGSYNC_STATE";
      } else {
        contents = raw;
      }
      result.push(
        `${user}:${group} | ${perms} | ${relPath} | ${contents}` as TestFile,
      );
    }
  }
}

export async function readTestDir(
  t: TestContext,
  spec: TestSpec,
): Promise<TestFile[]> {
  const testDir = getTestDir(t);
  const result: TestFile[] = [];
  await walkDir(testDir, testDir, result, spec.configToml);
  return result;
}
