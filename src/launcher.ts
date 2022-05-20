import path from 'path';

// Create bridge and start listening
const { Server } = require('http') as typeof import('http');
const { Bridge } =
  require('./vercel__bridge.js') as typeof import('@vercel/node-bridge/bridge');
let listener: any;
let quasarConfig;

try {
  const jiti = require('jiti')(__dirname);
  const config = jiti('./quasar.config.js', {
    dev: false,
    prod: true,
  });
  quasarConfig = config.default || config;
} catch (err: any) {
  throw new Error(
    `Could not load Quasar configuration. Make sure all dependencies are listed in package.json dependencies or in serverFiles within builder options:\n ${err}`
  );
}

try {
  process.chdir(__dirname);
  // if (!process.env.PROT) process.env.PROT = 3000 as any;
  process.env.PROT = quasarConfig?.ssr?.prodProd || (3000 as any);
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';
  if (process.env.DEV) {
    console.log('err dev mode,auto change to prod');
    throw new Error('process.env.DEV is true');
  }

  listener = require(path.join(__dirname, 'index.js'));
  if (listener.default) listener = listener.default;
  if (typeof listener !== 'function' && listener.handler)
    listener = listener.handler;
  const listenerType = typeof listener;
  const oldListener = listener;
  console.log('listener:', typeof listener, listener);

  if (typeof listener !== 'function') {
    listener = (req: any, res: any) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.write(`This is vercel-quasar, your Vercel builder. Turns out we couldn't find your server instance. Did you write \`module.exports = app\`?

  typeof: ${listenerType} (expected 'function')
  String: ${String(oldListener)}

  Read the docs or create an issue: https://github.com/dongwa/vercel-quasar`);
      res.end();
    };
  }
} catch (error) {
  console.error('Server is not listening', error);
  process.exit(1);
}

const server = new Server(listener);

const bridge = new Bridge(server);
bridge.listen();

export const launcher: typeof bridge.launcher = bridge.launcher;
