// Servidor local para la app web de Vendi (opcional, pero recomendado).
// Uso:  node servidor.js     y luego abre  http://localhost:5500
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUERTO = process.env.PORT || 5500;
const RAIZ = __dirname;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ts': 'text/plain; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
};

http
  .createServer((req, res) => {
    let ruta = decodeURIComponent(req.url.split('?')[0]);
    if (ruta === '/') ruta = '/index.html';
    const archivo = path.normalize(path.join(RAIZ, ruta));
    if (archivo !== RAIZ && !archivo.startsWith(RAIZ + path.sep)) {
      res.writeHead(403);
      return res.end('403');
    }
    fs.readFile(archivo, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 No encontrado');
      }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(PUERTO, () => console.log('Vendi listo en http://localhost:' + PUERTO));
