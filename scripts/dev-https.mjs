// HTTPS dev server for testing camera features from other devices (e.g. over Tailscale).
// getUserMedia only works in a secure context, so plain http:// to a LAN/Tailscale IP fails.
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const certDir = process.env.ARcane_CERT_DIR ?? '/tmp/arcane-https';
const port = Number(process.env.PORT ?? 5174);
const allowedHost = process.env.ARcane_HTTPS_HOST ?? 'fedora.tail016b3f.ts.net';

const server = await createServer({
  configFile: false,
  server: {
    host: '0.0.0.0',
    port,
    strictPort: true,
    // HTTPS skips Vite's HTTP host guard, but its HMR WebSocket still validates it.
    allowedHosts: [allowedHost],
    https: {
      key: readFileSync(`${certDir}/key.pem`),
      cert: readFileSync(`${certDir}/cert.pem`),
    },
  },
});

await server.listen();
server.printUrls();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
