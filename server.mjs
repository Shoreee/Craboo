import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve(".");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".xml": "application/xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".glb": "model/gltf-binary",
};

function sendStream(req, res, file, type) {
  const stat = statSync(file);
  const range = req.headers.range;
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  let start = 0;
  let end = stat.size - 1;
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (!match) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    start = match[1] ? Number(match[1]) : 0;
    end = match[2] ? Number(match[2]) : stat.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    res.writeHead(206, { ...headers, "Content-Length": end - start + 1, "Content-Range": `bytes ${start}-${end}/${stat.size}` });
  } else {
    res.writeHead(200, { ...headers, "Content-Length": stat.size });
  }
  const stream = createReadStream(file, { start, end });
  stream.on("error", () => { if (!res.headersSent) res.writeHead(404); res.end(); });
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

http
  .createServer(async (req, res) => {
    try {
      const path = resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
      if (!path.startsWith(root + sep) && path !== root) throw Error();
      const file = path === root ? resolve(root, "index.html") : path;
      const type = types[extname(file).toLowerCase()] || "application/octet-stream";
      if (type.startsWith("video/")) {
        sendStream(req, res, file, type);
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
    console.log(`Craboo: http://localhost:${process.env.PORT || 4173}`),
  );
