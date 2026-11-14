import { randomBytes } from 'node:crypto';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newCode(): string {
  const b = randomBytes(10); return Array.from(b, n => alphabet[n & 31]).join('');
}
export const CODE_TTL = 15 * 60 * 1000;
