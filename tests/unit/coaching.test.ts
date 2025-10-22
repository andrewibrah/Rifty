import { describe, it, expect } from 'vitest';
import { assessUserState, generateCoachingSuggestion } from '@/agent/coaching';

describe('Coaching', () => {
  describe('assessUserState', () => {
    it('should detect negative mood', () => {
      const text = 'I feel sad and depressed';
      const operatingPicture = {
        why_model: null,
        top_goals: [],
        hot_entries: [],
        next_72h: [],
        cadence_profile: {
          cadence: 'none',
          session_length_minutes: 25,
          last_message_at: null,
          missed_day_count: 0,
          current_streak: 0,
          timezone: 'UTC',
        },
        risk_flags: [],
      };
      const config = {
        user_settings: null,
        persona: null,
        cadence: 'none',
        tone: 'neutral',
        spiritual_on: false,
        bluntness: 5,
        privacy_gates: {},
        crisis_rules: {},
        resolved_at: new Date().toISOString(),
      };

      const assessment = assessUserState(text, operatingPicture, config);
      expect(assessment.mood).toBe('negative');
      expect(assessment.needsCoaching).toBe(true);
    });

    it('should detect missed days', () => {
      const text = 'Hello';
      const operatingPicture = {
        why_model: null,
        top_goals: [],
        hot_entries: [],
        next_72h: [],
        cadence_profile: {
          cadence: 'none',
          session_length_minutes: 25,
          last_message_at: null,
          missed_day_count: 5,
          current_streak: 0,
          timezone: 'UTC',
        },
        risk_flags: [],
      };
      const config = {
        user_settings: null,
        persona: null,
        cadence: 'none',
        tone: 'neutral',
        spiritual_on: false,
        bluntness: 5,
        privacy_gates: {},
        crisis_rules: {},
        resolved_at: new Date().toISOString(),
      };

      const assessment = assessUserState(text, operatingPicture, config);
      expect(assessment.needsCoaching).toBe(true);
      expect(assessment.reasons).toContain('missed reflection days');
    });
  });

  describe('generateCoachingSuggestion', () => {
    it('should suggest motivation for negative mood', () => {
      const assessment = {
        mood: 'negative' as const,
        needsCoaching: true,
        reasons: ['negative language detected'],
      };
      const operatingPicture = {
        why_model: null,
        top_goals: [],
        hot_entries: [],
        next_72h: [],
        cadence_profile: {
          cadence: 'none',
          session_length_minutes: 25,
          last_message_at: null,
          missed_day_count: 0,
          current_streak: 0,
          timezone: 'UTC',
        },
        risk_flags: [],
      };
      const ragContext = [];
      const config = {
        user_settings: null,
        persona: null,
        cadence: 'none',
        tone: 'neutral',
        spiritual_on: false,
        bluntness: 5,
        privacy_gates: {},
        crisis_rules: {},
        resolved_at: new Date().toISOString(),
      };

      const suggestion = generateCoachingSuggestion(assessment, operatingPicture, ragContext, config);
      expect(suggestion).toBeDefined();
      expect(suggestion?.type).toBe('motivation');
    });
  });
});
