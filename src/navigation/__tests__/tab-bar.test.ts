import { unreadBadge } from "../tab-bar";

describe("unreadBadge", () => {
  it.each([undefined, 0, -1])("hides the badge for %s unread", (count) => {
    expect(unreadBadge(count)).toBeUndefined();
  });

  it.each<[number, string]>([
    [1, "1"],
    [42, "42"],
    [99, "99"],
    [100, "99+"],
    [1500, "99+"],
  ])("shows %i unread as %s", (count, label) => {
    expect(unreadBadge(count)).toBe(label);
  });
});
