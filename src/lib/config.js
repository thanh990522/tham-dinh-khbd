import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig() {
  const file = process.env.SCHOOL_CONFIG || path.join(here, '..', '..', 'config', 'school.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (process.env.CLAUDE_MODEL) config.model = process.env.CLAUDE_MODEL;
  return config;
}
