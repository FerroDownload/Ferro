import { describe, expect, it } from "vitest";

import type { Engine } from "@/shared/lib/types";
import { isMutationAllowed } from "./mutationGuard";

const createEngine = (process_state: Engine["process_state"]): Engine => ({
  process_state,
  restart_attempts_in_current_burst: 0,
  last_error_message: null,
  rpc_host: "127.0.0.1",
  rpc_port: 16800,
  config_path: "C:/ferro/aria2.conf",
  session_path: "C:/ferro/aria2.session",
  session_save_interval_seconds: 60,
  file_allocation: "falloc",
});

describe("isMutationAllowed", () => {
  it("blocks mutations during restarting and engine_failed states", () => {
    expect(isMutationAllowed(createEngine("restarting"))).toBe(false);
    expect(isMutationAllowed(createEngine("engine_failed"))).toBe(false);
  });

  it("allows mutations in running and non-terminal non-restarting states", () => {
    expect(isMutationAllowed(createEngine("running"))).toBe(true);
    expect(isMutationAllowed(createEngine("stopped"))).toBe(true);
    expect(isMutationAllowed(null)).toBe(true);
  });
});
