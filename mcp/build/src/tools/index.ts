import { z } from 'zod';
export const tools = [
{
name: 'run_tests',
description: 'Run tests matching pattern',
inputSchema: {
type: 'object',
properties: {
pattern: { type: 'string' },
dry_run: { type: 'boolean', default: false }
},
required: ['pattern']
}
},
{
name: 'lint_code',
description: 'Lint code files',
inputSchema: {
type: 'object',
properties: {
files: { type: 'string' },
dry_run: { type: 'boolean', default: false }
},
required: ['files']
}
},
{
name: 'bundle_app',
description: 'Bundle the application',
inputSchema: {
type: 'object',
properties: {
config: { type: 'string' },
dry_run: { type: 'boolean', default: true }
},
required: ['config']
}
}
];
