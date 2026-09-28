import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { StoryWrapper } from "@/test/StoryWrapper";

import type { ReportCatalog, ReportSpec } from "../types";
import { ReportBuilderPanel } from "./ReportBuilderPanel";

const catalog: ReportCatalog = [
  {
    key: "deals",
    label: "Deals",
    default_date_field: "created_at",
    fields: [
      {
        key: "created_at",
        label: "Created",
        role: "dimension",
        data_type: "date",
        aggregate: null,
        filterable: true,
        label_source: null,
      },
      {
        key: "amount",
        label: "Amount",
        role: "metric",
        data_type: "money",
        aggregate: "sum",
        filterable: false,
        label_source: null,
      },
    ],
  },
];

const specWith = (from: string, to: string): ReportSpec => ({
  dataset: "deals",
  metrics: ["amount"],
  dimensions: [],
  filters: [],
  period: { field: "created_at", preset: "custom", from, to },
  visualisation: "table",
});

const renderPanel = (spec: ReportSpec) =>
  render(
    <StoryWrapper>
      <ReportBuilderPanel catalog={catalog} spec={spec} onChange={() => {}} />
    </StoryWrapper>,
  );

describe("ReportBuilderPanel custom period", () => {
  it("says that a reversed range is not being applied", async () => {
    const screen = await renderPanel(specWith("2026-09-01", "2026-01-01"));

    await expect
      .element(
        screen.getByText("The start date must be on or before the end date."),
      )
      .toBeVisible();
  });

  it("stays quiet for a valid range", async () => {
    const screen = await renderPanel(specWith("2026-01-01", "2026-09-01"));

    await expect.element(screen.getByLabelText("From")).toBeVisible();
    await expect
      .element(
        screen.getByText("The start date must be on or before the end date."),
      )
      .not.toBeInTheDocument();
  });
});
