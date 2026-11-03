import app from './server.mjs';

// A fixed path per entry point preserves routing through Vercel rewrites.
// OAuth query parameters survive; a visitor cannot select a different API route.
export function endpoint(path) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      url.pathname = path;
      const headers = new Headers(request.headers);
      // ChatGPT identity headers have no trust relationship on this hosting.
      for (const name of ['oai-authenticated-user-id','oai-authenticated-user-email']) headers.delete(name);
      return app.fetch(new Request(url, {method:request.method,headers,...(['GET','HEAD'].includes(request.method)?{}:{body:request.body,duplex:'half'})}),process.env);
    }
  };
}
