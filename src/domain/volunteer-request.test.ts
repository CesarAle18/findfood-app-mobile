import {
  initialVolunteerRequest,
  latestAdultBirthDate,
  volunteerRequestSchema,
} from "@/domain/volunteer-request";

/** Whether the schema accepts `fecha_nacimiento` as an adult's birth date on `now`. */
function isAccepted(fecha_nacimiento: string, now: number) {
  const result = volunteerRequestSchema(now).safeParse({
    ...initialVolunteerRequest,
    fecha_nacimiento,
  });
  return (
    result.success ||
    !result.error.issues.some((issue) => issue.path[0] === "fecha_nacimiento")
  );
}

describe("latestAdultBirthDate", () => {
  it("is the Bogotá day of 18 years ago", () => {
    // 16/10/2026 08:00 in Bogotá.
    const now = Date.UTC(2026, 9, 16, 13, 0);

    expect(latestAdultBirthDate(now)).toBe("16/10/2008");
    expect(isAccepted("16/10/2008", now)).toBe(true);
    expect(isAccepted("17/10/2008", now)).toBe(false);
  });

  it("uses the Bogotá day, not the UTC one", () => {
    // 17/10/2026 02:00 UTC is still 16/10 in Bogotá.
    expect(latestAdultBirthDate(Date.UTC(2026, 9, 17, 2, 0))).toBe("16/10/2008");
  });

  it("falls back to 28 February when 18 years ago has no 29 February", () => {
    // 29/02/2028 12:00 in Bogotá; 2010 is not a leap year.
    const now = Date.UTC(2028, 1, 29, 17, 0);

    expect(latestAdultBirthDate(now)).toBe("28/02/2010");
    expect(isAccepted("28/02/2010", now)).toBe(true);
    expect(isAccepted("01/03/2010", now)).toBe(false);
  });
});
