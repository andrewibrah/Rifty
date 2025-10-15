import { z } from 'zod';
export const tools = [
{
name: 'query_database',
description: 'Execute a query on the database',
inputSchema: {
type: 'object',
properties: {
query: { type: 'string' },
dry_run: { type: 'boolean', default: false }
},
required: ['query']
}
},
{
name: 'seed_data',
description: 'Seed initial data into the database',
inputSchema: {
type: 'object',
properties: {
data: { type: 'string' },
dry_run: { type: 'boolean', default: true }
},
required: ['data']
}
},
{
name: 'migrate_schema',
description: 'Migrate database schema',
inputSchema: {
type: 'object',
properties: {
changes: { type: 'string' },
dry_run: { type: 'boolean', default: true }
},
required: ['changes']
}
}
];
