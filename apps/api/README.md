# API Gateway (TypeScript)

Placeholder for the future HTTP gateway (Fastify/Express). The server will expose REST endpoints for the mobile app and delegate to Supabase + Python AI services.

## Next steps
- Add Fastify or Express with shared middlewares (logging, auth, request-id).
- Import DTOs from `@rifty/shared` for request/response validation.
- Proxy authenticated calls to Supabase and the `services/python-ai` FastAPI service.
- Add OpenAPI generation and CI hooks once routes are implemented.
