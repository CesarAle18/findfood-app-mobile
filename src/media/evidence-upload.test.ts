import { ApiError } from "@/api/errors";
import type { EvidenciaDto, RegistrarEvidenciaBody, SubidaDto } from "@/services/evidencias";

import {
  classifyUploadResponse,
  createPendingEvidence,
  runEvidencePipeline,
  uploadFileOnly,
  type EvidenceDeps,
  type EvidenceTarget,
  type PendingEvidence,
} from "./evidence-upload";

const PARADA_ID = "6f1c2a52-3a1e-4a39-9b1a-6d3c2f2f8d10";

const target: EvidenceTarget = {
  proposito: "EVIDENCIA",
  registro: { tipo: "RECOGIDA", padre: { parada_id: PARADA_ID } },
};

let slot = 0;

function subida(): SubidaDto {
  slot += 1;
  return {
    ruta: `evidencias/user/slot-${slot}.jpg`,
    url_subida: `http://supabase.test/storage/v1/object/upload/sign/evidencias/user/slot-${slot}.jpg?token=t${slot}`,
    token: `t${slot}`,
    expira_en_segundos: 7200,
  };
}

function makeDeps(overrides: Partial<EvidenceDeps> = {}) {
  const deps = {
    compressImage: jest.fn(async () => ({ uri: "file:///cache/compressed.jpg", size: 123_456 })),
    requestUploadUrl: jest.fn(async () => subida()),
    putFile: jest.fn(async () => ({ status: 200, body: '{"Key":"evidencias/x.jpg"}' })),
    register: jest.fn(
      async (body: RegistrarEvidenciaBody) => ({ id: body.id, ruta: body.ruta }) as EvidenciaDto,
    ),
    ...overrides,
  };
  return deps satisfies EvidenceDeps;
}

const captured = (): PendingEvidence =>
  createPendingEvidence({ uri: "file:///picker/photo.heic", width: 4032 });

beforeEach(() => {
  slot = 0;
});

describe("createPendingEvidence", () => {
  it("generates the evidence id once, at capture", () => {
    const newId = jest.fn(() => "id-1");

    const pending = createPendingEvidence({ uri: "file:///a.jpg" }, newId, new Date("2026-10-13T10:00:00Z"));

    expect(newId).toHaveBeenCalledTimes(1);
    expect(pending).toEqual({
      id: "id-1",
      localUri: "file:///a.jpg",
      capturadaAt: "2026-10-13T10:00:00.000Z",
      mime: "image/jpeg",
      stage: "captured",
    });
  });

  it("uses a real UUID by default", () => {
    expect(captured().id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("runEvidencePipeline", () => {
  it("compresses, uploads and registers, reporting every stage", async () => {
    const deps = makeDeps();
    const progress: PendingEvidence["stage"][] = [];
    const start = captured();

    const done = await runEvidencePipeline(start, target, deps, (state) => progress.push(state.stage));

    expect(progress).toEqual(["compressed", "uploaded", "registered"]);
    expect(deps.compressImage).toHaveBeenCalledWith("file:///picker/photo.heic", 4032);
    expect(deps.requestUploadUrl).toHaveBeenCalledWith({ proposito: "EVIDENCIA", extension: "jpg" });
    expect(deps.putFile).toHaveBeenCalledWith(
      "file:///cache/compressed.jpg",
      expect.stringContaining("slot-1.jpg?token=t1"),
    );
    expect(deps.register).toHaveBeenCalledWith({
      id: start.id,
      tipo: "RECOGIDA",
      ruta: "evidencias/user/slot-1.jpg",
      capturada_at: start.capturadaAt,
      parada_id: PARADA_ID,
      mime_type: "image/jpeg",
      tamano_bytes: 123_456,
    });
    expect(done).toMatchObject({ stage: "registered", ruta: "evidencias/user/slot-1.jpg" });
  });

  it("retries a failed registration with the same id and without uploading again", async () => {
    const register = jest
      .fn<Promise<EvidenciaDto>, [RegistrarEvidenciaBody]>()
      .mockRejectedValueOnce(ApiError.network(new TypeError("Network request failed")))
      .mockImplementation(async (body) => ({ id: body.id }) as EvidenciaDto);
    const deps = makeDeps({ register });
    let latest = captured();
    const track = (state: PendingEvidence) => {
      latest = state;
    };

    await expect(runEvidencePipeline(latest, target, deps, track)).rejects.toMatchObject({
      type: "sin-conexion",
    });
    expect(latest.stage).toBe("uploaded");

    const done = await runEvidencePipeline(latest, target, deps, track);

    expect(done.stage).toBe("registered");
    expect(deps.compressImage).toHaveBeenCalledTimes(1);
    expect(deps.requestUploadUrl).toHaveBeenCalledTimes(1);
    expect(deps.putFile).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(2);
    expect(register.mock.calls[0][0].id).toBe(register.mock.calls[1][0].id);
    expect(register.mock.calls[1][0].ruta).toBe("evidencias/user/slot-1.jpg");
  });

  it("keeps the compressed stage when the upload fails and asks for a new URL on retry", async () => {
    const putFile = jest
      .fn<Promise<{ status: number; body: string }>, [string, string]>()
      .mockRejectedValueOnce(ApiError.network(new TypeError("Network request failed")))
      .mockResolvedValue({ status: 200, body: "{}" });
    const deps = makeDeps({ putFile });
    let latest = captured();
    const track = (state: PendingEvidence) => {
      latest = state;
    };

    await expect(runEvidencePipeline(latest, target, deps, track)).rejects.toBeInstanceOf(ApiError);
    expect(latest).toMatchObject({ stage: "compressed", localUri: "file:///cache/compressed.jpg" });
    expect(latest.ruta).toBeUndefined();

    const done = await runEvidencePipeline(latest, target, deps, track);

    expect(deps.compressImage).toHaveBeenCalledTimes(1);
    expect(deps.requestUploadUrl).toHaveBeenCalledTimes(2);
    expect(putFile.mock.calls[1][1]).toContain("slot-2.jpg");
    expect(done).toMatchObject({ stage: "registered", ruta: "evidencias/user/slot-2.jpg" });
  });

  it("throws when Storage answers the PUT with a non-2xx status", async () => {
    const deps = makeDeps({ putFile: jest.fn(async () => ({ status: 500, body: "boom" })) });

    await expect(runEvidencePipeline(captured(), target, deps)).rejects.toMatchObject({
      status: 500,
      type: "error-interno",
    });
    expect(deps.register).not.toHaveBeenCalled();
  });

  it("asks for a fresh URL once when the signed URL has expired", async () => {
    const putFile = jest
      .fn<Promise<{ status: number; body: string }>, [string, string]>()
      .mockResolvedValueOnce({
        status: 400,
        body: '{"statusCode":"403","error":"InvalidJWT","message":"\\"exp\\" claim timestamp check failed"}',
      })
      .mockResolvedValue({ status: 200, body: "{}" });
    const deps = makeDeps({ putFile });

    const done = await runEvidencePipeline(captured(), target, deps);

    expect(deps.requestUploadUrl).toHaveBeenCalledTimes(2);
    expect(done.ruta).toBe("evidencias/user/slot-2.jpg");
  });

  it("counts an object that already exists as uploaded", async () => {
    const deps = makeDeps({
      putFile: jest.fn(async () => ({
        status: 400,
        body: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}',
      })),
    });

    const done = await runEvidencePipeline(captured(), target, deps);

    expect(done).toMatchObject({ stage: "registered", ruta: "evidencias/user/slot-1.jpg" });
    expect(deps.requestUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("does nothing more once the evidence is registered", async () => {
    const deps = makeDeps();
    const registered: PendingEvidence = { ...captured(), stage: "registered", ruta: "r" };

    await expect(runEvidencePipeline(registered, target, deps)).resolves.toBe(registered);
    expect(deps.compressImage).not.toHaveBeenCalled();
    expect(deps.register).not.toHaveBeenCalled();
  });
});

describe("uploadFileOnly", () => {
  it("compresses and uploads, then stops without registering", async () => {
    const deps = makeDeps();

    const done = await uploadFileOnly(captured(), "VEHICULO", deps);

    expect(deps.requestUploadUrl).toHaveBeenCalledWith({ proposito: "VEHICULO", extension: "jpg" });
    expect(deps.register).not.toHaveBeenCalled();
    expect(done).toMatchObject({ stage: "uploaded", ruta: "evidencias/user/slot-1.jpg" });
  });
});

describe("classifyUploadResponse", () => {
  it.each([
    [200, "{}", "uploaded"],
    [201, "", "uploaded"],
    [409, '{"error":"Duplicate"}', "uploaded"],
    [400, '{"statusCode":"409","error":"Duplicate"}', "uploaded"],
    [401, "", "expired"],
    [403, "", "expired"],
    [400, '{"statusCode":"403","error":"Unauthorized","message":"jwt expired"}', "expired"],
    [400, '{"statusCode":"400","error":"InvalidRequest"}', "failed"],
    [413, "too large", "failed"],
    [500, "not json", "failed"],
  ] as const)("status %i with body %s is %s", (status, body, expected) => {
    expect(classifyUploadResponse({ status, body })).toBe(expected);
  });
});
