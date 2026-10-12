// How much of the machine a broadcast takes. The worker also collects, scores and writes on it, so
// speech and encoding keep to half the cores (at most two) and run at a lower priority: when the CPU is
// short, the other jobs go first and a video simply takes longer.
import type { ChildProcess } from "node:child_process";
import { availableParallelism, setPriority } from "node:os";

export const THREADS = Math.max(1, Math.min(2, Math.floor(availableParallelism() / 2)));

/** Lowers a child process's priority (a higher nice value, which any process may give its own children). */
export function yieldCpu(child: ChildProcess) {
  try {
    if (child.pid) setPriority(child.pid, 10);
  } catch {
    // It has already exited.
  }
}
