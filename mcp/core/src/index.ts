import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { tools } from './tools/index.js';
const server = new Server({ name: 'mcp-core', version: '1.0.0' }, {
capabilities: { tools: {} }
});
server.setRequestHandler('tools/list', async () => ({ tools }));
server.setRequestHandler('tools/call', async (request) => {
// Tool execution logic with dry-run handling
});
const transport = new StdioServerTransport();
await server.connect(transport);
