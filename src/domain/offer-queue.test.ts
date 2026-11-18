import { ofertaAceptadaFixture, ofertaFixture } from "@/test-utils/fixtures";

import { pendingOffers } from "./offer-queue";

/** Five minutes after the fixture offer was made; it lapses at 20:10Z. */
const NOW = Date.parse("2026-10-13T20:05:00Z");
const NONE = new Set<string>();

describe("pendingOffers", () => {
  it("is empty without offers", () => {
    expect(pendingOffers([], NONE, NOW)).toEqual({ current: null, remaining: 0 });
  });

  it("shows a live offer with what the alert needs beyond the offer view", () => {
    const { current, remaining } = pendingOffers([ofertaFixture()], NONE, NOW);

    expect(remaining).toBe(0);
    expect(current).toMatchObject({
      id: "asg-7",
      code: "DON-1048",
      distance: "2,8 km",
      expiresAtIso: "2026-10-13T20:10:00Z",
      offeredAtIso: "2026-10-13T20:00:00Z",
      street: "Calle 5 # 38-25, Cali",
      reference: "Muelle de carga",
      refrigerated: true,
    });
  });

  it("leaves out accepted assignments", () => {
    expect(pendingOffers([ofertaAceptadaFixture()], NONE, NOW).current).toBeNull();
  });

  it("leaves out offers whose deadline already passed", () => {
    const lapsed = ofertaFixture({ expira_at: "2026-10-13T20:05:00Z" });
    expect(pendingOffers([lapsed], NONE, NOW).current).toBeNull();
  });

  it("leaves out an unreadable deadline instead of throwing", () => {
    const broken = ofertaFixture({ expira_at: "mañana" });
    expect(pendingOffers([broken], NONE, NOW)).toEqual({ current: null, remaining: 0 });
  });

  it("leaves out the offers the volunteer set aside", () => {
    const later = ofertaFixture({ id: "asg-9", expira_at: "2026-10-13T20:20:00Z" });
    const { current, remaining } = pendingOffers([ofertaFixture(), later], new Set(["asg-7"]), NOW);

    expect(current?.id).toBe("asg-9");
    expect(remaining).toBe(0);
  });

  it("shows the offer closest to lapsing first and counts the rest", () => {
    const ofertas = [
      ofertaFixture({ id: "asg-late", expira_at: "2026-10-13T20:30:00Z" }),
      ofertaFixture({ id: "asg-soon", expira_at: "2026-10-13T20:08:00Z" }),
      ofertaFixture({ id: "asg-mid", expira_at: "2026-10-13T20:15:00Z" }),
    ];

    const { current, remaining } = pendingOffers(ofertas, NONE, NOW);

    expect(current?.id).toBe("asg-soon");
    expect(remaining).toBe(2);
  });

  it("counts a repeated offer once", () => {
    const { current, remaining } = pendingOffers([ofertaFixture(), ofertaFixture()], NONE, NOW);

    expect(current?.id).toBe("asg-7");
    expect(remaining).toBe(0);
  });

  it("breaks a deadline tie by id, so the shown offer does not flip between refetches", () => {
    const a = ofertaFixture({ id: "asg-a" });
    const b = ofertaFixture({ id: "asg-b" });

    expect(pendingOffers([b, a], NONE, NOW).current?.id).toBe("asg-a");
    expect(pendingOffers([a, b], NONE, NOW).current?.id).toBe("asg-a");
  });

  it("has no pickup reference when the donor left it blank", () => {
    const { current } = pendingOffers([ofertaFixture({ referencia_recogida: "  " })], NONE, NOW);
    expect(current?.reference).toBeNull();
  });
});
