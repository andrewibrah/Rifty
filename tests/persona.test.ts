import { computePersonaTag } from '../src/utils/persona'
import type { PersonalizationState } from '../src/types/personalization'

const baseState: PersonalizationState = {
  personalization_mode: 'full',
  local_cache_enabled: true,
  cadence: 'daily',
  goals: ['health'],
  extra_goal: null,
  learning_style: { visual: 5, auditory: 5, kinesthetic: 5 },
  session_length_minutes: 25,
  spiritual_prompts: false,
  bluntness: 5,
  language_intensity: 'neutral',
  logging_format: 'mixed',
  drift_rule: { enabled: false, after: null },
  crisis_card: null,
}

const architectState: PersonalizationState = {
  ...baseState,
  learning_style: { visual: 8, auditory: 4, kinesthetic: 8 },
  language_intensity: 'direct',
  cadence: 'daily',
}

const explorerState: PersonalizationState = {
  ...baseState,
  learning_style: { visual: 3, auditory: 9, kinesthetic: 2 },
  language_intensity: 'neutral',
  cadence: 'weekly',
}

const anchorState: PersonalizationState = {
  ...baseState,
  drift_rule: { enabled: true, after: '00:30' },
  crisis_card: 'Call my accountability partner',
  bluntness: 3,
}

const acceleratorState: PersonalizationState = {
  ...baseState,
  bluntness: 9,
  session_length_minutes: 10,
  goals: ['execution', 'performance'],
}

console.assert(computePersonaTag(architectState) === 'Architect', 'Architect tag mismatch')
console.assert(computePersonaTag(explorerState) === 'Explorer', 'Explorer tag mismatch')
console.assert(computePersonaTag(anchorState) === 'Anchor', 'Anchor tag mismatch')
console.assert(computePersonaTag(acceleratorState) === 'Accelerator', 'Accelerator tag mismatch')
console.assert(computePersonaTag(baseState) === 'Generalist', 'Generalist fallback mismatch')

console.log('persona.test.ts ✅')
