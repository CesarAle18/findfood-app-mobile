import { createContext, useContext } from "react";

/**
 * True for screens rendered inside a native tab bar. Android native tabs already lay their
 * screens out above the bar, so the screen frame must not pad the navigation bar again.
 */
export const TabScreenContext = createContext(false);

export function useIsTabScreen(): boolean {
  return useContext(TabScreenContext);
}
