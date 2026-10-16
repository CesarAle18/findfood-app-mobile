import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";

import { api } from "@/api";
import { resetApiMock, type ApiMock } from "@/test-utils/api";
import { catalogosFixture } from "@/test-utils/fixtures";
import { createTestQueryClient } from "@/test-utils/query";

import {
  MotivoField,
  motivoBody,
  validateMotivo,
  type MotivoSelection,
} from "./motivo-field";

jest.mock("@/api", () => ({
  api: jest.requireActual<typeof import("@/test-utils/api")>("@/test-utils/api").createApiMock(),
}));

const mockedApi = api as unknown as ApiMock;
const rechazo = catalogosFixture.motivos.filter((m) => m.ambito === "RECHAZO_ASIGNACION");

beforeEach(() => {
  resetApiMock(mockedApi);
});

describe("validateMotivo", () => {
  it("asks for a reason when none is chosen", () => {
    expect(validateMotivo({ comentario: "" }, rechazo)).toBe("Selecciona un motivo.");
  });

  it("refuses a reason outside the scope", () => {
    expect(validateMotivo({ motivoId: 43, comentario: "" }, rechazo)).toBe(
      "Selecciona un motivo.",
    );
  });

  it("asks for a comment when the reason requires one", () => {
    expect(validateMotivo({ motivoId: 42, comentario: "   " }, rechazo)).toBe(
      "Escribe un comentario para este motivo.",
    );
    expect(validateMotivo({ motivoId: 42, comentario: "Llueve mucho" }, rechazo)).toBeNull();
  });

  it("accepts a reason without a comment when none is required", () => {
    expect(validateMotivo({ motivoId: 41, comentario: "" }, rechazo)).toBeNull();
  });
});

describe("motivoBody", () => {
  it("sends the comment trimmed as `observacion`, only when written", () => {
    expect(motivoBody({ motivoId: 42, comentario: "  Llueve  " })).toEqual({
      motivo_id: 42,
      observacion: "Llueve",
    });
    expect(motivoBody({ motivoId: 41, comentario: " " })).toEqual({ motivo_id: 41 });
  });
});

describe("MotivoField", () => {
  function Harness() {
    const [value, setValue] = useState<MotivoSelection>({ comentario: "" });
    return <MotivoField ambito="RECHAZO_ASIGNACION" value={value} onChange={setValue} />;
  }

  async function renderField() {
    mockedApi.get.mockResolvedValue(catalogosFixture);
    const client = createTestQueryClient();
    await render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );
  }

  it("lists only the reasons of its scope", async () => {
    await renderField();
    await fireEvent.press(await screen.findByLabelText("Motivo *: Selecciona"));

    expect(screen.getByText("Queda muy lejos")).toBeTruthy();
    expect(screen.getByText("Otro")).toBeTruthy();
    expect(screen.queryByText("Ya no está disponible")).toBeNull();
  });

  it("shows a required comment only for reasons that need one", async () => {
    await renderField();
    await fireEvent.press(await screen.findByLabelText("Motivo *: Selecciona"));
    await fireEvent.press(screen.getByText("Queda muy lejos"));
    expect(screen.queryByLabelText("Comentario *")).toBeNull();

    await fireEvent.press(screen.getByLabelText("Motivo *: Queda muy lejos"));
    await fireEvent.press(screen.getByText("Otro"));
    expect(screen.getByLabelText("Comentario *")).toBeTruthy();
  });
});
