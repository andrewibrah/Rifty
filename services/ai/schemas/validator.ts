import Ajv from 'ajv';
import reflectionSchema from './reflection.schema.json';
import planSchema from './plan.schema.json';
import scheduleSchema from './schedule.schema.json';

const ajv = new Ajv({ strict: true, allErrors: true });

const compiledSchemas = {
  reflection: ajv.compile(reflectionSchema.schema),
  plan: ajv.compile(planSchema.schema),
  schedule: ajv.compile(scheduleSchema.schema),
};

export type SchemaType = keyof typeof compiledSchemas;

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateAgainstSchema(type: SchemaType, data: any): ValidationResult {
  const validate = compiledSchemas[type];
  const valid = validate(data);
  
  if (valid) {
    return { valid: true };
  } else {
    return {
      valid: false,
      errors: validate.errors?.map(err => `${err.instancePath} ${err.message}`) || ['Unknown validation error']
    };
  }
}

// Retry logic for model calls
export async function callWithRetry<T>(
  callFn: (retryHint?: string) => Promise<T>,
  maxRetries: number = 2,
  validator?: (result: T) => ValidationResult
): Promise<T> {
  let lastError: string | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callFn(lastError);
      
      if (validator) {
        const validation = validator(result);
        if (!validation.valid) {
          lastError = `Validation failed: ${validation.errors?.join(', ')}`;
          if (attempt < maxRetries) continue;
          throw new Error(lastError);
        }
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      if (attempt >= maxRetries) {
        throw new Error(`Failed after ${maxRetries + 1} attempts. Last error: ${lastError}`);
      }
    }
  }
  
  throw new Error('Unexpected error in retry logic');
}
