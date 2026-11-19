import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { createAccountService } from "./account-service.mjs";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { ghFetch } from "./gh-transport.mjs";

const account = execFileSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
if (account.toLowerCase() !== "lkbdesigner") throw new Error("Please sign in to GitHub CLI as lkbDesigner before running the shared save service");

let accountDirectory=fileURLToPath(new URL("../.private/", import.meta.url));
try{const installed=JSON.parse(readFileSync(new URL("../.private/runtime-install.json",import.meta.url),"utf8"));if(typeof installed.accountDirectory==="string")accountDirectory=installed.accountDirectory;}catch(error){if(error.code!=="ENOENT")throw error;}
const accountService = createAccountService({directory:accountDirectory,githubFetch:ghFetch,allowedOrigins:["https://lkbdesigner.github.io","http://127.0.0.1:8765","http://localhost:8765"]});
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
server.requestTimeout = 600000;
server.listen(8767, "127.0.0.1", () => console.log("Shared save API ready on http://127.0.0.1:8767 (GitHub credentials remain in gh CLI)"));
