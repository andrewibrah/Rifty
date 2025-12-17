# @rifty/shared

Shared DTOs and schemas extracted from the mobile app. The `src/types` folder contains the original Expo types (goal, chat, personalization, etc.) and `src/index.ts` re-exports them for other packages.

Future work:
- Publish or wire this package as a workspace dependency for the API gateway.
- Generate OpenAPI/JSON Schema definitions from the Zod schemas for validation at the edge/API layers.
- Add build tooling once the shared types are consumed outside the monorepo.
