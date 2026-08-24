import { describe, expect, test } from "vitest";

import {
  activeMentionQuery,
  applyMention,
  formatMention,
  mentionedSalesIds,
  parseMentions,
  toCommentSegments,
  toPlainText,
} from "./taskMentions";

describe("formatMention", () => {
  test("writes the token the database parses", () => {
    expect(formatMention("sales", 12, "Laura Méndez")).toBe(
      "@[Laura Méndez](sales:12)",
    );
  });

  test("strips brackets from the label so the token stays parseable", () => {
    expect(formatMention("sales", 7, "Ana [Ventas]")).toBe(
      "@[Ana Ventas](sales:7)",
    );
  });
});

describe("parseMentions", () => {
  test("returns every mention with its subject and id", () => {
    // Arrange
    const body = "@[Laura](sales:12) y @[Soporte](team:3), miradlo";

    // Act
    const mentions = parseMentions(body);

    // Assert
    expect(mentions).toEqual([
      { label: "Laura", subject: "sales", id: 12 },
      { label: "Soporte", subject: "team", id: 3 },
    ]);
  });

  test("returns an empty list when the body mentions nobody", () => {
    expect(parseMentions("Llamé al cliente, sin respuesta.")).toEqual([]);
  });

  test("ignores an @name that was never resolved into a token", () => {
    expect(parseMentions("hola @laura, ¿lo miras?")).toEqual([]);
  });

  test("does not treat an email address as a mention", () => {
    expect(parseMentions("escribe a ana@example.com")).toEqual([]);
  });
});

describe("mentionedSalesIds", () => {
  test("keeps only people, and only once each", () => {
    // Arrange
    const body = "@[Laura](sales:12) @[Soporte](team:3) @[Laura](sales:12)";

    // Act & Assert
    expect(mentionedSalesIds(body)).toEqual([12]);
  });
});

describe("toCommentSegments", () => {
  test("splits a body into text runs and mentions", () => {
    // Arrange
    const body = "Hola @[Laura](sales:12), ¿lo revisas?";

    // Act
    const segments = toCommentSegments(body);

    // Assert
    expect(segments).toEqual([
      { type: "text", value: "Hola " },
      { type: "mention", value: "Laura", subject: "sales", id: 12 },
      { type: "text", value: ", ¿lo revisas?" },
    ]);
  });

  test("handles a body that is nothing but a mention", () => {
    expect(toCommentSegments("@[Laura](sales:12)")).toEqual([
      { type: "mention", value: "Laura", subject: "sales", id: 12 },
    ]);
  });

  test("returns the whole body as one run when there is no mention", () => {
    expect(toCommentSegments("sin menciones")).toEqual([
      { type: "text", value: "sin menciones" },
    ]);
  });
});

describe("toPlainText", () => {
  test("never leaks the raw token to a reader", () => {
    // Arrange
    const body = "Hola @[Laura Méndez](sales:12), ¿lo revisas?";

    // Act
    const text = toPlainText(body);

    // Assert
    expect(text).toBe("Hola @Laura Méndez, ¿lo revisas?");
    expect(text).not.toContain("sales:12");
  });
});

describe("activeMentionQuery", () => {
  test("detects the fragment the caret is sitting in", () => {
    // Arrange
    const body = "hola @lau";

    // Act
    const query = activeMentionQuery(body, body.length);

    // Assert
    expect(query).toEqual({ query: "lau", start: 5 });
  });

  test("matches a bare @ so the picker opens as soon as it is typed", () => {
    expect(activeMentionQuery("@", 1)).toEqual({ query: "", start: 0 });
  });

  test("does not fire inside an email address", () => {
    const body = "escribe a ana@exa";
    expect(activeMentionQuery(body, body.length)).toBeNull();
  });

  test("closes once the fragment runs past a space", () => {
    const body = "hola @lau ya está";
    expect(activeMentionQuery(body, body.length)).toBeNull();
  });

  test("closes on a mention that is already complete", () => {
    const body = "@[Laura](sales:12)";
    expect(activeMentionQuery(body, body.length)).toBeNull();
  });

  test("uses the caret, not the end of the body", () => {
    // Arrange: caret sits right after "@la", with more text behind it.
    const body = "hola @la y luego más texto";

    // Act
    const query = activeMentionQuery(body, 8);

    // Assert
    expect(query).toEqual({ query: "la", start: 5 });
  });
});

describe("applyMention", () => {
  test("replaces the fragment under the caret with a finished token", () => {
    // Arrange
    const body = "hola @lau";
    const query = activeMentionQuery(body, body.length)!;

    // Act
    const result = applyMention(
      body,
      query,
      body.length,
      "sales",
      12,
      "Laura Méndez",
    );

    // Assert
    expect(result.body).toBe("hola @[Laura Méndez](sales:12) ");
    expect(result.caret).toBe(result.body.length);
  });

  test("keeps the text that followed the caret", () => {
    // Arrange
    const body = "hola @lau, gracias";
    const query = activeMentionQuery(body, 9)!;

    // Act
    const result = applyMention(body, query, 9, "sales", 12, "Laura");

    // Assert
    expect(result.body).toBe("hola @[Laura](sales:12) , gracias");
  });

  test("produces a token the parser round-trips", () => {
    // Arrange
    const body = "@an";
    const query = activeMentionQuery(body, body.length)!;

    // Act
    const result = applyMention(body, query, body.length, "sales", 5, "Ana");

    // Assert
    expect(mentionedSalesIds(result.body)).toEqual([5]);
  });
});
