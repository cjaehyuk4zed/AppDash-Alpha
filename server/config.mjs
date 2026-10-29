import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = path.resolve(process.env.APPDASH_DATA_DIR || path.join(root, '.runtime'));
export const port = Number(process.env.APPDASH_PORT || 4175);
export const baseUrl = `http://127.0.0.1:${port}`;
export const defaults = { homeStats: true, homeCount: 6, descriptions: true, tags: true, historyCount: 50, connectionDetails: true, skillHelp: true, successNotifications: false, askInput: false, rememberInput: false, retentionDays: 30, missedPolicy: 'skip' };
