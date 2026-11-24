// Built-in node:test suite for render_figures.py and request-example.ps1.
// Fixtures are temp copies derived from the authoritative external publication-data.json.
// Runs only the interpreter and pwsh's parser; never contacts a server or GPU.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = homedir();
// Python: honour QWEN_FIGURES_PYTHON, else this machine's local article venv if
// present, else whatever `python` resolves to on PATH. No hardcoded user paths.
function resolvePython() {
  if (process.env.QWEN_FIGURES_PYTHON) return process.env.QWEN_FIGURES_PYTHON;
  const venv = path.join(HOME, ".cache", "qwen-article-venv", "Scripts", "python.exe");
  return existsSync(venv) ? venv : "python";
}
// Data: the published sibling publication-data.json when present, otherwise the
// authoritative external fixture read from the article folder under HOME.
function resolveData() {
  const sibling = path.join(HERE, "publication-data.json");
  return existsSync(sibling)
    ? sibling
    : path.join(HOME, "Documents", "Writing", "Qwen Benchmark Article", "publication-data.json");
}
const PYTHON = resolvePython();
const DATA = resolveData();
const SCRIPT = path.join(HERE, "render_figures.py");
const PS1 = path.join(HERE, "request-example.ps1");
const FIGURES = ["clock-policy", "flash-gpu-scaling", "mtp-placement"];
const base = JSON.parse(readFileSync(DATA, "utf8"));

function runPy(args) {
  try {
    return { code: 0, stdout: execFileSync(PYTHON, [SCRIPT, ...args], { encoding: "utf8" }) };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? String(err) };
  }
}

function fixture(mutate) {
  const clone = structuredClone(base);
  mutate(clone);
  const dir = mkdtempSync(path.join(tmpdir(), "qwen-fig-"));
  const file = path.join(dir, "publication-data.json");
  // Placeholder strings become bare JSON tokens; Python's json accepts NaN/Infinity.
  const text = JSON.stringify(clone).replaceAll('"__NaN__"', "NaN").replaceAll('"__Infinity__"', "Infinity");
  writeFileSync(file, text);
  return { dir, file };
}

function rejected(label, mutate) {
  test(`rejects ${label}`, (t) => {
    const fx = fixture(mutate);
    t.after(() => rmSync(fx.dir, { recursive: true, force: true }));
    const res = runPy(["--data", fx.file, "--check-data"]);
    assert.notEqual(res.code, 0, `expected failure, stdout: ${res.stdout}`);
    assert.match(res.stderr, /invalid publication data/);
  });
}

test("valid external publication data passes --check-data", (t) => {
  const fx = fixture(() => {});
  t.after(() => rmSync(fx.dir, { recursive: true, force: true }));
  const res = runPy(["--data", fx.file, "--check-data"]);
  assert.equal(res.code, 0, res.stderr);
  assert.match(res.stdout, /data OK/);
});

test("renders all six figure files non-empty", (t) => {
  const fx = fixture(() => {});
  const out = path.join(fx.dir, "figures");
  t.after(() => rmSync(fx.dir, { recursive: true, force: true }));
  const res = runPy(["--data", fx.file, "--out", out]);
  assert.equal(res.code, 0, res.stderr);
  assert.deepEqual(readdirSync(out).sort(),
    FIGURES.flatMap((f) => [`${f}.png`, `${f}.svg`]).sort());
  for (const f of FIGURES)
    for (const ext of ["png", "svg"])
      assert.ok(statSync(path.join(out, `${f}.${ext}`)).size > 0, `${f}.${ext} is empty`);
  // Display-only regression: Matplotlib keeps each text label as an SVG comment.
  // Mean tokens/s labels are whole numbers and both context subtitles read "256K context".
  const labelsOf = (name) => [...readFileSync(path.join(out, `${name}.svg`), "utf8")
    .matchAll(/<!--(.*?)-->/gs)].map((m) => m[1]).join("\n");
  const clockLabels = labelsOf("clock-policy");
  const scalingLabels = labelsOf("flash-gpu-scaling");
  for (const want of ["46  (n=2)", "109  (n=2)"])
    assert.ok(clockLabels.includes(want), `clock SVG missing integer mean label ${want}: ${clockLabels}`);
  assert.ok(scalingLabels.includes("76  (n=2)"),
    `scaling SVG missing integer mean label 76  (n=2): ${scalingLabels}`);
  for (const stale of ["46.3  (n=", "108.7  (n=", "75.5  (n="])
    assert.ok(!(clockLabels + scalingLabels).includes(stale),
      `one-decimal mean label ${stale} still rendered`);
  for (const labels of [clockLabels, scalingLabels]) {
    assert.match(labels, /256K context/);
    assert.doesNotMatch(labels, /262144/);
  }
});

rejected("mean above max", (d) => { d.clock[0].mean = d.clock[0].max + 10; });
rejected("min above mean", (d) => { d.clock[1].min = d.clock[1].mean + 1; });
rejected("non-positive value", (d) => { d.scaling[1].min = -5; });
rejected("non-finite mean", (d) => { d.clock[0].mean = "__NaN__"; });
rejected("non-finite max", (d) => { d.scaling[0].max = "__Infinity__"; });
rejected("unexpected cohort id", (d) => { d.clock[1].id = "cause-q4-manual"; });
rejected("wrong scaling id set", (d) => { d.scaling[2].id = "flash-q2-4gpu"; });
rejected("n = 0", (d) => { d.scaling[0].n = 0; });
rejected("non-integer n", (d) => { d.clock[2].n = 1.5; });
rejected("capped above n", (d) => { d.clock[0].capped = d.clock[0].n + 1; });
rejected("negative capped", (d) => { d.clock[1].capped = -1; });
rejected("wrong scaling context", (d) => { d.scaling[0].context = 131072; });

test("request-example.ps1 parses cleanly under pwsh (no execution, no HTTP)", () => {
  assert.ok(existsSync(PS1), "request-example.ps1 missing");
  const script = `
    $errs = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile('${PS1.replaceAll("\\", "\\\\")}', [ref]$null, [ref]$errs)
    if ($errs.Count -gt 0) { $errs | ForEach-Object { $_.Message }; exit 1 }
    "parse OK"
  `;
  const out = execFileSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
  assert.match(out, /parse OK/);
  const text = readFileSync(PS1, "utf8");
  for (const needle of ["Write a C# implementation of an LRU cache", "max_tokens", "seed",
    "temp", "--no-buffer", "--data-binary", "ConvertTo-Json", "include_usage", "finally"])
    assert.ok(text.includes(needle), `request-example.ps1 missing ${needle}`);
});
