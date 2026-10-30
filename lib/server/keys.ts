import "server-only";

/** Every KV key the server uses, in one place (so TTLs and deletes can't drift apart). */
export const keys = {
  baseline: (id: string) => `baseline:${id}`,
  sessionBaselines: (sid: string) => `sess:${sid}:baselines`,
  sessionJobs: (sid: string) => `sess:${sid}:jobs`,
  job: (id: string) => `job:${id}`,
  jobLock: (id: string) => `lock:job:${id}`,
  idem: (key: string) => `idem:${key}`,
  clientRequest: (sid: string, clientRequestId: string) => `creq:${sid}:${clientRequestId}`,
  task: (youcamTaskId: string) => `task:${youcamTaskId}`,
  styleRef: (styleId: string) => `ref:${styleId}`,
  partialFailure: (idemKey: string) => `pf:${idemKey}`,
  webhook: (id: string) => `wh:${id}`,
  unitsSession: (sid: string) => `units:sess:${sid}`,
  unitsIp: (ipHash: string, day: string) => `units:ip:${ipHash}:${day}`,
  youcamCalls: (window: number) => `yc:calls:${window}`,
  share: (token: string) => `share:${token}`,
  shareVotes: (token: string) => `share:${token}:votes`,
  shareVoteTotal: (token: string) => `share:${token}:total`,
  shareIpVotes: (token: string, ipHash: string) => `share:${token}:ip:${ipHash}`,
  sessionShares: (sid: string) => `sess:${sid}:shares`,
  sharesIndex: "shares:index",
  credit: "credit:cache",
  liveFlag: "flag:live",
  metric: (name: string) => `metrics:${name}`,
};

export const TTL = {
  record: 24 * 3600_000,
  session: 30 * 24 * 3600_000,
  ipDay: 26 * 3600_000,
  styleRef: 20 * 3600_000,
  /** Share records outlive their logical expiry so the daily cleanup can find and delete their images. */
  shareGrace: 2 * 24 * 3600_000,
};
