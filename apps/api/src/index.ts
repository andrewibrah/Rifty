export interface GatewayOptions {
  port?: number;
}

export function createGateway(options: GatewayOptions = {}) {
  const port = options.port ?? Number(process.env.PORT ?? 3001);

  return {
    async start() {
      console.log(`[api] Placeholder server starting on ${port}. Wire Fastify/Express handlers here.`);
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void createGateway().start();
}
