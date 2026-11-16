import * as THREE from 'three';

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export function makeGlowTexture(): THREE.Texture {
  const c = canvas(128, 128), x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'white');
  g.addColorStop(1, 'transparent');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** A spell name in the UI's serif italic, with a soft coloured glow and a fine underline flourish. */
export function makeLabelTexture(text: string, color: string): THREE.Texture {
  const c = canvas(1024, 256), x = c.getContext('2d')!;
  const font = "italic 600 86px 'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif";
  x.font = font;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = color;
  x.shadowBlur = 38;
  x.fillStyle = color;
  x.globalAlpha = 0.65;
  x.fillText(text, 512, 112);
  x.globalAlpha = 1;
  x.shadowBlur = 12;
  x.shadowColor = 'rgba(0,0,0,0.6)';
  x.fillStyle = '#fbf6e4';
  x.fillText(text, 512, 112);
  const width = Math.min(760, x.measureText(text).width + 80);
  const line = x.createLinearGradient(512 - width / 2, 0, 512 + width / 2, 0);
  line.addColorStop(0, 'rgba(255,255,255,0)');
  line.addColorStop(0.5, color);
  line.addColorStop(1, 'rgba(255,255,255,0)');
  x.shadowBlur = 10;
  x.shadowColor = color;
  x.fillStyle = line;
  x.fillRect(512 - width / 2, 176, width, 3);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
