"use client";

import type { ChartSpec } from "@/lib/content/types";
import { ChartView } from "../ChartView";

const SAMPLES: ChartSpec[] = [
  {
    kind: "bar",
    title: "Počet přihlášených a přijatých studentů",
    xLabel: "obor",
    yLabel: "počet osob",
    yStep: 5,
    categories: ["informatika", "právo", "medicína", "ekonomie", "pedagogika"],
    series: [
      { name: "přihlášení", values: [45, 60, 70, 35, 25] },
      { name: "přijatí", values: [20, 15, 10, 25, 20] },
    ],
  },
  {
    kind: "line",
    title: "Průměrná měsíční teplota",
    xLabel: "měsíc",
    yLabel: "teplota",
    unit: "°C",
    yStep: 2,
    categories: ["led", "úno", "bře", "dub", "kvě", "čer"],
    series: [
      { name: "Praha", values: [0, 2, 6, 10, 14, 18] },
      { name: "Brno", values: [2, 2, 8, 12, 16, 20] },
    ],
  },
  {
    kind: "stacked",
    title: "Prodej podle kanálu",
    yLabel: "tis. kusů",
    yStep: 10,
    categories: ["2021", "2022", "2023", "2024"],
    series: [
      { name: "e-shop", values: [20, 30, 40, 50] },
      { name: "prodejna", values: [40, 30, 30, 20] },
      { name: "velkoobchod", values: [10, 10, 20, 20] },
    ],
  },
  {
    kind: "pie",
    title: "Výdaje domácnosti",
    unit: "%",
    categories: ["bydlení", "jídlo", "doprava", "volný čas", "ostatní"],
    series: [{ name: "podíl", values: [35, 25, 15, 15, 10] }],
  },
];

export function ChartSamples() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      {SAMPLES.map((c) => (
        <div key={c.kind} className="rounded-3xl border-2 border-border bg-surface p-4">
          <ChartView chart={c} />
        </div>
      ))}
    </main>
  );
}
