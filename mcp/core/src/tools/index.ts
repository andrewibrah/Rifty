import { z } from 'zod';
export const tools = [
{
name: 'scan_files',
description: 'Scan project files matching pattern',
inputSchema: {
type: 'object',
properties: {
pattern: { type: 'string' },
dry_run: { type: 'boolean', default: true }
},
required: ['pattern']
}
},
{
name: 'analyze_deps',
description: 'Analyze dependencies in package.json',
inputSchema: {
type: 'object',
properties: {
file: { type: 'string', default: 'package.json' },
dry_run: { type: 'boolean', default: false }
},
required: []
}
},
{
name: 'refactor_code',
description: 'Refactor code in specified file',
inputSchema: {
type: 'object',
properties: {
file: { type: 'string' },
changes: { type: 'string' },
dry_run: { type: 'boolean', default: true }
},
required: ['file', 'changes']
}
}
];
