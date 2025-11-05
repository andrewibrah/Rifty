import { complexity_score } from '../pipeline';
import { validateAgainstSchema, SchemaType } from '../schemas/validator';

export interface ToTConfig {
  enabled: boolean;
  breadth: number; // number of branches per level
  depth: number; // maximum depth
  minComplexity: number;
  requiredPersona: string;
}

export interface ThoughtNode {
  id: string;
  content: any;
  parentId?: string;
  depth: number;
  score: number;
  valid: boolean;
  children: ThoughtNode[];
}

// Mock LLM call for thoughts
async function mockGenerateThought(prompt: string, context: string[]): Promise<any> {
  // Placeholder - would call LLM with thought generation prompt
  console.log(`[ToT] Generating thought with context: ${context.length} items`);
  return { thought: `Thought based on ${context.join(', ')}` };
}

export class TreeOfThoughts {
  private config: ToTConfig;

  constructor(config: Partial<ToTConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      breadth: config.breadth ?? 3,
      depth: config.depth ?? 2,
      minComplexity: config.minComplexity ?? 0.8,
      requiredPersona: config.requiredPersona ?? 'analyst',
    };
  }

  async shouldUseToT(
    input: { userMessage: string; context?: any },
    persona: string,
    schema: SchemaType
  ): Promise<boolean> {
    if (!this.config.enabled) return false;
    if (persona !== this.config.requiredPersona) return false;
    
    const complexity = complexity_score(input);
    return complexity >= this.config.minComplexity;
  }

  async exploreThoughts(
    initialPrompt: string,
    input: { userMessage: string; context?: any },
    persona: string,
    schema: SchemaType
  ): Promise<ThoughtNode | null> {
    const shouldUse = await this.shouldUseToT(input, persona, schema);
    if (!shouldUse) return null;

    console.log(`[ToT] Starting exploration with breadth=${this.config.breadth}, depth=${this.config.depth}`);

    const root: ThoughtNode = {
      id: 'root',
      content: { initial: true },
      depth: 0,
      score: 0,
      valid: true,
      children: [],
    };

    await this.exploreLevel(root, initialPrompt, schema);

    // Find best leaf node
    const bestLeaf = this.findBestLeaf(root);
    
    console.log(`[ToT] Exploration complete. Best leaf score: ${bestLeaf?.score}`);
    
    return bestLeaf || null;
  }

  private async exploreLevel(node: ThoughtNode, prompt: string, schema: SchemaType): Promise<void> {
    if (node.depth >= this.config.depth) return;

    // Generate breadth number of thoughts
    for (let i = 0; i < this.config.breadth; i++) {
      try {
        const context = this.buildContextFromPath(node);
        const thought = await mockGenerateThought(prompt, context);
        
        // Validate thought
        const validation = validateAgainstSchema(schema, thought);
        const score = this.scoreThought(thought, validation.valid, prompt);
        
        const childNode: ThoughtNode = {
          id: `${node.id}-${i}`,
          content: thought,
          parentId: node.id,
          depth: node.depth + 1,
          score,
          valid: validation.valid,
          children: [],
        };
        
        node.children.push(childNode);
        
        // Recursively explore if valid and high-scoring
        if (validation.valid && score > 0.7) {
          await this.exploreLevel(childNode, prompt, schema);
        }
      } catch (error) {
        console.warn(`[ToT] Failed to generate thought ${i} at depth ${node.depth}:`, error);
      }
    }
  }

  private buildContextFromPath(node: ThoughtNode): string[] {
    const context: string[] = [];
    let current: ThoughtNode | undefined = node;
    
    while (current) {
      if (current.content && typeof current.content === 'object') {
        context.unshift(JSON.stringify(current.content));
      }
      current = current.parentId ? this.findNodeById(current.parentId, node) : undefined;
    }
    
    return context;
  }

  private findNodeById(id: string, root: ThoughtNode): ThoughtNode | undefined {
    if (root.id === id) return root;
    for (const child of root.children) {
      const found = this.findNodeById(id, child);
      if (found) return found;
    }
    return undefined;
  }

  private scoreThought(thought: any, isValid: boolean, objective: string): number {
    let score = 0;
    
    // Schema validity (50% weight)
    score += isValid ? 0.5 : 0;
    
    // Objective coverage (50% weight) - placeholder logic
    const thoughtStr = JSON.stringify(thought).toLowerCase();
    const objectiveWords = objective.toLowerCase().split(/\s+/);
    const coverage = objectiveWords.filter(word => thoughtStr.includes(word)).length / objectiveWords.length;
    score += coverage * 0.5;
    
    return Math.min(score, 1);
  }

  private findBestLeaf(root: ThoughtNode): ThoughtNode | null {
    const leaves: ThoughtNode[] = [];
    
    function collectLeaves(node: ThoughtNode) {
      if (node.children.length === 0) {
        leaves.push(node);
      } else {
        node.children.forEach(collectLeaves);
      }
    }
    
    collectLeaves(root);
    
    // Return highest scoring leaf
    return leaves.reduce((best, current) => 
      current.score > best.score ? current : best
    );
  }
}

// Singleton instance
export const treeOfThoughts = new TreeOfThoughts();
