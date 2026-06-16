import { parseEngineStatus, parseTaskList } from "@/shared/lib/rpcSchemas";
import type { Engine, Task } from "@/shared/lib/types";
import {
  invokeEngineStart,
  invokeEngineStatus,
  invokeListTasks,
} from "@/shared/lib/tauri";

export async function fetchEngineStatus(): Promise<Engine> {
  const response = await invokeEngineStatus();
  return parseEngineStatus(response);
}

export async function startEngine(): Promise<Engine> {
  const response = await invokeEngineStart();
  return parseEngineStatus(response);
}

export async function fetchTasks(): Promise<Task[]> {
  const response = await invokeListTasks();
  return parseTaskList(response);
}
