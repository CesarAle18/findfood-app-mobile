import { ApiError, FORM_ERROR_KEY, isApiError, parseProblem } from "./errors";

describe("parseProblem", () => {
  it("maps a problem+json body, keeping unknown members as extensions", () => {
    const error = parseProblem(422, {
      type: "ventana-invalida",
      title: "La ventana de recogida es inválida",
      status: 422,
      detail: "La hora de fin debe ser posterior a la de inicio",
      instance: "/v1/donaciones",
      donacion_id: "d-1",
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "ApiError",
      type: "ventana-invalida",
      status: 422,
      title: "La ventana de recogida es inválida",
      detail: "La hora de fin debe ser posterior a la de inicio",
      instance: "/v1/donaciones",
      fields: {},
      extensions: { donacion_id: "d-1" },
    });
    expect(error.message).toContain("La ventana de recogida es inválida");
  });

  it("uses the HTTP status even when the body disagrees", () => {
    expect(parseProblem(409, { type: "conflicto", title: "x", status: 400 }).status).toBe(
      409,
    );
  });

  it("maps validation messages to normalized field paths", () => {
    const error = parseProblem(400, {
      type: "validacion",
      title: "Validation failed",
      status: 400,
      errores: [
        "items.0.cantidad must not be less than 0.01",
        "items[1].unidad_medida_id must be a UUID",
        "telefono debe ser un celular colombiano de 10 dígitos",
        "telefono must be a string",
      ],
    });

    expect(error.type).toBe("validacion");
    expect(error.fields).toEqual({
      "items.0.cantidad": ["must not be less than 0.01"],
      "items.1.unidad_medida_id": ["must be a UUID"],
      telefono: [
        "debe ser un celular colombiano de 10 dígitos",
        "must be a string",
      ],
    });
    expect(error.extensions.errores).toHaveLength(4);
  });

  it("puts validation messages without a field path under the form key", () => {
    const error = parseProblem(400, {
      type: "validacion",
      title: "Validation failed",
      status: 400,
      errores: [
        "Debe enviar al menos un producto",
        "property apodo should not exist",
        "items.0.property color should not exist",
        "huérfano",
        42,
      ],
    });

    expect(FORM_ERROR_KEY).toBe("_form");
    expect(error.fields).toEqual({
      [FORM_ERROR_KEY]: [
        "Debe enviar al menos un producto",
        "property apodo should not exist",
        "items.0.property color should not exist",
        "huérfano",
      ],
    });
  });

  it("maps class-validator `each` messages to the array field", () => {
    const error = parseProblem(400, {
      type: "validacion",
      title: "Validation failed",
      status: 400,
      errores: [
        "each value in tipos_alimento_ids must be a UUID",
        "items.1.each value in etiquetas must be a string",
      ],
    });

    expect(error.fields).toEqual({
      tipos_alimento_ids: ["each value must be a UUID"],
      "items.1.etiquetas": ["each value must be a string"],
    });
  });

  it("takes a field path from the start of a business error title", () => {
    const error = parseProblem(422, {
      type: "unidad-invalida",
      title: "items[0].unidad_medida_id no existe o está inactiva",
      status: 422,
    });

    expect(error.fields).toEqual({
      "items.0.unidad_medida_id": ["no existe o está inactiva"],
    });
  });

  it("takes a field path from the start of a business error detail", () => {
    const error = parseProblem(422, {
      type: "no-procesable",
      title: "No se pudo procesar la solicitud",
      status: 422,
      detail: "fecha_vencimiento debe ser posterior a hoy",
    });

    expect(error.fields).toEqual({
      fecha_vencimiento: ["debe ser posterior a hoy"],
    });
  });

  it.each([
    "La ventana de recogida es inválida",
    "ventana inválida para la donación",
    "Items[0].cantidad no es válida",
    "items[0].cantidad",
  ])("does not treat %p as a field path", (title) => {
    expect(parseProblem(422, { type: "x", title, status: 422 }).fields).toEqual({});
  });

  it.each([
    [400, "solicitud-invalida"],
    [401, "no-autenticado"],
    [403, "prohibido"],
    [404, "no-encontrado"],
    [405, "metodo-no-permitido"],
    [409, "conflicto"],
    [413, "carga-demasiado-grande"],
    [422, "no-procesable"],
    [429, "demasiadas-solicitudes"],
    [500, "error-interno"],
    [502, "error-interno"],
    [503, "error-interno"],
    [418, "error"],
  ])("maps a non-problem %i body to the %p slug", (status, type) => {
    const error = parseProblem(status, "<html><body>Bad Gateway</body></html>");

    expect(error).toMatchObject({ type, status, fields: {}, extensions: {} });
    expect(error.title).toEqual(expect.any(String));
    expect(error.title).not.toBe("");
    expect(error.detail).toBeUndefined();
  });

  it.each<[unknown]>([
    [null],
    [undefined],
    [""],
    [{ message: "boom" }],
    [["x"]],
    [{ type: "" }],
    [{ type: 7 }],
  ])("falls back to the generic slug for %p", (body) => {
    expect(parseProblem(404, body).type).toBe("no-encontrado");
  });

  it("treats about:blank as the generic slug for the status", () => {
    const error = parseProblem(403, {
      type: "about:blank",
      title: "Forbidden",
      status: 403,
    });

    expect(error.type).toBe("prohibido");
    expect(error.title).toBe("Forbidden");
  });

  it("falls back to a generic title when the problem has none", () => {
    expect(parseProblem(429, { type: "demasiadas-solicitudes" }).title).not.toBe("");
  });
});

describe("ApiError factories", () => {
  it("builds a client-side network error that keeps its cause", () => {
    const cause = new TypeError("Network request failed");
    const error = ApiError.network(cause);

    expect(error).toMatchObject({
      type: "sin-conexion",
      status: 0,
      fields: {},
      extensions: {},
    });
    expect(error.cause).toBe(cause);
  });

  it("builds a client-side timeout error", () => {
    expect(ApiError.timeout()).toMatchObject({ type: "tiempo-agotado", status: 0 });
  });
});

describe("isApiError", () => {
  it("recognizes ApiError instances only", () => {
    expect(isApiError(ApiError.timeout())).toBe(true);
    expect(isApiError(parseProblem(500, null))).toBe(true);
    expect(isApiError(new Error("x"))).toBe(false);
    expect(isApiError({ type: "x", status: 400, title: "x" })).toBe(false);
    expect(isApiError(null)).toBe(false);
  });
});
