import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const gen = customAlphabet(alphabet, 16);

export const newId = (prefix: string) => `${prefix}_${gen()}`;
export const nowIso = () => new Date().toISOString();
