import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { createAccountService } from "./account-service.mjs";
import { fileURLToPath } from "node:url";
import { ghFetch } from "./gh-transport.mjs";

const account = execFileSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
if (account.toLowerCase() !== "lkbdesigner") throw new Error("Please sign in to GitHub CLI as lkbDesigner before running the shared save service");

const accountService = createAccountService({directory:fileURLToPath(new URL("../.private/", import.meta.url)),githubFetch:ghFetch});
const server = createServer(async (incoming, outgoing) => {
  try {
    const hasBody = !["GET", "HEAD"].includes(incoming.method);
    const request = new Request(`https://save.local${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      ...(hasBody ? { body: Readable.toWeb(incoming), duplex: "half" } : {})
    });
    // This marker is not a token; ghFetch ignores Authorization and uses gh itself.
    const response = await accountService(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    outgoing.end(JSON.stringify({ error: "本机保存服务暂时不可用" }));
  }
});
server.requestTimeout = 180000;
server.listen(8767, "127.0.0.1", () => console.log("Shared save API ready on http://127.0.0.1:8767 (GitHub credentials remain in gh CLI)"));
