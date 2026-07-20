import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// Resolve relative to this script so the build runs from any checkout — it was
// pinned to the cloud sandbox path, which broke every local clone.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
let html = fs.readFileSync(ROOT + "/index.html", "utf8");
const css = fs.readFileSync(ROOT + "/app.css", "utf8");
const js = fs.readFileSync(ROOT + "/app.js", "utf8");
const logoB64 = fs.readFileSync(ROOT + "/assets/liftingfit-white.png").toString("base64");
const logoData = "data:image/png;base64," + logoB64;

// Strip head-ish lines that don't belong in an artifact body / won't resolve
const dropPatterns = [
  /<meta charset[^>]*>\n?/i,
  /<meta name="viewport"[^>]*>\n?/i,
  /<title>[^<]*<\/title>\n?/i,
  /<meta name="theme-color"[^>]*>\n?/i,
  /<link rel="icon"[^>]*>\n?/i,
  /<link rel="apple-touch-icon"[^>]*>\n?/i,
  /<link rel="manifest"[^>]*>\n?/i,
  /<link rel="stylesheet"[^>]*>\n?/i,
];
dropPatterns.forEach((p) => { html = html.replace(p, ""); });

// Inline logo
html = html.replace('src="assets/liftingfit-white.png"', 'src="' + logoData + '"');

// Replace external script with inline
html = html.replace('<script src="app.js"></script>', "<script>\n" + js + "\n</script>");

// Prepend inline styles
const out = "<style>\n" + css + "\n</style>\n" + html.trimStart();

fs.writeFileSync(path.join(ROOT, "lieftingfit-dashboard-standalone.html"), out);
console.log("built standalone:", out.length, "bytes");
