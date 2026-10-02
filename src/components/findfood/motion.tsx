import { colors, motion } from "@/design/tokens";
import { useEffect, type PropsWithChildren } from "react";
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  Keyframe,
  LayoutAnimationConfig,
  LinearTransition,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from "react-native-reanimated";

/** Desaceleración natural: avanza rápido y se asienta sin rebote. */
const ease = Easing.out(Easing.cubic);

export { Animated, LayoutAnimationConfig };

/** Entrada de un elemento que se suma a una lista o a un formulario. */
export const enterItem = FadeInDown.duration(motion.base)
  .easing(ease)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] });
/** Salida del mismo elemento: solo opacidad, para no arrastrar su medida. */
export const exitItem = FadeOut.duration(motion.exit);
/** Reacomodo de los hermanos cuando un elemento entra o sale. */
export const itemLayout = LinearTransition.duration(motion.base).easing(ease);
export const fadeIn = FadeIn.duration(motion.fast);
export const fadeOut = FadeOut.duration(motion.fast);
/** Aparición de la tarjeta de un diálogo dentro de un Modal nativo. */
export const dialogEnter = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.97 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: ease },
}).duration(motion.base);

/** Progreso 0→1 compartido por las transiciones de estado binario. */
function useTransitionValue(active: boolean) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.set(
      withTiming(active ? 1 : 0, { duration: motion.fast, easing: ease }),
    );
  }, [active, progress]);
  return progress;
}

/**
 * Estilo animado de un control que entra o sale de estado activo: foco de
 * campo, chip seleccionado, panel abierto o control deshabilitado. Anima color
 * y opacidad; nunca medidas que obliguen a recalcular el layout.
 */
export function useActiveStyle(
  active: boolean,
  {
    border = false,
    fill = false,
    dim = false,
  }: { border?: boolean; fill?: boolean; dim?: boolean } = {},
) {
  const progress = useTransitionValue(active);
  return useAnimatedStyle(() => {
    const t = progress.get();
    return {
      ...(border && {
        borderColor: interpolateColor(
          t,
          [0, 1],
          [colors.border, colors.primary],
        ),
      }),
      ...(fill && {
        backgroundColor: interpolateColor(
          t,
          [0, 1],
          [colors.surface, colors.soft],
        ),
      }),
      ...(dim && { opacity: 1 - 0.55 * t }),
    };
  });
}

/**
 * Giro del indicador de un desplegable mientras su panel está abierto. El
 * chevron del sistema apunta a la derecha, así que 90° lo deja apuntando abajo.
 */
export function useRotation(active: boolean, degrees = 90) {
  const progress = useTransitionValue(active);
  return useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.get() * degrees}deg` }],
  }));
}

/**
 * Pressable con realimentación táctil sutil. La animación vive en el hilo de
 * interfaz, así que presionar no provoca ningún render extra. El Pressable
 * externo conserva el área táctil y la accesibilidad; la vista interna es la
 * superficie animada, de modo que `<Link asChild>` sigue clonando este
 * componente e inyectando sus props sin cambio alguno.
 *
 * `opacity` es la opacidad en reposo de la superficie: se compone con la de
 * pulsación en vez de quedar sobrescrita, que es lo que ocurriría si se
 * declarara dentro de `surface`.
 */
export function Pressing({
  children,
  surface,
  scale = 0.98,
  dim = 0.12,
  opacity = 1,
  onPressIn,
  onPressOut,
  ...rest
}: PropsWithChildren<
  Omit<PressableProps, "children"> & {
    surface?: StyleProp<AnimatedStyle<ViewStyle>>;
    scale?: number;
    dim?: number;
    opacity?: number;
  }
>) {
  const pressed = useSharedValue(0);
  const animated = useAnimatedStyle(() => {
    const t = pressed.get();
    return {
      opacity: opacity * (1 - dim * t),
      transform: [{ scale: 1 - (1 - scale) * t }],
    };
  });
  return (
    <Pressable
      {...rest}
      onPressIn={(event) => {
        pressed.set(withTiming(1, { duration: motion.press, easing: ease }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        pressed.set(withTiming(0, { duration: motion.exit, easing: ease }));
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[surface, animated]}>{children}</Animated.View>
    </Pressable>
  );
}
