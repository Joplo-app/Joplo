"""
把中文字体切成按需加载的 woff2 子集，并生成 @font-face（含 unicode-range）。
使用 scripts/cjk-ranges.json 保存的原始分片范围（源自小赖）：保持顺序与范围不变。

用法（fonttools 与 brotli 用 uv 临时提供）：
  uv run --with fonttools --with brotli python -I packages/web/scripts/split-cjk-fonts.py \
    <字体.ttf> <输出目录名，如 MarkerGothic> <font-family，如 'Joplo Marker Gothic'>
输出：src/fonts/<目录名>/*.woff2，以及 src/fonts/<目录名>.css。字体许可见 src/fonts/OFL-<目录名>.txt。
"""
import hashlib
import io
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ttf, dirname, family = sys.argv[1], sys.argv[2], sys.argv[3]
fonts_dir = Path(__file__).resolve().parent.parent / "src" / "fonts"
ranges = json.loads((Path(__file__).resolve().parent / "cjk-ranges.json").read_text())
if not ranges:
    raise SystemExit("cjk-ranges.json contains no unicode ranges")


def codepoints(spec: str) -> list[int]:
    out: list[int] = []
    for part in spec.split(","):
        part = part.strip().removeprefix("U+")
        if "-" in part:
            a, b = part.split("-")
            out.extend(range(int(a, 16), int(b, 16) + 1))
        else:
            out.append(int(part, 16))
    return out


base = TTFont(ttf)
cmap = base.getBestCmap()
out_dir = fonts_dir / dirname
out_dir.mkdir(exist_ok=True)
for old in out_dir.glob("*.woff2"):
    old.unlink()

opts = subset.Options()
opts.flavor = "woff2"
opts.layout_features = ["*"]
opts.name_IDs = ["*"]
opts.notdef_outline = True
opts.hinting = False

faces = []
for spec in ranges:
    cps = [c for c in codepoints(spec) if c in cmap]
    if not cps:
        continue
    font = TTFont(ttf)
    s = subset.Subsetter(options=opts)
    s.populate(unicodes=cps)
    s.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    data = buf.getvalue()
    name = f"{dirname}-{hashlib.md5(data).hexdigest()[:16]}.woff2"
    (out_dir / name).write_bytes(data)
    faces.append(f"@font-face{{font-family:'{family}';src:url('./{dirname}/{name}') format('woff2');font-display:block;unicode-range:{spec};}}")

header = f"/* 由 scripts/split-cjk-fonts.py 生成（分片范围沿用小赖）。字体许可：SIL OFL 1.1（见 OFL-{dirname}.txt）。 */\n"
(fonts_dir / f"{dirname}.css").write_text(header + "\n".join(faces) + "\n")
total = sum(p.stat().st_size for p in out_dir.glob("*.woff2"))
print(f"{family}: {len(faces)} 片，共 {total / 1024 / 1024:.1f} MB")
