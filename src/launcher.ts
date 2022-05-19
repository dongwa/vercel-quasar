import path from 'path';

// Create bridge and start listening
const { Server } = require('http') as typeof import('http'); // eslint-disable-line import/order
const { Bridge } =
  require('./vercel__bridge.js') as typeof import('@vercel/node-bridge/bridge');
let listener: any;
let quasarConfig;

const loaders = [
  { name: 'jiti', args: [] },
  {
    name: 'esm',
    args: [
      module,
      {
        cjs: {
          dedefault: true,
        },
      },
    ],
  },
];
for (const { name, args } of loaders) {
  try {
    const load = require(name)(...args);
    const config = load('./quasar.config.js')({
      dev: false,
      prod: true,
    });
    quasarConfig = config.default || config;
    break;
  } catch (err) {
    if (name === 'esm') {
      throw new Error(
        `Could not load Quasar configuration. Make sure all dependencies are listed in package.json dependencies or in serverFiles within builder options:\n ${err}`
      );
    }
  }
}
try {
  process.chdir(__dirname);

  if (!process.env.PROT)
    process.env.PROT = quasarConfig.ssr.prodProd || (3000 as any);
  if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';
  if (process.env.DEV) {
    console.log('err dev mode,auto change to prod');
    throw new Error('process.env.DEV is true');
  }

  listener = require(path.join(__dirname, 'server/server-entry.js'));
  if (listener.default) listener = listener.default;
  if (typeof listener !== 'function' && listener.handler)
    listener = listener.handler;
  if (typeof listener !== 'function') {
    listener = (req: any, res: any) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.write(`This is vercel-quasar, your Vercel builder. Turns out we couldn't find your server instance. Did you write \`module.exports = app\`?
  
  typeof: ${typeof listener} (expected 'function')
  String: ${String(listener)}
  
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
