import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const configFile = () => process.env.SCHOOL_CONFIG || path.join(here, '..', '..', 'config', 'school.json');

export function saveConfig(config) {
  const { _apiKey, ...clean } = config;
  const save = { ...clean };
  // CLAUDE_MODEL chỉ ghi đè lúc chạy — giữ nguyên giá trị model trong file
  if (process.env.CLAUDE_MODEL) save.model = JSON.parse(fs.readFileSync(configFile(), 'utf8')).model;
  fs.writeFileSync(configFile(), JSON.stringify(save, null, 2) + '\n', 'utf8');
}

export function loadConfig() {
  const file = configFile();
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (process.env.CLAUDE_MODEL) config.model = process.env.CLAUDE_MODEL;
  return config;
}
