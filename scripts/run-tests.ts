import { execSync } from 'child_process';
import assert from 'assert';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { isUUID } from '../src/utils/uuid.ts';
import {
  CreateGoalInputSchema,
  GoalSchema,
  MicroStepSchema,
} from '../src/types/goal.ts';

function log(step: string): void {
  console.log(`\n[codex-check] ${step}`);
}

function runCommand(command: string): void {
  execSync(command, { stdio: 'inherit', env: process.env });
}

async function main(): Promise<void> {
  try {
    log('Running TypeScript check');
    runCommand('npx tsc --noEmit');

    log('Validating UUID helper');
    assert.ok(isUUID('0f8fad5b-d9cb-469f-a165-70867728950e'), 'Expected valid UUID to pass');
    assert.ok(!isUUID('not-a-uuid'), 'Expected invalid UUID to fail');
    assert.ok(!isUUID('1760940686225'), 'Timestamp-like identifiers should fail UUID validation');

    log('Verifying theme tokens');
    const themePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'theme', 'index.ts');
    const themeSource = await fs.readFile(themePath, 'utf8');

    const requiredRadii = ['xs', 'sm', 'md', 'lg', 'xl', 'pill'];
    requiredRadii.forEach((key) => {
      if (!new RegExp(`\\b${key}\\s*:`).test(themeSource)) {
        throw new Error(`Missing radii token: ${key}`);
      }
    });

    const requiredTypography = ['display', 'heading', 'title', 'body', 'bodyLight', 'button', 'caption', 'small', 'h1', 'h2', 'h3'];
    requiredTypography.forEach((key) => {
      if (!new RegExp(`\\b${key}\\s*:`).test(themeSource)) {
        throw new Error(`Missing typography token: ${key}`);
      }
    });

    const darkBackgroundMatch = themeSource.match(/darkColors[\s\S]*?background:\s*"([^"]+)"/);
    const lightBackgroundMatch = themeSource.match(/lightColors[\s\S]*?background:\s*"([^"]+)"/);
    if (!darkBackgroundMatch || !lightBackgroundMatch) {
      throw new Error('Unable to locate background colors in theme definitions');
    }
    if (darkBackgroundMatch[1] === lightBackgroundMatch[1]) {
      throw new Error('Theme palettes should differ between modes');
    }

    log('Validating goal schemas');
    const microStep = MicroStepSchema.parse({
      id: '11111111-2222-3333-4444-555555555555',
      description: 'Initial milestone',
      completed: false,
    });
    assert.strictEqual(microStep.description, 'Initial milestone');

    const createPayload = CreateGoalInputSchema.parse({
      title: 'Test Goal',
      category: 'growth',
      micro_steps: [
        {
          description: 'Write outline',
        },
      ],
    });
    assert.strictEqual(createPayload.title, 'Test Goal');

    const nowIso = new Date().toISOString();
    const goal = GoalSchema.parse({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      user_id: 'ffffffff-1111-2222-3333-444444444444',
      title: 'Parsed Goal',
      description: 'Schema validation',
      category: 'career',
      target_date: null,
      status: 'active',
      current_step: 'Initial milestone',
      micro_steps: [microStep],
      source_entry_id: null,
      metadata: {},
      embedding: null,
      created_at: nowIso,
      updated_at: nowIso,
    });
    assert.strictEqual(goal.micro_steps.length, 1);

    log('Checking goals v2 migration policies');
    const migrationsDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'supabase',
      'migrations'
    );
    const migrationFiles = await fs.readdir(migrationsDir);
    const goalsMigration = migrationFiles
      .filter((file) => file.includes('goals_v2_init'))
      .sort()
      .pop();

    if (!goalsMigration) {
      throw new Error('Missing goals_v2_init migration');
    }

    const migrationSource = await fs.readFile(
      path.join(migrationsDir, goalsMigration),
      'utf8'
    );

    const requiredFragments = [
      'CREATE TABLE IF NOT EXISTS public.goal_reflections',
      'CREATE TABLE IF NOT EXISTS public.goal_progress_cache',
      'CREATE TABLE IF NOT EXISTS public.ai_goal_sessions',
      'CREATE TABLE IF NOT EXISTS public.goal_anchors',
      'ENABLE ROW LEVEL SECURITY',
      'CREATE POLICY goal_reflections_select_own',
      'CREATE POLICY goal_progress_cache_select_own',
      'CREATE POLICY ai_goal_sessions_select_own',
    ];

    requiredFragments.forEach((fragment) => {
      if (!migrationSource.includes(fragment)) {
        throw new Error(`Migration missing fragment: ${fragment}`);
      }
    });

    log('Ensuring edge functions present');
    const functionsDir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'supabase',
      'functions'
    );
    const requiredFunctions = [
      'link_reflections',
      'compute_goal_health',
      'main_chat_goal_recall',
    ];
    await Promise.all(
      requiredFunctions.map(async (fn) => {
        const fnPath = path.join(functionsDir, fn, 'index.ts');
        try {
          await fs.access(fnPath);
        } catch (error) {
          throw new Error(`Missing edge function entrypoint: ${fnPath}`);
        }
      })
    );

    log('Checking export payload structure');
    const exportPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'src',
      'services',
      'export.ts'
    );
    const exportSource = await fs.readFile(exportPath, 'utf8');
    if (!exportSource.includes("version: 'goals-v2'")) {
      throw new Error('Export payload missing goals-v2 version tag');
    }
    if (!/goal_reflections/i.test(exportSource) || !/goal_progress_cache/i.test(exportSource)) {
      throw new Error('Export payload missing goals v2 datasets');
    }

    log('All checks passed ✅');
  } catch (error) {
    console.error(`\n[codex-check] Failure: ${(error as Error).message}`);
    process.exit(1);
  }
}

void main();
