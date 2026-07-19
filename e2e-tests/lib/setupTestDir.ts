import {
  CONFIG_TOML_PLACEHOLDER,
  groupToId,
  TestGroup,
  TestSpec,
  TestUser,
  userToId,
} from "./config.ts";

export async function setupTestDir(
  testDir: URL,
  spec: TestSpec,
): Promise<void> {
  await new SetupTestDir(testDir, spec).run();
}

class SetupTestDir {
  constructor(private testDir: URL, private spec: TestSpec) {}

  async run(): Promise<void> {
    try {
      await Deno.remove(this.testDir, { recursive: true });
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e;
      }
    }
    await Deno.mkdir(this.testDir, { recursive: true });

    const factories = this.spec.files.map((line) => this.createFactory(line));
    factories.sort((a, b) => a.order - b.order);

    for (const factory of factories) {
      await factory.create();
    }
  }

  createFactory(line: string): Factory {
    const parts = line.split(" | ");
    const [owner, perms, mtimeStr, path, contents] = parts;

    assertNotNull(owner, "owner must not be null");
    assertNotNull(perms, "perms must not be null");
    assertNotNull(path, "path must not be null");
    const [user, group] = owner.split(":");
    const uid = userToId(user as TestUser);
    const gid = groupToId(group as TestGroup);
    const testDir = this.testDir;
    const mtime = computeMtime(this.spec, mtimeStr);

    const baseInit: BaseFactoryInit = {
      testDir,
      path,
      mtime,
      perms,
      gid,
      uid,
    };

    if (path.endsWith("/")) {
      return new DirectoryFactory(baseInit);
    }
    if (path.includes(" -> ")) {
      return new SymlinkFactory(baseInit);
    }
    if (contents == CONFIG_TOML_PLACEHOLDER) {
      return new FileFactory({ ...baseInit, contents: this.spec.configToml });
    }
    return new FileFactory({ ...baseInit, contents });
  }
}

interface Factory {
  readonly order: number;
  create(): Promise<void>;
}

interface BaseFactoryInit {
  testDir: URL;
  path: string;
  uid: number;
  gid: number;
  perms: string;
  mtime: Date;
}

interface DirectoryFactoryInit extends BaseFactoryInit {}

class DirectoryFactory implements Factory {
  constructor(private init: DirectoryFactoryInit) {}

  readonly order = 0;

  async create() {
    const realPath = new URL(this.init.path, this.init.testDir);
    console.log(`Creating dir: ${realPath.pathname}`);
    await Deno.mkdir(realPath);
    await Deno.utime(realPath, this.init.mtime, this.init.mtime);
    await Deno.chmod(realPath, parseInt(this.init.perms, 8));
    await setOwner(realPath, this.init.uid, this.init.gid);
  }
}

interface FileFactoryInit extends BaseFactoryInit {
  contents: string;
}

class FileFactory implements Factory {
  readonly order = 0;

  constructor(private init: FileFactoryInit) {
    assertNotNull(
      init.contents,
      "contents must not be null if path does not end with '/'",
    );
  }

  async create() {
    const realPath = new URL(this.init.path, this.init.testDir);
    await Deno.create(realPath);
    await Deno.writeTextFile(realPath, this.init.contents);
    await Deno.utime(realPath, this.init.mtime, this.init.mtime);
    await Deno.chmod(realPath, parseInt(this.init.perms, 8));
    await setOwner(realPath, this.init.uid, this.init.gid);
  }
}

interface SymlinkFactoryInit extends BaseFactoryInit {
}

class SymlinkFactory implements Factory {
  readonly order = 0;

  constructor(private init: SymlinkFactoryInit) {}

  async create() {
    const [sourcePath, targetPath] = this.init.path.split(" -> ");
    const absoluteSourcePath = new URL(encodeURI(sourcePath), this.init.testDir);
    await Deno.symlink(targetPath, absoluteSourcePath);
    await new Deno.Command("touch", {
      args: ["-h", "-d", this.init.mtime.toISOString(), absoluteSourcePath.pathname],
      stdout: "null",
      stderr: "null",
    }).output();
  }
}

function assertNotNull<T>(
  value: T | null | undefined,
  message: string,
): asserts value is T {
  if (value == null) {
    throw new Error(message);
  }
}

function parseMtimeOffset(mtimeStr: string): number {
  if (!mtimeStr || mtimeStr === "0") return 0;
  const msMatch = mtimeStr.match(/^(-?\d+)\s*ms$/);
  if (msMatch) return parseInt(msMatch[1]);
  const secMatch = mtimeStr.match(/^(-?\d+)\s*sec$/);
  if (secMatch) return parseInt(secMatch[1]) * 1000;
  return 0;
}

function computeMtime(spec: TestSpec, mtimeStr: string): Date {
  const offsetMs = parseMtimeOffset(mtimeStr);
  const base = spec.faketime ? new Date(spec.faketime) : new Date();
  return new Date(base.getTime() + offsetMs);
}

async function setOwner(realPath: URL, uid: number, gid: number) {
  if (Deno.uid() === 0) {
    await Deno.chown(realPath, uid, gid);
  } else if (uid !== Deno.uid() || gid !== Deno.gid()) {
    await Deno.spawnAndWait("sudo", ["chown", `${uid}:${gid}`, realPath.pathname]);
  }
}
