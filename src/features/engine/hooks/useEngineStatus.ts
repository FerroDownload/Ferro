import { useEffect, useMemo, useRef, useState } from "react";

import {
  fetchEngineStatus,
  startEngine,
} from "@/features/tasks/services/engineClient";
import { isMutationAllowed } from "@/features/engine/lib/mutationGuard";
import type { Engine } from "@/shared/lib/types";

export const ENGINE_POLL_INTERVAL_MS = 500;
export const ENGINE_RESTARTING_POLL_INTERVAL_MS = 6000;

const getNextPollInterval = (engine: Engine | null) =>
  engine?.process_state === "restarting"
    ? ENGINE_RESTARTING_POLL_INTERVAL_MS
    : ENGINE_POLL_INTERVAL_MS;

export const useEngineStatus = () => {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startupAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      try {
        const nextEngine = await fetchEngineStatus();
        if (cancelled) {
          return;
        }

        if (
          nextEngine.process_state === "stopped" &&
          !startupAttemptedRef.current
        ) {
          startupAttemptedRef.current = true;
          setEngine(nextEngine);
          const startedEngine = await startEngine();
          if (cancelled) {
            return;
          }

          setEngine(startedEngine);
          setError(null);
          timeoutId = window.setTimeout(
            poll,
            getNextPollInterval(startedEngine),
          );
          return;
        }

        setEngine(nextEngine);
        setError(null);
        timeoutId = window.setTimeout(poll, getNextPollInterval(nextEngine));
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Unable to load engine status",
        );
        timeoutId = window.setTimeout(poll, ENGINE_RESTARTING_POLL_INTERVAL_MS);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const mutationsAllowed = useMemo(() => isMutationAllowed(engine), [engine]);

  return {
    engine,
    error,
    mutationsAllowed,
  };
};
