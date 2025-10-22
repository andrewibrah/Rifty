import { describe, it, expect } from 'vitest';
import { toSnakeCase, toPascalCase } from '@/utils/strings';

describe('Strings', () => {
  describe('toSnakeCase', () => {
    it('should convert to snake case', () => {
      expect(toSnakeCase('HelloWorld')).toBe('hello_world');
    });
  });

  describe('toPascalCase', () => {
    it('should convert to pascal case', () => {
      expect(toPascalCase('hello_world')).toBe('HelloWorld');
    });
  });
});
