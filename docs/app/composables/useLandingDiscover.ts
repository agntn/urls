import type { DiscoverAnswer } from "../../shared/types/discover";
import { LANDING_SAMPLES, type DiscoverSample } from "../utils/discover";

/** How long one domain stays on the landing before the walk moves on. */
const INTERVAL = 4200;

/**
 * Drives every panel on the landing from one clock over the recorded comparisons, and swaps a
 * sample for the docs worker's live answer once that arrives. The worker runs the executor the
 * MCP server does, so a live sample is what an agent would get for the same call.
 */
export function useLandingDiscover() {
  const samples = ref<readonly DiscoverSample[]>(LANDING_SAMPLES);
  const tick = ref(0);
  const paused = ref(false);

  const index = computed(() => tick.value % samples.value.length);
  const current = computed(() => samples.value[index.value]!);
  const target = computed(() => current.value.target);

  let timer: number | undefined;

  function step(delta: number) {
    const total = samples.value.length;
    tick.value = (tick.value + delta + total) % total;
  }

  function stopWalk() {
    if (timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  }

  function startWalk() {
    stopWalk();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    timer = window.setInterval(() => {
      if (!paused.value && !document.hidden) step(1);
    }, INTERVAL);
  }

  /** A failed or empty live answer leaves the recorded sample and its label in place. */
  async function refresh(position: number) {
    const sample = samples.value[position]!;
    try {
      const answer = await $fetch<DiscoverAnswer>("/api/discover", {
        retry: 0,
        query: { domain: sample.target, provider: "all", limit: sample.limit },
      });
      if (answer.mode !== "comparison" || !answer.outcomes.some((entry) => entry.result?.count)) return;
      const next = [...samples.value];
      next[position] = { ...sample, outcomes: answer.outcomes, fetchedAt: answer.fetchedAt, live: true };
      samples.value = next;
    } catch {
      return;
    }
  }

  onMounted(() => {
    startWalk();
    samples.value.forEach((_, position) => void refresh(position));
  });

  onUnmounted(stopWalk);

  return { samples, index, current, target, paused, step };
}
