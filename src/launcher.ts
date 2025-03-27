import { Server } from 'http';

// Create bridge and start listening
let listener: any;

async function createLauncher(event: any, context: any) {
  // @ts-ignore
  const { Bridge } = (await import('__WILL_REPLACED_TO_REAL_PATH__')).default;

  try {
    if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

    if (process.env.DEV) {
      console.log('err dev mode,auto change to prod');
      throw new Error('process.env.DEV is true');
    }

    const quasarServerModule = await import('./index.js');

    listener = quasarServerModule;
    if (listener.default) listener = listener.default;
    if (typeof listener?.then === 'function') listener = await listener;
    if (typeof listener !== 'function' && listener.handler)
      listener = listener.handler;
    else {
      const listenerType = typeof listener;
      const oldListener = listener;
      if (typeof listener !== 'function') {
        listener = (req: any, res: any) => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.write(`This is vercel-quasar, your Vercel builder. Turns out we couldn't find your server instance. Did you write \`module.exports = app\`?
    
      typeof: ${listenerType} (expected 'function')
      String: ${String(oldListener)}
    
      Read the docs or create an issue: https://github.com/dongwa/vercel-quasar`);
          res.end();
        };
      }
    }

    const server = new Server(listener);

    const bridge = new Bridge(server);
    bridge.listen();
    return bridge.launcher(event, context);
  } catch (error) {
    console.error('Server is not listening', error);
    listener = (req: any, res: any) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.write(`This is vercel-quasar, your Vercel builder. 
      ${error}
      Read the docs or create an issue: https://github.com/dongwa/vercel-quasar`);
      res.end();
    };
    const server = new Server(listener);

    const bridge = new Bridge(server);
    bridge.listen();
    return bridge.launcher(event, context);
  }
}

export const launcher = createLauncher;
