import { Assets, Spritesheet, Texture } from 'pixi.js';

let textureOf: (name: string) => Texture | undefined;

/** 加载生成的牌面图集（public/atlas/cards.json + cards.png） */
export async function loadAtlas(): Promise<void> {
  const sheet = await Assets.load<Spritesheet>('atlas/cards.json');
  textureOf = (name: string) => sheet.textures[name];
}

export function cardTexture(name: string): Texture {
  const tex = textureOf(name);
  if (!tex) throw new Error(`图集中不存在纹理: ${name}`);
  return tex;
}

export const BACK_TEXTURE_NAME = 'back';
