import {relative} from "@std/path";

export function mapToNewBasePath(url: URL, oldBasePath: URL, newBasePath: URL): URL {
    const relativePath = relative(oldBasePath.pathname, url.pathname)
    return new URL(relativePath, newBasePath)
}