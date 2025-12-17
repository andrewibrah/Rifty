export interface PALConfig {
  enabled: boolean;
  timeout: number; // ms
  maxCodeLength: number;
}

export interface PALResult {
  computed: any;
  code: string;
  success: boolean;
  error?: string;
}

// Mock Python sandbox - would use actual sandbox like Pyodide or restricted execution
async function runPythonSandbox(code: string, timeout: number): Promise<any> {
  // Placeholder - in real implementation would use Pyodide or similar
  console.log(`[PAL] Running code: ${code.substring(0, 100)}...`);
  
  // Simulate execution
  if (code.includes('print(')) {
    return 'simulated output';
  }
  if (code.includes('return')) {
    return 42; // mock result
  }
  
  throw new Error('Mock sandbox execution failed');
}

function detectNumericReasoning(text: string): boolean {
  const patterns = [
    /\b\d+\s*[\+\-\*\/]\s*\d+\b/, // basic arithmetic
    /\bcalculate\b/i,
    /\bcompute\b/i,
    /\bsum\b/i,
    /\baverage\b/i,
    /\btotal\b/i,
    /\bmath\b/i,
    /\bequation\b/i,
  ];
  
  return patterns.some(pattern => pattern.test(text));
}

export class PALMode {
  private config: PALConfig;

  constructor(config: Partial<PALConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      timeout: config.timeout ?? 5000,
      maxCodeLength: config.maxCodeLength ?? 1000,
    };
  }

  async shouldUsePAL(input: { userMessage: string; context?: any }): Promise<boolean> {
    if (!this.config.enabled) return false;
    return detectNumericReasoning(input.userMessage);
  }

  async executePAL(input: { userMessage: string; context?: any }): Promise<PALResult | null> {
    const shouldUse = await this.shouldUsePAL(input);
    if (!shouldUse) return null;

    try {
      // Generate Python code (would be done by LLM)
      const code = await this.generatePythonCode(input.userMessage);
      
      if (code.length > this.config.maxCodeLength) {
        throw new Error('Generated code too long');
      }
      
      // Run in sandbox
      const result = await runPythonSandbox(code, this.config.timeout);
      
      return {
        computed: result,
        code,
        success: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown PAL error';
      console.warn('[PAL] Execution failed:', errorMsg);
      
      return {
        computed: null,
        code: '',
        success: false,
        error: errorMsg,
      };
    }
  }

  private async generatePythonCode(userMessage: string): Promise<string> {
    // Placeholder - would use LLM to generate safe Python code
    // For now, return a simple mock based on input
    if (userMessage.includes('sum') || userMessage.includes('+')) {
      return `
numbers = [1, 2, 3, 4, 5]
result = sum(numbers)
return result
      `.trim();
    }
    
    if (userMessage.includes('calculate')) {
      return `
result = 2 + 2
return result
      `.trim();
    }
    
    return `
# Default mock calculation
result = 42
return result
    `.trim();
  }
}

// Singleton instance
export const palMode = new PALMode();
