"""학생 원룸 시세 기준(정책) 설명 그래프

입력  data/rows/sh-rent-*.jsonl, data/rows/rh-rent-*.jsonl  (scripts/collect-rent.mts 결과)
      data/geo-cache.json  (scripts/rent-nearest-demo.mts 가 만든 동 좌표)

확정 기준 (collect-rent.mts 의 FILTER 와 같게 유지)
  월세 거래 · 보증금 5,000만 원 이하 · 월세 100만 원 이하 · 면적 14㎡(최저주거기준) 이상 40㎡ 이하
  · 반지하 제외(층 정보가 있는 연립/다세대) · 시세 = 환산 월세 = 월세 + 보증금 × 3.5% ÷ 12
  학교 근처 동 = 학교에서 가까운 법정동 5곳 (1년 거래 100건 이상)

출력  data/analysis/01-filter-funnel.png    단계별로 남는 거래 수
      data/analysis/02-thresholds.png       보증금·월세·면적 분포와 기준선
      data/analysis/03-converted-rent.png   월세 vs 환산 월세
      data/analysis/04-type-mix.png         학교별 단독/다가구·연립/다세대 비중과 시세
      data/analysis/05-school-result.png    학교별 가까운 동 환산 월세
      data/analysis/summary.csv             학교별 가까운 동 시세 표
      data/school-dongs.json                앱(lib/data.ts)이 쓰는 학교별 주변 동 시세·좌표

실행  python scripts/analyze_rent.py
"""

import glob
import json
import math
import sys
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import FixedLocator, FuncFormatter

sys.stdout.reconfigure(encoding="utf-8")  # Windows 콘솔 한글

# ── 확정 기준 ──
F = {"max_deposit": 5000, "max_rent": 100, "min_area": 14, "max_area": 40, "rate": 0.035}
TOP, MIN_COUNT = 5, 100
OUT = Path("data/analysis")
OUT.mkdir(parents=True, exist_ok=True)

# lib/data.ts 의 데모 학교 좌표
SCHOOLS = {
    "고려대학교": (37.5894, 127.0322),
    "연세대학교": (37.5658, 126.9386),
    "서울대학교": (37.4599, 126.9519),
    "한양대학교": (37.5572, 127.0453),
    "건국대학교": (37.5408, 127.0793),
    "경희대학교": (37.5964, 127.0525),
}

# ── 스타일 (dataviz 기준 팔레트, 라이트) ──
C1, C2 = "#2a78d6", "#eb6834"  # 범주 슬롯 1·2 (두 시리즈까지)
MUTED, SURFACE, TEXT, TEXT2, GRID = "#c3c2b7", "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
plt.rcParams.update({
    "font.family": "Malgun Gothic", "axes.unicode_minus": False, "font.size": 10,
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "axes.edgecolor": GRID,
    "axes.labelcolor": TEXT2, "xtick.color": TEXT2, "ytick.color": TEXT2, "text.color": TEXT,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.spines.top": False, "axes.spines.right": False,
})


def footer(fig, text):
    fig.text(0.01, 0.012, text, fontsize=8.5, color=TEXT2)


def title(fig, text):
    fig.suptitle(text, x=0.01, ha="left", fontsize=13, fontweight="bold")


def km(a, b):
    r = math.radians
    dlat, dlng = r(b[0] - a[0]), r(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(dlng / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


# ── 데이터 ──
frames = []
for t in ("sh", "rh"):
    files = sorted(glob.glob(f"data/rows/{t}-rent-*.jsonl"))
    if not files:
        raise SystemExit(f"data/rows/{t}-rent-*.jsonl 이 없어요. collect-rent.mts --type {t} 를 먼저 실행하세요.")
    part = pd.concat([pd.read_json(f, lines=True, dtype={"ym": str}) for f in files], ignore_index=True)
    part["type"] = t
    if "floor" not in part:
        part["floor"] = pd.NA  # 단독/다가구는 층 정보 없음
    frames.append(part[["type", "gu", "dongBase", "ym", "deposit", "rent", "area", "floor"]])
rows = pd.concat(frames, ignore_index=True)
rows["floor"] = pd.to_numeric(rows["floor"], errors="coerce")
rows["conv"] = rows["rent"] + rows["deposit"] * F["rate"] / 12
months = sorted(rows["ym"].unique())
period = f"{months[0][:4]}.{months[0][4:]} ~ {months[-1][:4]}.{months[-1][4:]}"
SOURCE = f"국토교통부 실거래가(단독/다가구·연립/다세대) · 서울 · {period}"

# 단계별 기준 (순서대로 적용)
STEPS = [
    ("전체 전월세 거래", lambda d: pd.Series(True, index=d.index)),
    ("월세 거래 (전세 제외)", lambda d: d["rent"] > 0),
    ("보증금 5,000만 원 이하", lambda d: d["deposit"] <= F["max_deposit"]),
    ("월세 100만 원 이하", lambda d: d["rent"] <= F["max_rent"]),
    ("면적 14㎡ 이상 (최저주거기준)", lambda d: d["area"] >= F["min_area"]),
    ("면적 40㎡ 이하 (원룸 범위)", lambda d: d["area"] <= F["max_area"]),
    ("반지하 제외", lambda d: d["floor"].isna() | (d["floor"] >= 1)),
]
mask = pd.Series(True, index=rows.index)
funnel = []
for name, rule in STEPS:
    mask &= rule(rows)
    funnel.append((name, int(mask.sum())))
df = rows[mask].copy()  # 확정 기준 통과
monthly = rows[rows["rent"] > 0]  # 기준선 그림용 (월세 거래 전체)
total = funnel[0][1]

# 학교 근처 동 (확정 기준, 1년 100건 이상, 가까운 순 5곳)
geo = json.loads(Path("data/geo-cache.json").read_text(encoding="utf-8"))
stats = df.groupby(["gu", "dongBase"]).agg(
    count=("conv", "size"), p25=("conv", lambda s: s.quantile(0.25)), median=("conv", "median"),
    p75=("conv", lambda s: s.quantile(0.75)), rent_median=("rent", "median"),
    deposit_median=("deposit", "median"), rh_share=("type", lambda s: (s == "rh").mean()),
).reset_index()
stats["pos"] = [(g["lat"], g["lng"]) if (g := geo.get(f"서울특별시 {a} {b}")) else None for a, b in zip(stats.gu, stats.dongBase)]
cand = stats[stats["pos"].notna() & (stats["count"] >= MIN_COUNT)]
near_rows = []
for school, spos in SCHOOLS.items():
    c = cand.copy()
    c["km"] = [km(spos, p) for p in c["pos"]]
    for _, r in c.nsmallest(TOP, "km").iterrows():
        near_rows.append({"school": school, "gu": r.gu, "dong": r.dongBase, "km": round(r.km, 2), "count": int(r["count"]),
                          "rh_share": round(r.rh_share * 100), "p25": round(r.p25, 1), "median": round(r["median"], 1),
                          "p75": round(r.p75, 1), "rent_median": r.rent_median, "deposit_median": r.deposit_median,
                          "lat": round(r.pos[0], 5), "lng": round(r.pos[1], 5)})
near = pd.DataFrame(near_rows)
near.drop(columns=["lat", "lng"]).to_csv(OUT / "summary.csv", index=False, encoding="utf-8-sig")
# 앱(lib/data.ts)이 읽는 학교별 주변 동 시세: 학교 이름 → 가까운 순 동 목록 (금액 단위: 만 원)
app_rows = {s: [{k: (v.item() if hasattr(v, "item") else v) for k, v in row.items() if k != "school"}
                for row in near_rows if row["school"] == s] for s in SCHOOLS}
Path("data/school-dongs.json").write_text(
    json.dumps({"period": period, "filter": F, "minCount": MIN_COUNT, "schools": app_rows}, ensure_ascii=False, indent=1),
    encoding="utf-8")
near_keys = {(r.gu, r.dong) for r in near.itertuples()}
dn = df[[(a, b) in near_keys for a, b in zip(df.gu, df.dongBase)]]  # 학교 근처 동 거래 (확정 기준)

# ── 01. 단계별 남는 거래 수 ──
fig, ax = plt.subplots(figsize=(11, 4.8))
names = [n for n, _ in funnel][::-1]
counts = [c for _, c in funnel][::-1]
y = np.arange(len(names))
ax.barh(y, counts, color=C1, height=0.62)
for yi, c in zip(y, counts):
    idx = len(funnel) - 1 - yi
    drop = funnel[idx - 1][1] - c if idx > 0 else 0
    note = f"{c:,}건 · {c / total:.0%}" + (f"  ({drop:,}건 제외)" if drop else "")
    ax.text(c + total * 0.01, yi, note, va="center", fontsize=9.5, color=TEXT)
ax.set_yticks(y, names)
ax.set_xlim(0, total * 1.32)
ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v / 10000:g}만"))
ax.grid(axis="y", visible=False)
ax.tick_params(axis="y", length=0)
ax.set_xlabel("거래 수")
title(fig, f"기준을 차례로 적용하면 남는 거래: {total:,}건 → {funnel[-1][1]:,}건")
footer(fig, SOURCE + " · 위에서 아래로 기준을 하나씩 더 적용 · 괄호 = 그 단계에서 빠진 거래 수")
fig.tight_layout(rect=(0, 0.04, 1, 0.94))
fig.savefig(OUT / "01-filter-funnel.png", dpi=160)
plt.close(fig)


# ── 02. 기준선: 보증금 · 월세 · 면적 (월세 거래 전체, 기준 밖 = 회색) ──
def cut_hist(ax, values, bins, keep, xlabel, lines, log=False):
    h, edges = np.histogram(values, bins=bins)
    share = h / len(values) * 100
    centers = np.sqrt(edges[:-1] * edges[1:]) if log else (edges[:-1] + edges[1:]) / 2
    ax.bar(edges[:-1], share, width=np.diff(edges), align="edge", color=[C1 if keep(x) else MUTED for x in centers],
           edgecolor=SURFACE, linewidth=0.6)
    if log:
        ax.set_xscale("log")
    ymax = share.max() * 1.25
    ax.set_ylim(0, ymax)
    for x, label in lines:
        ax.axvline(x, color=TEXT, linewidth=1.2, linestyle=(0, (3, 3)))
        ax.text(x, ymax * 0.98, label, ha="center", va="top", fontsize=9, color=TEXT,
                bbox=dict(facecolor=SURFACE, edgecolor="none", pad=1.5))
    ax.set_xlabel(xlabel)
    ax.grid(axis="x", visible=False)


fig, axes = plt.subplots(1, 3, figsize=(14, 4.8))
dep_bins = np.logspace(np.log10(50), np.log10(50000), 45)
cut_hist(axes[0], monthly["deposit"].clip(lower=50, upper=49999), dep_bins, lambda x: x <= F["max_deposit"],
         "보증금 (만 원, 로그 축)", [(F["max_deposit"], "5,000만")], log=True)
axes[0].xaxis.set_major_locator(FixedLocator([100, 500, 1000, 5000, 10000, 50000]))
axes[0].xaxis.set_minor_locator(FixedLocator([]))
axes[0].xaxis.set_major_formatter(FuncFormatter(lambda v, _: f"{v / 10000:g}억" if v >= 10000 else f"{v:,.0f}"))
axes[0].set_title(f"보증금: {(monthly['deposit'] > F['max_deposit']).mean():.0%} 제외", loc="left", fontsize=11.5, fontweight="bold")
axes[0].set_ylabel("월세 거래 중 비율 (%)")

cut_hist(axes[1], monthly["rent"].clip(upper=199), np.arange(0, 205, 5), lambda x: x <= F["max_rent"],
         "월세 (만 원, 200 이상은 맨 끝 칸)", [(F["max_rent"], "100만")])
axes[1].set_title(f"월세: {(monthly['rent'] > F['max_rent']).mean():.0%} 제외", loc="left", fontsize=11.5, fontweight="bold")

cut_hist(axes[2], monthly["area"].clip(upper=79), np.arange(0, 82, 2), lambda x: F["min_area"] <= x <= F["max_area"],
         "면적 (㎡, 80 이상은 맨 끝 칸)", [(F["min_area"], "14㎡\n최저주거기준"), (F["max_area"], "40㎡")])
out_area = ((monthly["area"] < F["min_area"]) | (monthly["area"] > F["max_area"])).mean()
axes[2].set_title(f"면적: {out_area:.0%} 제외", loc="left", fontsize=11.5, fontweight="bold")
title(fig, "기준선은 어디에 있나 (파랑 = 남기는 범위, 회색 = 제외)")
footer(fig, SOURCE + " · 월세 거래 전체 기준(각 기준을 따로 적용) · 면적: 단독/다가구 계약면적, 연립/다세대 전용면적")
fig.tight_layout(rect=(0, 0.04, 1, 0.94))
fig.savefig(OUT / "02-thresholds.png", dpi=160)
plt.close(fig)

# ── 03. 월세 vs 환산 월세 (학교 근처 동, 확정 기준 통과 거래) ──
fig, ax = plt.subplots(figsize=(11, 4.8))
bins = np.arange(0, 112.5, 2.5)
for vals, color, label in ((dn["rent"], MUTED, "월세만"), (dn["conv"], C1, "환산 월세 (월세 + 보증금 × 3.5% ÷ 12)")):
    ax.hist(vals, bins=bins, weights=np.full(len(vals), 100 / len(vals)), histtype="step", linewidth=2, color=color, label=label)
top = ax.get_ylim()[1]
ax.set_ylim(0, top * 1.35)
for i, (vals, name, line_color) in enumerate(((dn["rent"], "월세", MUTED), (dn["conv"], "환산 월세", C1))):
    m = vals.median()
    ax.axvline(m, color=line_color, linewidth=1.4, linestyle=(0, (3, 3)))
    # 월세 중앙값은 선 왼쪽, 환산 월세 중앙값은 선 오른쪽에 (서로·선과 겹치지 않게)
    ax.text(m + (1 if i else -1), top * 1.12, f"{name} 중앙값 {m:.1f}", ha="left" if i else "right", va="bottom", fontsize=9.5, color=TEXT)
low = dn[dn["rent"] <= 20]
ax.text(1, top * 1.3, f"월세 20만 원 이하 {len(low):,}건\n→ 환산하면 중앙값 {low['conv'].median():.1f}만 원\n(보증금을 크게 건 반전세)",
        fontsize=9, color=TEXT2, va="top")
ax.set_xlabel("만 원/월")
ax.set_ylabel("거래 비율 (%)")
ax.set_yticks([v for v in ax.get_yticks() if v <= top])
ax.grid(axis="x", visible=False)
ax.legend(frameon=False, loc="upper right")
title(fig, "월세만 보면 반전세가 시세를 끌어내림 → 보증금까지 포함한 환산 월세로 비교")
footer(fig, SOURCE + f" · 학교 근처 동 {len(near_keys)}곳 · 확정 기준 통과 {len(dn):,}건")
fig.tight_layout(rect=(0, 0.04, 1, 0.94))
fig.savefig(OUT / "03-converted-rent.png", dpi=160)
plt.close(fig)

# ── 04. 학교별 유형 비중과 유형별 시세 ──
fig, (ax_l, ax_r) = plt.subplots(1, 2, figsize=(13, 4.8), sharey=True)
schools = list(SCHOOLS)[::-1]
y = np.arange(len(schools))
share_sh, med_sh, med_rh, n_tot = [], [], [], []
for s in schools:
    keys = {(r.gu, r.dong) for r in near[near.school == s].itertuples()}
    d = df[[(a, b) in keys for a, b in zip(df.gu, df.dongBase)]]
    share_sh.append((d.type == "sh").mean() * 100)
    med_sh.append(d[d.type == "sh"].conv.median())
    med_rh.append(d[d.type == "rh"].conv.median())
    n_tot.append(len(d))
share_sh = np.array(share_sh)
ax_l.barh(y, share_sh, color=C1, height=0.6, label="단독/다가구")
ax_l.barh(y, 100 - share_sh, left=share_sh, color=C2, height=0.6, label="연립/다세대", edgecolor=SURFACE, linewidth=2)
for yi, v, n in zip(y, share_sh, n_tot):
    ax_l.text(v / 2, yi, f"{v:.0f}%", ha="center", va="center", color="white", fontsize=9, fontweight="bold")
    ax_l.text(101.5, yi, f"{n:,}건", va="center", fontsize=8.5, color=TEXT2)
ax_l.set_xlim(0, 114)
ax_l.set_yticks(y, schools)
ax_l.set_xlabel("거래 비중 (%)")
ax_l.set_title("학교 근처 거래의 유형 비중", loc="left", fontsize=11.5, fontweight="bold")
ax_l.grid(axis="y", visible=False)
ax_l.tick_params(axis="y", length=0)
for yi, a, b in zip(y, med_sh, med_rh):
    ax_r.plot([a, b], [yi, yi], color=GRID, linewidth=3, zorder=1)
    ax_r.scatter([a], [yi], s=70, color=C1, zorder=3, edgecolors=SURFACE, linewidths=2)
    ax_r.scatter([b], [yi], s=70, color=C2, zorder=3, edgecolors=SURFACE, linewidths=2)
    ax_r.text(a, yi + 0.25, f"{a:.1f}", ha="center", va="bottom", fontsize=8.5)
    ax_r.text(b, yi + 0.25, f"{b:.1f}", ha="center", va="bottom", fontsize=8.5)
ax_r.set_xlim(40, 80)
ax_r.set_xlabel("환산 월세 중앙값 (만 원/월)")
ax_r.set_title("유형별 환산 월세 중앙값", loc="left", fontsize=11.5, fontweight="bold")
ax_r.grid(axis="y", visible=False)
ax_r.tick_params(axis="y", length=0)
handles, labels = ax_l.get_legend_handles_labels()
fig.legend(handles, labels, frameon=False, loc="upper right", ncol=2, bbox_to_anchor=(0.99, 0.95))
title(fig, "학교 근처는 단독/다가구가 대부분 · 연립/다세대는 더 비싼 신축 원룸 → 두 유형을 합쳐 시세로")
footer(fig, SOURCE + " · 확정 기준 통과 거래 · 학교별 가까운 동 5곳")
fig.tight_layout(rect=(0, 0.04, 1, 0.88))
fig.savefig(OUT / "04-type-mix.png", dpi=160)
plt.close(fig)

# ── 05. 학교별 가까운 동 환산 월세 (결과) ──
fig, axes = plt.subplots(2, 3, figsize=(13, 6.6), sharex=True)
for ax, school in zip(axes.flat, SCHOOLS):
    sub = near[near.school == school].sort_values("km", ascending=False)  # 가까운 동이 위
    y = np.arange(len(sub))
    ax.hlines(y, sub.p25, sub.p75, color=C1, linewidth=6, alpha=0.28, capstyle="round")
    ax.scatter(sub["median"], y, s=46, color=C1, zorder=3, edgecolors=SURFACE, linewidths=2)
    for yi, r in zip(y, sub.itertuples()):
        ax.text(r.median, yi + 0.32, f"{r.median:g}", ha="center", va="bottom", fontsize=8.5)
    ax.set_yticks(y, [f"{r.dong}  {r.km:.1f}km · {r.count:,}건" for r in sub.itertuples()])
    ax.set_title(school, loc="left", fontsize=11.5, fontweight="bold")
    ax.set_xlim(20, 90)
    ax.set_ylim(-0.6, len(sub) - 0.1)  # 맨 윗줄 숫자가 학교 이름과 겹치지 않게 위쪽 여백
    ax.grid(axis="y", visible=False)
    ax.tick_params(axis="y", length=0)
for ax in axes[-1]:
    ax.set_xlabel("환산 월세 (만 원/월)")
title(fig, "결과: 학교에서 가까운 동 5곳의 환산 월세 (점 = 중앙값, 막대 = 하위 25%~상위 25%)")
footer(fig, SOURCE + f" · 확정 기준 통과 거래 · 1년 {MIN_COUNT}건 이상인 동만 · 거리는 동 중심까지 직선")
fig.tight_layout(rect=(0, 0.04, 1, 0.95))
fig.savefig(OUT / "05-school-result.png", dpi=160)
plt.close(fig)

# ── 콘솔 요약 ──
print(f"기간 {period} · 서울 {total:,}건 → 확정 기준 통과 {funnel[-1][1]:,}건")
for name, c in funnel:
    print(f"  {name:<22} {c:>8,}건")
print(f"학교 근처 동 {len(near_keys)}곳 · 거래 {len(dn):,}건 · 월세 중앙값 {dn['rent'].median():g} → 환산 {dn['conv'].median():.1f}")
print("저장: data/analysis/01~05 *.png, summary.csv, data/school-dongs.json")
