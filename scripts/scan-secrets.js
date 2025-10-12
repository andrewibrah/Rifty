#!/usr/bin/env node

/**
 * Lightweight secret scanner for pre-commit usage.
 * Scans staged files for common credential patterns to prevent leaks.
 */

const { execSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const repoRoot = process.cwd();

function getStagedFiles() {
  const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
    encoding: 'utf8',
  }).trim();
  return output ? output.split('\n') : [];
}

function isBinary(buffer) {
  const sample = buffer.slice(0, 1024);
  return sample.includes(0);
}

const PATTERNS = [
  {
    regex: /(sk-[A-Za-z0-9_-]{20,})/g,
    message: 'OpenAI-style secret key detected (sk-...)',
  },
  {
    regex: /(eyJhbGciOiJ[A-Za-z0-9_-]{10,})/g,
    message: 'JWT token detected (typically Supabase anon/service keys).',
  },
  {
    regex: /(https?:\/\/[^\s]+supabase\.co\/[A-Za-z0-9_-]{16,})/g,
    message: 'Potential Supabase service URL containing project reference.',
  },
  {
    regex: /(-----BEGIN [A-Z ]+-----)/g,
    message: 'PEM/SSH certificate starting block detected.',
  },
  {
    regex: /(?:api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}["']?/gi,
    message: 'Generic API credential pattern detected.',
  },
];

function scanFile(path) {
  const absolutePath = join(repoRoot, path);
  const buffer = readFileSync(absolutePath);
  if (isBinary(buffer)) return [];
  const content = buffer.toString('utf8');
  const findings = [];
  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(content)) {
      findings.push({ path, message: pattern.message });
    }
  }
  return findings;
}

function main() {
  const staged = getStagedFiles();
  if (!staged.length) {
    process.exit(0);
  }

  const problems = staged.flatMap(scanFile);

  if (problems.length > 0) {
    console.error('\x1b[31mSecret scan failed.\x1b[0m');
    for (const finding of problems) {
      console.error(`  - ${finding.path}: ${finding.message}`);
    }
    console.error('\nRemove the secret or move it to an ignored .env.local file before committing.');
    process.exit(1);
  }

  console.log('Secret scan passed.');
}

main();
