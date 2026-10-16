import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import { Alert, type AlertButton } from "react-native";

import { ApiError } from "@/api/errors";
import { nativeEvidenceDeps } from "@/media/native-evidence-deps";
import { createQueryWrapper, createTestQueryClient } from "@/test-utils/query";

import { PhotoField } from "./photo-field";

// The real deps need native image and file modules; each test sets what Storage answers.
jest.mock("@/media/native-evidence-deps", () => ({
  nativeEvidenceDeps: {
    compressImage: jest.fn(),
    requestUploadUrl: jest.fn(),
    putFile: jest.fn(),
    register: jest.fn(),
  },
}));

const deps = jest.mocked(nativeEvidenceDeps);

const permission = (granted: boolean, canAskAgain: boolean) => ({
  status: granted ? "granted" : "denied",
  granted,
  canAskAgain,
  expires: "never",
});

/** Answers the camera/library alert with the button labelled `choice`. */
function chooseInAlert(choice: string) {
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons?: AlertButton[]) => {
    buttons?.find((button) => button.text === choice)?.onPress?.();
  });
}

async function renderField(props: Partial<Parameters<typeof PhotoField>[0]> = {}) {
  const Wrapper = createQueryWrapper(createTestQueryClient());
  await render(
    <Wrapper>
      <PhotoField label="Vehículo" mode="file" proposito="VEHICULO" {...props} />
    </Wrapper>,
  );
}

const defaultCameraHook = jest.mocked(ImagePicker.useCameraPermissions).getMockImplementation()!;
let alertSpy: jest.SpyInstance | undefined;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  alertSpy?.mockRestore();
  jest.mocked(ImagePicker.useCameraPermissions).mockImplementation(defaultCameraHook);
});

describe("PhotoField", () => {
  it("explains how to enable the camera once the OS stops asking", async () => {
    const blocked = permission(false, false);
    jest.mocked(ImagePicker.useCameraPermissions).mockImplementation(() => [
      blocked as never,
      jest.fn(async () => blocked as never),
      jest.fn(async () => blocked as never),
    ]);
    chooseInAlert("Tomar foto");
    await renderField();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Vehículo: agregar foto" }));
    });

    expect(screen.getByRole("button", { name: "Abrir ajustes" })).toBeOnTheScreen();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it("shows the upload error with a retry that resumes the same photo", async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: "file:///picked.jpg", width: 800, height: 600 }],
    } as ImagePicker.ImagePickerResult);
    deps.compressImage.mockResolvedValue({ uri: "file:///cache/small.jpg", size: 1000 });
    deps.requestUploadUrl
      .mockRejectedValueOnce(ApiError.network(new TypeError("Network request failed")))
      .mockResolvedValue({
        ruta: "documentos-identidad/u/v.jpg",
        url_subida: "http://supabase.test/sign?token=t",
        token: "t",
        expira_en_segundos: 7200,
      });
    deps.putFile.mockResolvedValue({ status: 200, body: "{}" });
    const onUploaded = jest.fn();
    chooseInAlert("Elegir de la galería");
    await renderField({ onUploaded });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Vehículo: agregar foto" }));
    });

    expect(screen.getByText(/No pudimos conectarnos/)).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    });

    expect(deps.compressImage).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledWith({ ruta: "documentos-identidad/u/v.jpg" });
    expect(screen.getByText("Lista")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });
});
