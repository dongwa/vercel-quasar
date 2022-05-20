# vercel-quasar
Vercel builder for Quasar with SSR enabled
# useage
## 1. change listen function in your src-ssr/server.js file
### 1.1. remove all async and await 
### 1.2. return { handler: ssrHandler }
``` js
/**
 * You need to make the server listen to the indicated port
 * and return the listening instance or whatever you need to
 * close the server with.
 *
 * The "listenResult" param for the "close()" definition below
 * is what you return here.
 *
 * For production, you can instead export your
 * handler for serverless use or whatever else fits your needs.
 */
export function listen({ app, port, isReady, ssrHandler }) {
  if (process.env.DEV) {
    await isReady();
    return app.listen(port, () => {
      if (process.env.PROD) {
        console.log('Server listening at port ' + port);
      }
    });
  } else {
    // in production
    // "ssrHandler" is a prebuilt handler which already
    // waits for all the middlewares to run before serving clients

    // whatever you return here is equivalent to module.exports.<key> = <value>
    return { handler: ssrHandler };
  }
}
```
### 1.3. example 
![server.js.example.ng]('./imgs/server.js.example.png')

## 2. Configure `vercel-quasar` as builder in `vercel.json`
### Add a `vercel.json` file in your root path
```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "vercel-quasar"
    }
  ]
}

```