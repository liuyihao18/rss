const { createServer } = require("http");
const next = require("next");

const port = Number(process.env.PORT || 3000);
const hostname = "0.0.0.0";
const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, hostname, () => {
    console.log(`AI RSS reader listening on http://${hostname}:${port}`);
  });
});
