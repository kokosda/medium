#!/usr/bin/env python3
"""Render publication figures for the Qwen RTX 3090 benchmark article.

Reads publication-data.json (authoritative measurements), validates it, and
writes clock-policy, flash-gpu-scaling and mtp-placement as PNG and SVG.
All chart values come from the data file; nothing numeric is hardcoded here.
"""
import argparse
import json
import math
import sys
from pathlib import Path

# matplotlib is imported lazily in _load_mpl() so --check-data validates the
# data file without requiring any plotting dependencies to be installed.
plt = None
FancyBboxPatch = None

IVORY = "#faf5ea"
INK = "#20242e"
MUTED = "#5a5f6b"
TEAL = "#177e78"
ORANGE = "#d97e2b"

CLOCK_IDS = ["cause-q4-auto", "cause-q4-lock", "cause-q4-auto-return"]
SCALING_IDS = [
    "flash-q2-1gpu-f16-swiftmtp-probe512-c262144",
    "flash-q2-2gpu-f16-swiftmtp-probe512-c262144",
    "flash-q2-3gpu-f16-swiftmtp-probe512-c262144",
]


def _pos_finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and v > 0


def _int_pos(v):
    return isinstance(v, int) and not isinstance(v, bool) and v > 0


def validate(data):
    """Raise ValueError listing every problem found in the publication data."""
    errors = []
    cohorts = (("clock", CLOCK_IDS, data.get("clock")), ("scaling", SCALING_IDS, data.get("scaling")))
    for name, ids, rows in cohorts:
        if not isinstance(rows, list) or len(rows) != 3 or [r.get("id") for r in rows if isinstance(r, dict)] != ids:
            errors.append(f"{name}: expected exactly the three runs {ids}, got {[r.get('id') for r in rows if isinstance(r, dict)] if isinstance(rows, list) else rows}")
            continue
        for r in rows:
            tag = f"{name}/{r['id']}"
            mean, lo, hi, n = r.get("mean"), r.get("min"), r.get("max"), r.get("n")
            if not all(_pos_finite(v) for v in (mean, lo, hi)):
                errors.append(f"{tag}: mean/min/max must be finite and positive")
            elif not (lo <= mean <= hi):
                errors.append(f"{tag}: need min <= mean <= max")
            if not _int_pos(n):
                errors.append(f"{tag}: n must be a positive integer")
                n = 1
            if name == "clock":
                if r.get("cap") != 4096:
                    errors.append(f"{tag}: clock cap must be 4096")
                capped = r.get("capped")
                if not isinstance(capped, int) or isinstance(capped, bool) or not (0 <= capped <= n):
                    errors.append(f"{tag}: capped count must be an integer in 0..n")
            else:
                if r.get("context") != 262144:
                    errors.append(f"{tag}: context must be 262144")
                if r.get("cap") != 512:
                    errors.append(f"{tag}: scaling cap must be 512")
    if errors:
        raise ValueError("; ".join(errors))


def _load_mpl():
    """Import matplotlib after validation so --check-data needs no plotting deps."""
    global plt, FancyBboxPatch
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot
    from matplotlib.patches import FancyBboxPatch as _FancyBboxPatch

    plt = matplotlib.pyplot
    FancyBboxPatch = _FancyBboxPatch


def _save(fig, outdir, name):
    fig.savefig(outdir / f"{name}.png", dpi=200, facecolor=IVORY, bbox_inches="tight")
    fig.savefig(outdir / f"{name}.svg", facecolor=IVORY, bbox_inches="tight")
    plt.close(fig)


def _figure(figsize=(10.0, 6.25)):
    fig, ax = plt.subplots(figsize=figsize)
    fig.patch.set_facecolor(IVORY)
    ax.set_facecolor(IVORY)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(colors=INK, labelsize=13)
    return fig, ax


def _head(fig, title, subtitle):
    fig.text(0.05, 0.975, title, fontsize=19, fontweight="bold", color=INK, va="top")
    fig.text(0.05, 0.905, subtitle, fontsize=12, color=MUTED, va="top", linespacing=1.35)


def _bars(rows, x, color, subtitle, footnotes, title, labels=None, ylabel="tokens/s"):
    fig, ax = _figure()
    means = [r["mean"] for r in rows]
    lo = [r["mean"] - r["min"] for r in rows]
    hi = [r["max"] - r["mean"] for r in rows]
    ax.bar(x, means, width=0.55, color=color, zorder=2)
    ax.errorbar(x, means, yerr=[lo, hi], fmt="none", ecolor=INK, elinewidth=1.5, capsize=7, capthick=1.5, zorder=3)
    for xi, r in zip(x, rows):
        ax.annotate(f"{r['mean']:.1f}  (n={r['n']})", (xi, r["max"]), xytext=(0, 10),
                    textcoords="offset points", ha="center", fontsize=13, fontweight="bold", color=INK)
    ax.set_xticks(x, labels or [r["label"] for r in rows])
    ax.set_ylabel(ylabel, fontsize=14, color=INK)
    ax.set_ylim(0, max(r["max"] for r in rows) * 1.22)
    ax.grid(axis="y", color=INK, alpha=0.15, zorder=0)
    fig.subplots_adjust(top=0.76, bottom=0.22)
    _head(fig, title, subtitle)
    for i, note in enumerate(reversed(footnotes)):
        fig.text(0.05, 0.04 + 0.055 * i, note, fontsize=10.5, color=MUTED, va="bottom")
    return fig


def clock_chart(rows, outdir):
    rows = sorted(rows, key=lambda r: CLOCK_IDS.index(r["id"]))
    capped = ", ".join(f"{r['capped']}/{r['n']}" for r in rows)
    fig = _bars(rows, [0, 1, 2], TEAL,
                "Strata Flash Next Unsloth UD-Q4_K_XL · 3 GPUs · 300 W\nF16 KV · 262144 context",
                [f"4096-token output cap; runs capped: {capped} (Auto, Locked, Auto again).",
                 "Whiskers show observed min-max, not confidence intervals."],
                "Same Q4 model, different clock policy")
    _save(fig, outdir, "clock-policy")


def scaling_chart(rows, outdir):
    rows = sorted(rows, key=lambda r: SCALING_IDS.index(r["id"]))
    fig = _bars(rows, [0, 1, 2], ORANGE,
                "llamAmpere 0.7.2.1 Windows · ISTA-DASLab GSQ-RCO Q2_0 · 300 W\nF16 KV · 262144 context",
                ["512-token capped probes; MTP follows model devices; multi-GPU experimental in this path.",
                 "Whiskers show observed min-max, not confidence intervals."],
                "Same Q2 model, different GPU count",
                labels=["1 GPU", "2 GPUs", "3 GPUs"])
    _save(fig, outdir, "flash-gpu-scaling")


def _box(ax, x, y, w, h, text, color, fsize=12):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.012",
                                facecolor=color, edgecolor=INK, linewidth=1.4, alpha=0.92))
    if text:
        ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fsize,
                color="white" if color != IVORY else INK, fontweight="bold")


def _mtp_panel(ax, heading, draft_text):
    """One conceptual panel, vertically stacked: Draft -> Main verifies -> Output."""
    ax.set_title(heading, fontsize=13.5, fontweight="bold", color=INK, linespacing=1.3)
    _box(ax, 0.14, 0.87, 0.72, 0.11, "Accepted output", IVORY, 12.5)
    _box(ax, 0.06, 0.44, 0.88, 0.30, "", TEAL)
    ax.text(0.5, 0.675, "Main model verifies", ha="center", va="center",
            fontsize=12.5, color="white", fontweight="bold")
    _box(ax, 0.13, 0.47, 0.34, 0.13, "GPU 1", IVORY, 11.5)
    _box(ax, 0.53, 0.47, 0.34, 0.13, "GPU 2", IVORY, 11.5)
    _box(ax, 0.06, 0.07, 0.88, 0.20, "", ORANGE)
    ax.text(0.5, 0.20, "Draft proposes", ha="center", va="center",
            fontsize=12.5, color="white", fontweight="bold")
    ax.text(0.5, 0.128, draft_text, ha="center", va="center", fontsize=10.5, color="white")
    ax.annotate("", xy=(0.5, 0.44), xytext=(0.5, 0.27),
                arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.8, shrinkA=1, shrinkB=1))
    ax.text(0.525, 0.355, "proposals", ha="left", va="center", fontsize=10.5, color=MUTED)
    ax.annotate("", xy=(0.5, 0.87), xytext=(0.5, 0.74),
                arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.8, shrinkA=1, shrinkB=1))
    ax.text(0.525, 0.805, "accepted", ha="left", va="center", fontsize=10.5, color=MUTED)


def mtp_diagram(outdir):
    fig, (a, b) = plt.subplots(1, 2, figsize=(11.0, 6.2))
    fig.patch.set_facecolor(IVORY)
    for ax in (a, b):
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.axis("off")
    _mtp_panel(a, "Separate placement\n2 model GPUs + 1 draft GPU", "GPU 3 (dedicated)")
    _mtp_panel(b, "Shared placement\n2 total GPUs, main + draft", "shares one model GPU")
    fig.text(0.5, 0.06, "Draft proposes  →  Main verifies  →  Accepted output", ha="center",
             fontsize=13, fontweight="bold", color=INK)
    fig.text(0.5, 0.015, "Conceptual placement only — no timings and no PCIe topology implied.",
             ha="center", fontsize=10.5, color=MUTED)
    fig.subplots_adjust(left=0.03, right=0.97, top=0.82, bottom=0.12, wspace=0.26)
    _save(fig, outdir, "mtp-placement")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path(__file__).resolve().parent / "publication-data.json",
                        help="path to publication-data.json (default: sibling file)")
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parent / "figures",
                        help="output directory for the six figure files")
    parser.add_argument("--check-data", action="store_true", help="only validate the data file; render nothing")
    args = parser.parse_args(argv)
    data = json.loads(args.data.read_text(encoding="utf-8"))
    try:
        validate(data)
    except ValueError as exc:
        print(f"invalid publication data: {exc}", file=sys.stderr)
        return 1
    print("data OK: clock and scaling cohorts valid")
    if args.check_data:
        return 0
    _load_mpl()
    args.out.mkdir(parents=True, exist_ok=True)
    clock_chart(data["clock"], args.out)
    scaling_chart(data["scaling"], args.out)
    mtp_diagram(args.out)
    print(f"rendered 6 figure files in {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
