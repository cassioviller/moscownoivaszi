import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StoreState {
  activeLojaId: string | null;
  setActiveLojaId: (id: string | null) => void;
}

export const useStoreStore = create<StoreState>()(
  persist(
    (set) => ({
      activeLojaId: null,
      setActiveLojaId: (id) => set({ activeLojaId: id }),
    }),
    {
      name: "moscow-noivas-store",
    }
  )
);
