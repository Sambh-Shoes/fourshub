import zlib from "node:zlib";

/** Reads the text files out of a .tgz (gzip + tar). Small and dependency-free. */
export function readTgz(buf: Buffer): Record<string, string> {
  const tar = zlib.gunzipSync(buf);
  const files: Record<string, string> = {};
  let pos = 0;
  while (pos + 512 <= tar.length) {
    const header = tar.subarray(pos, pos + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    if (!name) break;
    const size = parseInt(header.subarray(124, 136).toString("utf8").replace(/\0.*$/s, "").trim() || "0", 8);
    const type = String.fromCharCode(header[156]);
    if (type === "0" || type === "\0") files[name] = tar.subarray(pos + 512, pos + 512 + size).toString("utf8");
    pos += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
