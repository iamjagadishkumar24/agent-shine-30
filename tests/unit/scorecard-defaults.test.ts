import { describe, it, expect } from "vitest";
import {
  QUALITY_PARAMETERS,
  QUALITY_PARAMETER_WEIGHTS,
  computeOverallScore,
} from "@/lib/brand";
import { computeOverall, computeEarnedPoints } from "@/lib/scorecard";

const EXPECTED = [
  { name: "Accuracy", max_points: 20 },
  { name: "Understanding Customer Issues", max_points: 25 },
  { name: "Customer Satisfaction", max_points: 5 },
  { name: "Product Knowledge & Resolution", max_points: 20 },
  { name: "Average Handling Time", max_points: 10 },
  { name: "Compliance", max_points: 10 },
  { name: "Technical Accuracy / IHD", max_points: 10 },
] as const;

describe("default active scorecard", () => {
  it("declares exactly seven canonical parameters in order", () => {
    expect(QUALITY_PARAMETERS).toHaveLength(7);
    expect([...QUALITY_PARAMETERS]).toEqual(EXPECTED.map((p) => p.name));
  });

  it("maps every parameter to its expected weight", () => {
    for (const { name, max_points } of EXPECTED) {
      expect(QUALITY_PARAMETER_WEIGHTS[name]).toBe(max_points);
    }
  });

  it("weights total exactly 100", () => {
    const total = EXPECTED.reduce((s, p) => s + p.max_points, 0);
    const declared = Object.values(QUALITY_PARAMETER_WEIGHTS).reduce(
      (s, w) => s + w,
      0,
    );
    expect(total).toBe(100);
    expect(declared).toBe(100);
  });

  it("has no unexpected or missing weight keys", () => {
    expect(Object.keys(QUALITY_PARAMETER_WEIGHTS).sort()).toEqual(
      EXPECTED.map((p) => p.name).sort(),
    );
  });
});

describe("weighted score calculation", () => {
  it("all parameters at 100 => 100", () => {
    const scores = EXPECTED.map(() => 100);
    expect(computeOverallScore(scores)).toBeCloseTo(100, 6);
  });

  it("all parameters at 0 => 0", () => {
    const scores = EXPECTED.map(() => 0);
    expect(computeOverallScore(scores)).toBe(0);
  });

  it("all parameters at 80 => 80", () => {
    const scores = EXPECTED.map(() => 80);
    expect(computeOverallScore(scores)).toBeCloseTo(80, 6);
  });

  it("weights the higher-max parameters more than the lower-max ones", () => {
    // Only "Understanding Customer Issues" (weight 25) scored 100, rest 0.
    const scoresA = EXPECTED.map((p) =>
      p.name === "Understanding Customer Issues" ? 100 : 0,
    );
    // Only "Customer Satisfaction" (weight 5) scored 100, rest 0.
    const scoresB = EXPECTED.map((p) =>
      p.name === "Customer Satisfaction" ? 100 : 0,
    );
    expect(computeOverallScore(scoresA)).toBeCloseTo(25, 6);
    expect(computeOverallScore(scoresB)).toBeCloseTo(5, 6);
  });

  it("mixed scores match the hand-computed weighted percentage", () => {
    // Scores per parameter (in canonical order):
    //   100, 80, 60, 90, 70, 100, 50
    // Weighted earned = 20*1.0 + 25*0.8 + 5*0.6 + 20*0.9 + 10*0.7 + 10*1.0 + 10*0.5
    //                 = 20 + 20 + 3 + 18 + 7 + 10 + 5 = 83
    const scores = [100, 80, 60, 90, 70, 100, 50];
    expect(computeOverallScore(scores)).toBeCloseTo(83, 6);
  });
});

describe("scorecard row helpers agree with weighted overall", () => {
  it("computeOverall over the 7 rows matches computeOverallScore", () => {
    // Selected percentages per parameter (canonical order).
    const percentages = [90, 80, 100, 70, 60, 100, 40];
    const rows = EXPECTED.map((p, i) => ({
      parameter_name: p.name,
      max_points: p.max_points,
      selected_percentage: percentages[i],
    }));

    const overall = computeOverall(rows);
    expect(overall.max).toBe(100);

    // Manually expected earned points:
    // 20*0.9 + 25*0.8 + 5*1.0 + 20*0.7 + 10*0.6 + 10*1.0 + 10*0.4
    // = 18 + 20 + 5 + 14 + 6 + 10 + 4 = 77
    expect(overall.earned).toBeCloseTo(77, 2);
    expect(overall.percentage).toBeCloseTo(77, 2);
    expect(computeOverallScore(percentages)).toBeCloseTo(77, 6);
  });

  it("computeEarnedPoints clamps percentages into [0, 100]", () => {
    expect(computeEarnedPoints(20, 150)).toBe(20);
    expect(computeEarnedPoints(20, -10)).toBe(0);
    expect(computeEarnedPoints(25, 80)).toBe(20);
  });
});
