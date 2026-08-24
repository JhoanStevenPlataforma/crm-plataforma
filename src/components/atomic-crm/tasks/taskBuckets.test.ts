import { describe, expect, test } from "vitest";

import {
  buildBucketFilter,
  buildRecentlyDoneFilter,
  hasThisWeekBucket,
  OPEN_TASK_FILTER,
  RECENTLY_DONE_WINDOW_MS,
  TASK_BUCKET_KEYS,
} from "./taskBuckets";

describe("buildBucketFilter", () => {
  // Tuesday 4 August 2026, mid-afternoon.
  const now = new Date("2026-08-04T15:42:11.000Z");

  test("every bucket excludes completed, cancelled and deleted tasks", () => {
    for (const bucket of TASK_BUCKET_KEYS) {
      const filter = buildBucketFilter(bucket, now);

      expect(filter).toMatchObject(OPEN_TASK_FILTER);
    }
  });

  test("overdue asks for tasks due strictly before today", () => {
    const filter = buildBucketFilter("overdue", now);

    expect(filter["due_date@lt"]).toBe(
      new Date("2026-08-04T00:00:00.000").toISOString(),
    );
    expect(filter["due_date@gte"]).toBeUndefined();
  });

  test("today is a half-open range covering exactly one day", () => {
    const filter = buildBucketFilter("today", now);

    const from = new Date(filter["due_date@gte"] as string);
    const to = new Date(filter["due_date@lt"] as string);

    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(from.getDate()).toBe(4);
  });

  test("tomorrow starts where today ends — no overlap, no gap", () => {
    const today = buildBucketFilter("today", now);
    const tomorrow = buildBucketFilter("tomorrow", now);

    expect(tomorrow["due_date@gte"]).toBe(today["due_date@lt"]);
  });

  test("this_week starts the day after tomorrow and ends with the week", () => {
    const filter = buildBucketFilter("this_week", now);

    expect(new Date(filter["due_date@gte"] as string).getDate()).toBe(6);
    // Week starts on Sunday, so it ends on Saturday the 8th.
    expect(new Date(filter["due_date@lte"] as string).getDate()).toBe(8);
  });

  test("later starts strictly after the end of the week", () => {
    const thisWeek = buildBucketFilter("this_week", now);
    const later = buildBucketFilter("later", now);

    expect(later["due_date@gt"]).toBe(thisWeek["due_date@lte"]);
  });

  test("no_due_date isolates tasks that would otherwise be invisible", () => {
    const filter = buildBucketFilter("no_due_date", now);

    expect(filter["due_date@is"]).toBeNull();
  });

  test("the buckets partition the timeline without overlapping", () => {
    const overdue = buildBucketFilter("overdue", now);
    const today = buildBucketFilter("today", now);

    // overdue ends exactly where today begins
    expect(overdue["due_date@lt"]).toBe(today["due_date@gte"]);
  });
});

describe("buildRecentlyDoneFilter", () => {
  const now = new Date("2026-08-04T15:42:11.000Z");

  test("asks for tasks completed inside the grace window", () => {
    const filter = buildRecentlyDoneFilter(now);

    const from = new Date(filter["completed_at@gte"] as string);
    expect(now.getTime() - from.getTime()).toBe(RECENTLY_DONE_WINDOW_MS);
  });

  test("keeps the five-minute window the original list used", () => {
    expect(RECENTLY_DONE_WINDOW_MS).toBe(5 * 60 * 1000);
  });

  test("still excludes soft-deleted tasks", () => {
    expect(buildRecentlyDoneFilter(now)["deleted_at@is"]).toBeNull();
  });
});

describe("hasThisWeekBucket", () => {
  test("is true early in the week", () => {
    // Tuesday
    expect(hasThisWeekBucket(new Date("2026-08-04T10:00:00.000Z"))).toBe(true);
  });

  test("is false from Friday on, when the bucket is empty by construction", () => {
    // Friday 7 August 2026: the day after tomorrow is Sunday the 9th, past the
    // Saturday end of week.
    expect(hasThisWeekBucket(new Date("2026-08-07T10:00:00.000Z"))).toBe(false);
  });
});
