import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActiveSessionChat } from "./ActiveSessionChat";

describe("ActiveSessionChat", () => {
  it("renders the same session chat frame and messages for every module", () => {
    const html = renderToStaticMarkup(<ActiveSessionChat messages={[{ id: "m1", sessionId: "S1", sender: "หัวหน้า", text: "รับรถแล้ว", createdAt: "2026-08-27T10:00:00.000Z" }]} draft="" canSend onDraftChange={vi.fn()} onSend={vi.fn()} />);
    expect(html).toContain("สื่อสารระหว่างงาน");
    expect(html).toContain("หัวหน้า");
    expect(html).toContain("รับรถแล้ว");
    expect(html).toContain("พิมพ์ข้อความใน Session นี้");
  });

  it("renders read-only state when the viewer cannot send", () => {
    const html = renderToStaticMarkup(<ActiveSessionChat messages={[]} draft="" canSend={false} onDraftChange={vi.fn()} onSend={vi.fn()} />);
    expect(html).toContain("ดูข้อความได้อย่างเดียว");
    expect(html).toContain("disabled");
  });
});
