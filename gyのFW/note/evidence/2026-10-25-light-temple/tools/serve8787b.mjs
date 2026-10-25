import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../../../../", "Fireboy-and-Watergirl/output/B");
const parentDir = path.resolve(rootDir, "..");
const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".woff": "font/woff", ".css": "text/css" };
http.createServer((req, res) => {
  const u = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = u === "/" ? "gameIndex.html" : u.replace(/^\//, "");
  let p = path.join(rootDir, rel);
  if (!p.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(p)) p = path.join(parentDir, rel);
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(p).toLowerCase()] ?? "application/octet-stream" });
    res.end(data);
  });
}).listen(8788, "127.0.0.1", () => console.log("[8788] up"));
