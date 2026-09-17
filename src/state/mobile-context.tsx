import {
  initialDonationDraft,
  type DonationDraft,
} from "@/domain/donation-draft";
import { mobileData } from "@/data/mobile";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { MobileData, UserRole } from "@/domain/models";
import {
  demoRepository,
  type MobileRepository,
} from "@/services/mobile-repository";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { colors } from "@/design/tokens";
const Context = createContext<{
  data: MobileData;
  draft: DonationDraft;
  setDraft: Dispatch<SetStateAction<DonationDraft>>;
  role: UserRole;
  setRole: (role: UserRole) => void;
} | null>(null);
export function MobileProvider({
  children,
  repository = demoRepository,
}: PropsWithChildren<{ repository?: MobileRepository }>) {
  const [data, setData] = useState<MobileData | null>(
    repository === demoRepository ? mobileData : null,
  );
  const [draft, setDraft] = useState(initialDonationDraft);
  const [error, setError] = useState(false);
  const [attempt, retry] = useState(0);
  const [role, setRole] = useState<UserRole>("donor");
  useEffect(() => {
    const controller = new AbortController();
    repository
      .load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [repository, attempt]);
  if (!data)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          gap: 20,
          backgroundColor: colors.surface,
        }}
      >
        {error ? (
          <>
            <Text>No fue posible cargar la información.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setError(false);
                retry((n) => n + 1);
              }}
            >
              <Text>Reintentar</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator
            accessibilityLabel="Cargando información"
            color={colors.primary}
          />
        )}
      </View>
    );
  return (
    <Context.Provider value={{ data, role, setRole, draft, setDraft }}>
      {children}
    </Context.Provider>
  );
}
export function useMobile() {
  const value = useContext(Context);
  if (!value) throw new Error("useMobile requiere MobileProvider");
  return value;
}
