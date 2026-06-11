// Healthcheck HTTP mínimo p/ o EasyPanel monitorar o worker.

import { createServer, type Server } from "node:http";

export function startHealthServer(
  port: number,
  getStatus: () => Promise<Record<string, unknown>>,
): Server {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      getStatus()
        .then((status) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(status));
        })
        .catch((err) => {
          res.writeHead(503, { "content-type": "application/json" });
          res.end(JSON.stringify({ status: "error", error: String(err) }));
        });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port);
  return server;
}
