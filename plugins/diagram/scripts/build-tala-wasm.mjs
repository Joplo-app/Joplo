#!/usr/bin/env node
/**
 * Reproducibly builds plugins/diagram/src/tala.wasm.br from
 * plugins/diagram/tala-wasm/main.go against github.com/d2lang/d2@v0.9.0 (MPL-2.0),
 * stripping unused renderer font/LaTeX/Markdown embeds that TALA never calls.
 *
 * Requires Go >= 1.24 when regenerating the binary; normal Joplo builds/installs
 * consume the prebuilt plugins/diagram/src/tala.wasm.br directly.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const D2_VERSION = 'v0.9.0';
const PKG_DIR = path.resolve(import.meta.dirname, '..');
const WASM_SRC = path.join(PKG_DIR, 'tala-wasm/main.go');
const OUT_BR = path.join(PKG_DIR, 'src/tala.wasm.br');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joplo-tala-wasm-'));
try {
  fs.copyFileSync(WASM_SRC, path.join(work, 'main.go'));
  execFileSync('go', ['mod', 'init', 'joplo-tala-wasm'], { cwd: work, stdio: 'inherit' });
  execFileSync('go', ['get', `github.com/d2lang/d2@${D2_VERSION}`], { cwd: work, stdio: 'inherit' });
  const d2Dir = execFileSync('go', ['list', '-m', '-f', '{{.Dir}}', 'github.com/d2lang/d2'], { cwd: work, encoding: 'utf8' }).trim();

  const d2Trim = path.join(work, 'd2trim');
  fs.cpSync(d2Dir, d2Trim, { recursive: true });
  const makeWritable = (dir) => {
    fs.chmodSync(dir, 0o755);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) makeWritable(p);
      else fs.chmodSync(p, 0o644);
    }
  };
  makeWritable(d2Trim);

  // TALA operates purely on geometry (already measured boxes & label dimensions);
  // stubbing D2's unused font/HarfBuzz/MathJax packages saves ~15 MB of raw WASM.
  const fontsDir = path.join(d2Trim, 'd2renderers/d2fonts');
  fs.rmSync(fontsDir, { recursive: true, force: true });
  fs.mkdirSync(fontsDir, { recursive: true });
  fs.writeFileSync(
    path.join(fontsDir, 'd2fonts.go'),
    `package d2fonts

type FontFamily string
type FontStyle string
type Font struct {
\tFamily FontFamily
\tStyle  FontStyle
\tSize   int
}

func (f FontFamily) Font(size int, style FontStyle) Font {
\treturn Font{Family: f, Style: style, Size: size}
}
func (f Font) GetEncodedSubset(corpus string) string { return "" }

const (
\tFONT_SIZE_XS   = 13
\tFONT_SIZE_S    = 14
\tFONT_SIZE_M    = 16
\tFONT_SIZE_L    = 20
\tFONT_SIZE_XL   = 24
\tFONT_SIZE_XXL  = 28
\tFONT_SIZE_XXXL = 32

\tFONT_STYLE_REGULAR  FontStyle = "regular"
\tFONT_STYLE_BOLD     FontStyle = "bold"
\tFONT_STYLE_SEMIBOLD FontStyle = "semibold"
\tFONT_STYLE_ITALIC   FontStyle = "italic"

\tSourceSansPro FontFamily = "SourceSansPro"
\tSourceCodePro FontFamily = "SourceCodePro"
\tHandDrawn     FontFamily = "HandDrawn"
)

var FontSizes = []int{FONT_SIZE_XS, FONT_SIZE_S, FONT_SIZE_M, FONT_SIZE_L, FONT_SIZE_XL, FONT_SIZE_XXL, FONT_SIZE_XXXL}
var FontStyles = []FontStyle{FONT_STYLE_REGULAR, FONT_STYLE_BOLD, FONT_STYLE_SEMIBOLD, FONT_STYLE_ITALIC}
var FontFamilies = []FontFamily{SourceSansPro, SourceCodePro, HandDrawn}
var D2_FONT_TO_FAMILY = map[string]FontFamily{"default": SourceSansPro, "mono": SourceCodePro}
`,
  );

  const tmDir = path.join(d2Trim, 'lib/textmeasure');
  fs.rmSync(tmDir, { recursive: true, force: true });
  fs.mkdirSync(tmDir, { recursive: true });
  fs.writeFileSync(
    path.join(tmDir, 'textmeasure.go'),
    `package textmeasure

import "github.com/d2lang/d2/d2renderers/d2fonts"

const CODE_LINE_HEIGHT = 1.3

type Ruler struct{ LineHeightFactor float64 }

func NewRuler() (*Ruler, error)                                   { return &Ruler{}, nil }
func (r *Ruler) HasFontFamilyLoaded(*d2fonts.FontFamily) bool     { return true }
func (r *Ruler) Measure(d2fonts.Font, string) (int, int)          { return 0, 0 }
func (r *Ruler) MeasureMono(d2fonts.Font, string) (int, int)      { return 0, 0 }
func (r *Ruler) MeasurePrecise(d2fonts.Font, string) (float64, float64) { return 0, 0 }
func MeasureMarkdown(string, *Ruler, *d2fonts.FontFamily, *d2fonts.FontFamily, int) (int, int, error) {
\treturn 0, 0, nil
}
func RenderMarkdown(s string) (string, error) { return s, nil }
`,
  );

  const mjStub = path.join(work, 'mjstub');
  fs.mkdirSync(mjStub, { recursive: true });
  fs.writeFileSync(path.join(mjStub, 'go.mod'), 'module github.com/d2lang/mathjax-go\ngo 1.24\n');
  fs.writeFileSync(
    path.join(mjStub, 'mj.go'),
    'package mathjax\nfunc Render(string) (string, error) { return "", nil }\nfunc Measure(string) (int, int, error) { return 0, 0, nil }\n',
  );

  execFileSync('go', ['mod', 'edit', '-replace', 'github.com/d2lang/d2=./d2trim', '-replace', 'github.com/d2lang/mathjax-go=./mjstub'], { cwd: work, stdio: 'inherit' });
  const rawWasm = path.join(work, 'tala.wasm');
  execFileSync('go', ['build', '-buildmode=c-shared', '-trimpath', '-ldflags=-s -w', '-o', rawWasm, 'main.go'], {
    cwd: work,
    env: { ...process.env, GOOS: 'wasip1', GOARCH: 'wasm' },
    stdio: 'inherit',
  });

  const raw = fs.readFileSync(rawWasm);
  const br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
  fs.writeFileSync(OUT_BR, br);
  console.log(`✓ Built ${path.relative(PKG_DIR, OUT_BR)} (${(raw.length / 1e6).toFixed(2)} MB raw → ${(br.length / 1e6).toFixed(2)} MB brotli)`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
