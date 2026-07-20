import { relative } from "@std/path";

export function mapToNewBasePath(url: URL, oldBasePath: URL, newBasePath: URL): URL {
  let relativePath = relative(oldBasePath.pathname, url.pathname);
  if (url.pathname.endsWith("/")) {
    relativePath += "/";
  }
  return new URL(relativePath, newBasePath);
}
