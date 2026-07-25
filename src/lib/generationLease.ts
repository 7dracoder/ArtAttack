export interface GenerationClaimVersion {
  claimId: string;
  heartbeat: number;
}

export interface ObservedGenerationClaim extends GenerationClaimVersion {
  observedAt: number;
}

export function observeGenerationClaim(
  previous: ObservedGenerationClaim | undefined,
  current: GenerationClaimVersion | undefined,
  observedAt: number
): ObservedGenerationClaim | undefined {
  if (!current) return undefined;
  if (
    !previous ||
    previous.claimId !== current.claimId ||
    previous.heartbeat !== current.heartbeat
  ) {
    return { ...current, observedAt };
  }
  return previous;
}

export function canTakeOverGenerationClaim(
  observation: ObservedGenerationClaim | undefined,
  now: number,
  leaseMs = 45_000
): boolean {
  return Boolean(observation && now - observation.observedAt >= Math.max(1_000, leaseMs));
}
