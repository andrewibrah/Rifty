import { readFileSync } from 'fs';
import { join } from 'path';
import { load } from 'js-yaml';
import { z } from 'zod';
import { runPipeline } from './pipeline';
import { gateRequest, generateFastPathResponse, IntentType } from './gate';
import { principleAnchor } from './middleware/principle_anchor';
import { selfConsistencyVoter, type ConsistencyResult } from './utilities/self_consistency';
import { treeOfThoughts, type ThoughtNode } from './utilities/tree_of_thoughts';
import { palMode, type PALResult } from './utilities/pal_mode';
import { callWithRetry, SchemaType, validateAgainstSchema } from './schemas/validator';

export interface Persona {
  name: string;
  dna: string;
  tone: string;
  forbidden_behaviors: string[];
  tool_allowlist: string[];
}

const PersonaDocumentSchema = z
  .object({
    name: z.string().min(1, 'persona name is required'),
    dna: z.string().min(1, 'persona dna is required'),
    tone: z.string().min(1, 'persona tone is required'),
    forbidden_behaviors: z.array(z.string()).optional().default([]),
    tool_allowlist: z.array(z.string()).optional().default([]),
  })
  .passthrough();

export interface RouterConfig {
  personasPath: string;
  defaultPersona: string;
  maxLessons: number;
}

export interface RouterInput {
  userMessage: string;
  context: {
    annotations: any[];
    entryContent: string;
    entryType: string;
    intentContext?: any;
  };
  lessons?: string[]; // last lessons from spine
}

export interface RouterOutput {
  response: string;
  actions: any[];
  version: string;
  diagnostics: any;
}

type EnhancedPipelineResult = Awaited<ReturnType<typeof runPipeline>> & {
  tot?: ThoughtNode;
  selfConsistency?: ConsistencyResult<unknown>;
  pal?: PALResult | null;
};

export class CognitionRouter {
  private config: RouterConfig;
  private personas: Map<string, Persona> = new Map();

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = {
      personasPath: config.personasPath ?? join(__dirname, 'personas'),
      defaultPersona: config.defaultPersona ?? 'coach',
      maxLessons: config.maxLessons ?? 3,
    };
    
    this.loadPersonas();
  }

  private loadPersonas(): void {
    const personaFiles = ['coach.yaml', 'analyst.yaml', 'mirror.yaml', 'scheduler.yaml'];
    
    for (const file of personaFiles) {
      try {
        const filePath = join(this.config.personasPath, file);
        const content = readFileSync(filePath, 'utf-8');
        const persona = this.parseYamlPersona(filePath, content);
        if (persona) {
          this.personas.set(persona.name, persona);
        }
      } catch (error) {
        console.warn(`Failed to load persona ${file}:`, error);
      }
    }

    if (!this.personas.size) {
      throw new Error('No personas could be loaded from configuration');
    }
    if (!this.personas.has(this.config.defaultPersona)) {
      console.warn(
        `Default persona "${this.config.defaultPersona}" is missing; using first available persona instead`
      );
    }
  }

  private parseYamlPersona(filePath: string, content: string): Persona | null {
    try {
      const parsed = load(content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Persona file did not produce an object');
      }
      const personaDoc = PersonaDocumentSchema.parse(parsed);
      return {
        name: personaDoc.name,
        dna: personaDoc.dna,
        tone: personaDoc.tone,
        forbidden_behaviors: personaDoc.forbidden_behaviors ?? [],
        tool_allowlist: personaDoc.tool_allowlist ?? [],
      };
    } catch (error) {
      console.warn(`Invalid persona definition at ${filePath}:`, error);
      return null;
    }
  }

  private selectPersona(intent: IntentType, context: any): Persona {
    let requestedPersonaName: string;
    switch (intent) {
      case 'reflection':
        requestedPersonaName = 'mirror';
        break;
      case 'analysis':
        requestedPersonaName = 'analyst';
        break;
      case 'scheduling':
        requestedPersonaName = 'scheduler';
        break;
      default:
        requestedPersonaName = this.config.defaultPersona;
        break;
    }

    const requestedPersona = this.personas.get(requestedPersonaName);
    if (requestedPersona) {
      return requestedPersona;
    }

    if (requestedPersonaName !== this.config.defaultPersona) {
      console.warn(
        `[CognitionRouter] Persona "${requestedPersonaName}" missing for intent "${intent}". Falling back to default "${this.config.defaultPersona}".`
      );
    }

    const defaultPersona = this.personas.get(this.config.defaultPersona);
    if (defaultPersona) {
      return defaultPersona;
    }

    console.error(
      `[CognitionRouter] Persona selection failed for intent "${intent}". Requested persona "${requestedPersonaName}" and default persona "${this.config.defaultPersona}" are unavailable.`
    );
    throw new Error(
      `Persona selection failed: unable to load requested persona "${requestedPersonaName}" or default persona "${this.config.defaultPersona}" for intent "${intent}".`
    );
  }

  private composeSystemPrompt(persona: Persona, lessons: string[] = []): string {
    const recentLessons = lessons.slice(-this.config.maxLessons);
    
    let prompt = persona.dna;
    
    if (recentLessons.length > 0) {
      prompt += '\n\nRecent Lessons:\n' + recentLessons.map((lesson, i) => `${i + 1}. ${lesson}`).join('\n');
    }
    
    // Inject principle anchor
    prompt = principleAnchor.injectPrinciple(prompt);
    
    return prompt;
  }

  async route(input: RouterInput): Promise<RouterOutput> {
    // Step 1: Gate request
    const gateResult = await gateRequest({
      userMessage: input.userMessage,
      context: input.context,
    });

    // Fast path
    if (gateResult.route === 'fast_path') {
      const response = generateFastPathResponse(gateResult, {
        userMessage: input.userMessage,
      });
      
      return {
        response,
        actions: [],
        version: 'cognition.v1',
        diagnostics: { gate: gateResult },
      };
    }

    // Step 2: Select persona
    const persona = this.selectPersona(gateResult.intent, input.context);
    
    // Step 3: Compose system prompt
    const systemPrompt = this.composeSystemPrompt(persona, input.lessons);
    
    // Step 4: Run pipeline with advanced utilities
    const pipelineResult = await this.runEnhancedPipeline(input, persona.name, systemPrompt);
    
    // Step 5: Apply principle anchor nudge
    const nudged = principleAnchor.nudgeResponse(pipelineResult, input);
    
    return {
      response: nudged.nudged.response,
      actions: nudged.nudged.actions,
      version: 'cognition.v1',
      diagnostics: {
        gate: gateResult,
        persona: persona.name,
        pipeline: pipelineResult,
        nudged: nudged.wasNudged,
      },
    };
  }

  private async runEnhancedPipeline(
    input: RouterInput,
    personaName: string,
    systemPrompt: string
  ): Promise<EnhancedPipelineResult> {
    // Check for PAL mode
    const palResult = await palMode.executePAL(input);

    // Run main pipeline
    const pipelineResult: EnhancedPipelineResult = await runPipeline({
      userMessage: input.userMessage,
      context: input.context,
    });

    // Apply advanced reasoning if needed
    if (personaName === 'analyst') {
      const totResult = await treeOfThoughts.exploreThoughts(
        systemPrompt,
        input,
        personaName,
        'plan' // Assume plan schema for complex tasks
      );
      if (totResult) {
        // Integrate ToT result
        pipelineResult.tot = totResult;
      }
    }

    // Apply self-consistency for plans
    const scResult = await selfConsistencyVoter.generateConsistentResponse(
      systemPrompt,
      'plan',
      input
    );
    if (scResult) {
      pipelineResult.selfConsistency = scResult;
    }

    // Add PAL result if applicable
    if (palResult) {
      pipelineResult.pal = palResult;
    }

    return pipelineResult;
  }
}

// Singleton instance
export const cognitionRouter = new CognitionRouter();
