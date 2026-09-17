import type { MobileData } from "@/domain/models";
import { mobileData } from "@/data/mobile";
/** Puerto de lectura. Una implementación HTTP podrá inyectarse en MobileProvider. */
export interface MobileRepository {
  load(signal?: AbortSignal): Promise<MobileData>;
}
export const demoRepository: MobileRepository = {
  async load() {
    return mobileData;
  },
};
