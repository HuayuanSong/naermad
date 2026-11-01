import { createServer } from 'vite';
import { config } from './config.mjs';
const settings = await config();
const server = await createServer({plugins:[{
  name:'runtime-config',
  configureServer(server) {
    server.middlewares.use('/config.json', (_req,res)=>{
      res.setHeader('Content-Type','application/json');
      res.setHeader('Cache-Control','no-store');
      res.end(JSON.stringify(settings));
    });
  },
}]});
await server.listen();
server.printUrls();
