export interface PrincipleAnchorConfig {
  enabled: boolean;
  principle: string;
}

const DEFAULT_PRINCIPLE = 'Optimize for reconnection (clarity, continuity, coherence); avoid verbose comfort.';

export class PrincipleAnchorMiddleware {
  private config: PrincipleAnchorConfig;
  private log: any[] = [];

  constructor(config: Partial<PrincipleAnchorConfig> = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      principle: config.principle ?? DEFAULT_PRINCIPLE,
    };
  }

  // Inject principle into system prompt
  injectPrinciple(systemPrompt: string): string {
    if (!this.config.enabled) {
      return systemPrompt;
    }

    const principleInjection = `\n\nNorth-Star Principle: ${this.config.principle}`;
    return systemPrompt + principleInjection;
  }

  // Analyze response and nudge towards principle (without changing semantics)
  nudgeResponse(response: any, context: any): { nudged: any; wasNudged: boolean; reason?: string } {
    if (!this.config.enabled) {
      return { nudged: response, wasNudged: false };
    }

    // Analyze response content for principle alignment
    const responseText = typeof response === 'string' ? response : JSON.stringify(response);
    
    // Check for verbose comfort patterns
    const verbosePatterns = [
      /comfort/i,
      /it's okay/i,
      /don't worry/i,
      /take it easy/i,
      /relax/i,
    ];
    
    const hasVerboseComfort = verbosePatterns.some(pattern => pattern.test(responseText));
    
    // Check for reconnection patterns
    const reconnectionPatterns = [
      /let's continue/i,
      /building on/i,
      /next step/i,
      /moving forward/i,
      /connect/i,
    ];
    
    const hasReconnection = reconnectionPatterns.some(pattern => pattern.test(responseText));
    
    // Nudge logic: if verbose comfort detected and no reconnection, suggest reconnection
    if (hasVerboseComfort && !hasReconnection) {
      const nudgeReason = 'Detected verbose comfort without reconnection focus';
      this.log.push({
        timestamp: new Date().toISOString(),
        action: 'nudged',
        reason: nudgeReason,
        originalResponse: response,
      });
      
      // Add reconnection element without changing core content
      const nudgedResponse = this.addReconnectionElement(response);
      
      return {
        nudged: nudgedResponse,
        wasNudged: true,
        reason: nudgeReason,
      };
    }
    
    return { nudged: response, wasNudged: false };
  }

  private addReconnectionElement(response: any): any {
    // This is a placeholder - in practice, would modify response structure
    // to emphasize continuity/coherence without changing meaning
    if (typeof response === 'string') {
      return response + '\n\nLet\'s continue building on this foundation.';
    }
    return response; // For structured responses, would modify appropriately
  }

  // Get logs for A/B testing analysis
  getLogs(): any[] {
    return [...this.log];
  }

  // Toggle for A/B tests
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  getConfig(): PrincipleAnchorConfig {
    return { ...this.config };
  }
}

// Singleton instance for easy access
export const principleAnchor = new PrincipleAnchorMiddleware();
