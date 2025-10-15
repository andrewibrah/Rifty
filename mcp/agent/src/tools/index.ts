import { z } from 'zod';
export const tools = [
{
name: 'train_intent',
description: 'Train the intent model with provided data',
inputSchema: {
type: 'object',
properties: {
data_path: { type: 'string' },
dry_run: { type: 'boolean', default: true }
},
required: ['data_path']
}
},
{
name: 'evaluate_intent',
description: 'Evaluate the intent model performance',
inputSchema: {
type: 'object',
properties: {
model_path: { type: 'string' },
dry_run: { type: 'boolean', default: false }
},
required: ['model_path']
}
},
{
name: 'test_intent',
description: 'Test the intent recognition',
inputSchema: {
type: 'object',
properties: {
test_data: { type: 'string' },
dry_run: { type: 'boolean', default: false }
},
required: ['test_data']
}
}
];
