import type { Container } from 'pixi.js';

export interface Scene {
  readonly view: Container;
  destroy(): void;
}

export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
