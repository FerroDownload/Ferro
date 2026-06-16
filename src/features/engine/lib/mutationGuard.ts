import type { Engine } from "@/shared/lib/types";

const MUTATION_BLOCKING_ENGINE_STATES: Engine["process_state"][] = [
  "restarting",
  "engine_failed",
];

export const isMutationAllowed = (engine: Engine | null | undefined) =>
  engine
    ? !MUTATION_BLOCKING_ENGINE_STATES.includes(engine.process_state)
    : true;
