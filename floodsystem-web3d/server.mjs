import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { GET as getHydro } from './api/hidro.js';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/hidro') {
      if (req.method !== 'GET') { res.writeHead(405, {Allow:'GET'}); return res.end(); }
      const response = await getHydro(new Request(url));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(await response.text());
    }
    const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) { res.writeHead(404); return res.end('Não encontrado'); }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Não encontrado'); }
});
server.on('error', error => { console.error(error.code==='EADDRINUSE' ? `A porta ${port} está em uso. Feche o servidor anterior e tente novamente.` : error.message);process.exitCode=1; });
server.listen(port, '127.0.0.1', () => {
  const url=`http://127.0.0.1:${port}`;
  console.log(`FloodSystem Web3D: ${url}`);
  if(process.argv.includes('--open')) {
    const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
    const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
    const child=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>console.log(`Abra manualmente: ${url}`));child.unref();
  }
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
