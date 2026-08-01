import { invertKeyValues } from "./invertKeyValues.ts";

export type TestPath = string;
export type TestContents = string;
export type TestUser = keyof typeof userIdMap;
export type TestGroup = keyof typeof groupIdMap;
export type TestOwner = `${"user" | "root"}:${"user" | "root"}` | "root:wheel" | "nobody:daemon";
export type TestPerms = `${number | ""}${number}${number}${number}`;
export type TestMtime = string;

export type TestFile = `${TestOwner} | ${TestPerms} | ${TestMtime} | ${TestPath} | ${TestContents}`;
export type TestSymlink = `${TestOwner} | ${TestPerms} | ${TestMtime} | ${TestPath} -> ${TestPath}`;
export type TestDir = `${TestOwner} | ${TestPerms} | ${TestMtime} | ${TestPath}/`;
export type TestEntry = TestFile | TestSymlink | TestDir;
export const CONFIG_TOML = "__CONFIG_TOML__";
export const STATE_FILE = "CFGSYNC_STATE";

export const STATE_FILE_SUFFIX = ".cfgsync.state";

export interface TestSpec {
  files: TestEntry[];
  configToml: string;
  faketime?: string;
}

export const userIdMap = {
  user: Deno.uid() ?? 1000,
  root: 0,
};

export const idToUser = invertKeyValues(userIdMap);
export const groupIdMap = {
  user: Deno.gid() ?? 1000,
  root: 0,
};

export const idToGroup = invertKeyValues(groupIdMap);

export function userToId(user: TestUser): number {
  if (user in userIdMap) return userIdMap[user] as number;
  throw new Error(
    `User must be one of ${Object.keys(userToId)} but was '${user}'`,
  );
}

export function groupToId(group: TestGroup): number {
  if (group in groupIdMap) return groupIdMap[group] as number;
  throw new Error(
    `Group must be one of ${Object.keys(groupIdMap)} but was '${group}'`,
  );
}

const isMacos = Deno.build.os === "darwin";

export const rootOwner: "root:wheel" | "root:root" = isMacos ? "root:wheel" : "root:root";

export const nobodyOwner = "nobody:daemon";
