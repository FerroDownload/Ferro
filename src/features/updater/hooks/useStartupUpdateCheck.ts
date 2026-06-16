import { useEffect, useRef } from "react";

import { invokeUpdaterCheck } from "@/shared/lib/tauri";
import type { Engine } from "@/shared/lib/types";

export const useStartupUpdateCheck = (engine: Engine | null) => {
  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current || engine?.process_state !== "running") {
      return;
    }

    hasChecked.current = true;
    void invokeUpdaterCheck().catch(() => {
      // Offline startup checks are intentionally silent per FR-050.
    });
  }, [engine?.process_state]);
};
