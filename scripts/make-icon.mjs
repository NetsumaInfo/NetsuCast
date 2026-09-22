// Renders the NetsuCast logo (blue rounded square, white play triangle, small sparkle) to PNG
// without any dependency. Usage: node scripts/make-icon.mjs <size> <out.png>
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const size = Number(process.argv[2] ?? 1024);
const out = process.argv[3] ?? "icon.png";
const SS = 4; // supersampling per axis

function inRoundedRect(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inTriangle(x, y) {
  // Play triangle, optically centred (shifted right).
  const [ax, ay, bx, by, cx, cy] = [0.36, 0.27, 0.36, 0.73, 0.76, 0.5];
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(x, y, ax, ay, bx, by);
  const d2 = s(x, y, bx, by, cx, cy);
  const d3 = s(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function inSparkle(x, y) {
  // Four-point star in the top-right corner.
  const dx = Math.abs(x - 0.76);
  const dy = Math.abs(y - 0.24);
  return Math.sqrt(dx) + Math.sqrt(dy) <= Math.sqrt(0.075);
}

const rows = [];
for (let py = 0; py < size; py++) {
  const row = Buffer.alloc(1 + size * 4);
  for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const x = (px + (sx + 0.5) / SS) / size;
        const y = (py + (sy + 0.5) / SS) / size;
        if (!inRoundedRect(x, y, 0.22)) continue;
        if (inTriangle(x, y) || inSparkle(x, y)) {
          r += 255; g += 255; b += 255;
        } else {
          const t = (x + y) / 2; // diagonal gradient #1f4fb8 -> #4c8dff (DESIGN.md accent)
          r += 0x1f + (0x4c - 0x1f) * t;
          g += 0x4f + (0x8d - 0x4f) * t;
          b += 0xb8 + (0xff - 0xb8) * t;
        }
        a += 255;
      }
    }
    const n = SS * SS;
    const cover = a / n;
    const o = 1 + px * 4;
    // Straight (non-premultiplied) alpha: average colour over covered samples only.
    const k = a ? 255 / a : 0;
    row[o] = Math.round(r * k);
    row[o + 1] = Math.round(g * k);
    row[o + 2] = Math.round(b * k);
    row[o + 3] = Math.round(cover);
  }
  rows.push(row);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
