import { fireEvent, render, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { Button, Field, keyboardBottomOffset } from "./ui";

describe("keyboardBottomOffset", () => {
  it("leaves about a fifth of the window between the focused field and the keyboard", () => {
    expect(keyboardBottomOffset(800)).toBe(160);
    expect(keyboardBottomOffset(917)).toBe(183);
  });

  it("keeps room for the field's error and action on short windows", () => {
    expect(keyboardBottomOffset(400)).toBe(96);
  });
});

describe("Field", () => {
  it("shows the error below the input and announces it on the input", async () => {
    await render(
      <Field
        label="Correo electrónico"
        value=""
        onChangeText={jest.fn()}
        error="Ingresa tu correo electrónico."
        accessibilityHint="Lo usarás para iniciar sesión"
      />,
    );

    expect(screen.getByText("Ingresa tu correo electrónico.")).toBeOnTheScreen();
    expect(screen.getByLabelText("Correo electrónico")).toHaveProp(
      "accessibilityHint",
      "Ingresa tu correo electrónico. Lo usarás para iniciar sesión",
    );
  });

  it("renders no error text and keeps its hint without an error", async () => {
    await render(
      <Field
        label="Correo electrónico"
        value=""
        onChangeText={jest.fn()}
        accessibilityHint="Lo usarás para iniciar sesión"
      />,
    );

    expect(screen.queryByText(/Ingresa/)).not.toBeOnTheScreen();
    expect(screen.getByLabelText("Correo electrónico")).toHaveProp(
      "accessibilityHint",
      "Lo usarás para iniciar sesión",
    );
  });

  it("forwards the input props forms need", async () => {
    const onBlur = jest.fn();
    const onSubmitEditing = jest.fn();
    const onChangeText = jest.fn();
    await render(
      <Field
        label="Correo electrónico"
        value=""
        onChangeText={onChangeText}
        onBlur={onBlur}
        onSubmitEditing={onSubmitEditing}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoCapitalize="none"
        returnKeyType="next"
        maxLength={120}
      />,
    );
    const input = screen.getByLabelText("Correo electrónico");

    expect(input).toHaveProp("keyboardType", "email-address");
    expect(input).toHaveProp("autoComplete", "email");
    expect(input).toHaveProp("textContentType", "emailAddress");
    expect(input).toHaveProp("autoCapitalize", "none");
    expect(input).toHaveProp("returnKeyType", "next");
    expect(input).toHaveProp("maxLength", 120);

    await fireEvent.changeText(input, "ana@correo.com");
    await fireEvent(input, "blur");
    await fireEvent(input, "submitEditing");
    expect(onChangeText).toHaveBeenCalledWith("ana@correo.com");
    expect(onBlur).toHaveBeenCalledTimes(1);
    expect(onSubmitEditing).toHaveBeenCalledTimes(1);
  });

  it("reveals and hides a secure value with the eye button", async () => {
    await render(
      <Field label="Contraseña" value="secreta123" onChangeText={jest.fn()} secure />,
    );
    const input = screen.getByLabelText("Contraseña");

    expect(input).toHaveProp("secureTextEntry", true);
    await fireEvent.press(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(input).toHaveProp("secureTextEntry", false);
    await fireEvent.press(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(input).toHaveProp("secureTextEntry", true);
  });

  it("stays read-only without onChangeText", async () => {
    await render(<Field label="Documento" value="1234567890" />);

    expect(screen.getByLabelText("Documento")).toHaveProp("editable", false);
  });
});

describe("Button", () => {
  it("stays a disabled visual button without onPress", async () => {
    await render(<Button>Enviar instrucciones</Button>);

    expect(screen.getByRole("button", { name: "Enviar instrucciones" })).toBeDisabled();
  });

  it("calls onPress when pressed", async () => {
    const onPress = jest.fn();
    await render(<Button onPress={onPress}>Ingresar</Button>);
    const button = screen.getByRole("button", { name: "Ingresar" });

    expect(button).toBeEnabled();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("ignores presses while disabled", async () => {
    const onPress = jest.fn();
    await render(
      <Button onPress={onPress} disabled>
        Ingresar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Ingresar" });

    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("renders a custom icon element, such as a brand logo, before the label", async () => {
    await render(
      <Button onPress={jest.fn()} icon={<View testID="brand-logo" />}>
        Continuar con Google
      </Button>,
    );

    expect(screen.getByTestId("brand-logo")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
  });

  it("shows a busy indicator and ignores presses while loading", async () => {
    const onPress = jest.fn();
    await render(
      <Button onPress={onPress} loading icon="check">
        Ingresar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Ingresar" });

    expect(button).toBeBusy();
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
