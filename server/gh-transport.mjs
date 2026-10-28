import { spawn } from "node:child_process";

// Use the existing local gh login without reading or exporting its credential.
export async function ghFetch(url, options) {
  const target = new URL(url);
  if (target.origin !== "https://api.github.com" || !target.pathname.startsWith("/repos/lkbDesigner/yepian-template-editor-demo/")) throw new Error("Unexpected GitHub destination");
  const args = ["api", target.pathname + target.search, "--method", options.method || "GET"];
  if (options.body) args.push("--input", "-");
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [], stderr = [];
    const timeout = setTimeout(() => { child.kill(); reject(new Error("GitHub request timed out")); }, 60000);
    child.stdout.on("data", data => stdout.push(data));
    child.stderr.on("data", data => stderr.push(data));
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("close", code => {
      clearTimeout(timeout);
      const body = Buffer.concat(stdout).toString("utf8");
      if (code === 0) { resolve(new Response(body || "{}", { status: 200, headers: { "Content-Type": "application/json" } })); return; }
      const status = Number(Buffer.concat(stderr).toString("utf8").match(/HTTP (\d{3})/)?.[1]) || 502;
      resolve(Response.json({ message: "GitHub request failed" }, { status }));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.body || undefined);
  });
}
