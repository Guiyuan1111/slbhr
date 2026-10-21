// 8bit RGBA 无交错 PNG 的原始样本读写（r18 从 build-dom-skin.mjs 抽出复用）。
//
// 为什么要自己解而不是调 ImageMagick：合成/子集类工具要证明的是"存进文件里的字节没变"，
// 而 `magick` 两侧都过同一套色彩管理与量化，±1 级的差会被抹平成 AE=0——它测不出"字节变了"。
// 这里 decodePng 出来的就是浏览器解码后拿到的那份 RGBA，逐字节可比。
import zlib from "node:zlib";

/** 解 8bit RGBA 无交错 PNG，返回原始样本（不经任何色彩管理） */
export function decodePng(buf, tag) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${tag} 不是 PNG`);
  let p = 8;
  let ihdr = null;
  const chunks = [];
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    chunks.push(type);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === "IDAT") idat.push(data);
    p += 12 + len;
  }
  if (ihdr.depth !== 8 || ihdr.color !== 6 || ihdr.interlace !== 0) throw new Error(`${tag} 非 8bit RGBA 无交错：${JSON.stringify(ihdr)}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = ihdr.w * 4;
  const out = Buffer.alloc(ihdr.h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < ihdr.h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, y * stride + stride);
    line.copy(cur);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let v = cur[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (f !== 0) throw new Error(`${tag} 未知滤波 ${f}`);
      cur[x] = v & 0xff;
    }
    prev = cur;
  }
  return { ...ihdr, data: out, chunks: chunks.filter((t) => t !== "IDAT").join(",") };
}

/** 把矩形区域从原始样本里拍平成一块 buffer（逐行 copy，越界即抛） */
export function cropRaw(img, x, y, w, h) {
  if (x < 0 || y < 0 || x + w > img.w || y + h > img.h) throw new Error(`矩形 (${x},${y},${w},${h}) 越界 ${img.w}x${img.h}`);
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < h; i++) img.data.copy(out, i * w * 4, (y + i) * img.w * 4 + x * 4, (y + i) * img.w * 4 + x * 4 + w * 4);
  return out;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * 编 8bit RGBA 无交错 PNG（zlib level 9 + libpng 同款逐行滤波择优：取"绝对差之和"最小者）。
 * 纯函数：同样本进同样本出，故 `--check` 的字节级可复现性成立（不写时间戳、不留 ancillary 块）。
 */
export function encodePngRgba(w, h, data) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const cur = data.subarray(y * stride, y * stride + stride);
    const prev = y > 0 ? data.subarray((y - 1) * stride, (y - 1) * stride + stride) : Buffer.alloc(stride);
    let bestF = 0;
    let bestCost = Infinity;
    for (let f = 0; f <= 4; f++) {
      let cost = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? cur[x - 4] : 0;
        const b = prev[x];
        const c = x >= 4 ? prev[x - 4] : 0;
        let v;
        if (f === 0) v = cur[x];
        else if (f === 1) v = cur[x] - a;
        else if (f === 2) v = cur[x] - b;
        else if (f === 3) v = cur[x] - ((a + b) >> 1);
        else {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
          v = cur[x] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        v &= 0xff;
        cost += Math.min(v, 256 - v); // 有符号幅度：滤波后越接近 0 越省
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestF = f;
      }
    }
    raw[y * (stride + 1)] = bestF;
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? cur[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let pred = 0;
      if (bestF === 1) pred = a;
      else if (bestF === 2) pred = b;
      else if (bestF === 3) pred = (a + b) >> 1;
      else if (bestF === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = (cur[x] - pred) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // truecolour + alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
