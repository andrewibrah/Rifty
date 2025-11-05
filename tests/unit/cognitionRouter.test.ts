import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'fs';
import { CognitionRouter } from '../../services/ai/router';

const PERSONA_FIXTURES = join(process.cwd(), 'services/ai/personas');

describe('CognitionRouter persona loading', () => {
  it('parses bundled personas with array fields', () => {
    const router: any = new CognitionRouter({ personasPath: PERSONA_FIXTURES });
    const coach = router.personas.get('coach');
    expect(coach).toBeDefined();
    expect(Array.isArray(coach.forbidden_behaviors)).toBe(true);
    expect(Array.isArray(coach.tool_allowlist)).toBe(true);
  });

  it('skips invalid persona definitions and keeps valid ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'persona-test-'));
    try {
      writeFileSync(
        join(dir, 'coach.yaml'),
        [
          'name: coach',
          'dna: |',
          '  helper text',
          'tone: calm',
          'forbidden_behaviors:',
          '  - none',
          'tool_allowlist:',
          '  - helper',
        ].join('\n'),
        'utf8'
      );
      writeFileSync(join(dir, 'analyst.yaml'), 'name: 42', 'utf8');

      const router: any = new CognitionRouter({ personasPath: dir, defaultPersona: 'coach' });
      expect(router.personas.get('coach')).toBeDefined();
      expect(router.personas.get('analyst')).toBeUndefined();
    } finally {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });
});
