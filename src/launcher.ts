import { Server } from 'http';
import path from 'path';

//@ts-ignore
const { Bridge } = require('./bridge.js');

let listener: any;

try {
  if (!process.env.PROT) process.env.PROT = 3010 as any;
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

  process.chdir(__dirname);
  listener = require(path.join(__dirname, 'dist/quasar_dev/index.js'));
  if (listener.default) listener = listener.default;
  if (typeof listener !== 'function' && listener.handler)
    listener = listener.handler;
  if (typeof listener !== 'function') {
    listener = (req: any, res: any) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.write(`This is vercel-sapper, your Vercel builder. Turns out we couldn't find your server instance. Did you write \`module.exports = app\`?
  
  typeof: ${typeof listener} (expected 'function')
  String: ${String(listener)}
  
  Read the docs or create an issue: https://github.com/thgh/vercel-sapper`);
      res.end();
    };
  }
} catch (error) {
  console.error('Server is not listening', error);
  process.exit(1);
}

const server = new Server(listener);

const bridge = new Bridge(server);
bridge.listener();

exports.launcher = bridge.launcher;
