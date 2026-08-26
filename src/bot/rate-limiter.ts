interface RateBucket {
  timestamps: number[];
  dailyCount: number;
  lastDailyReset: number;
}

class TieredRateLimiter {
  private userBuckets = new Map<string, RateBucket>();
  private groupBuckets = new Map<string, number[]>();

  // Policies (ADR D13)
  private readonly GROUP_GLOBAL_RPM = 12;
  private readonly GROUP_USER_RPM = 4;
  private readonly GROUP_USER_RPD = 40;
  private readonly DM_USER_RPM = 10;
  private readonly DM_USER_RPD = 100;

  private getBucket(key: string): RateBucket {
    const now = Date.now();
    let bucket = this.userBuckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [], dailyCount: 0, lastDailyReset: now };
      this.userBuckets.set(key, bucket);
    }

    // Reset daily counter after 24h
    if (now - bucket.lastDailyReset > 24 * 60 * 60 * 1000) {
      bucket.dailyCount = 0;
      bucket.lastDailyReset = now;
    }

    return bucket;
  }

  public checkRateLimit(remoteJid: string, senderJid: string): { allowed: boolean; reason?: 'GROUP_OVERLOAD' | 'USER_RPM' | 'USER_RPD' } {
    const now = Date.now();
    const isGroup = remoteJid.endsWith('@g.us');

    // 1. Check Global Group Cooldown
    if (isGroup) {
      const gTimestamps = (this.groupBuckets.get(remoteJid) || []).filter((t) => now - t < 60 * 1000);
      if (gTimestamps.length >= this.GROUP_GLOBAL_RPM) {
        return { allowed: false, reason: 'GROUP_OVERLOAD' };
      }
      this.groupBuckets.set(remoteJid, gTimestamps);
    }

    // 2. Check Per-User Limits
    const userBucket = this.getBucket(senderJid);
    userBucket.timestamps = userBucket.timestamps.filter((t) => now - t < 60 * 1000);

    const maxRpm = isGroup ? this.GROUP_USER_RPM : this.DM_USER_RPM;
    const maxRpd = isGroup ? this.GROUP_USER_RPD : this.DM_USER_RPD;

    if (userBucket.timestamps.length >= maxRpm) {
      return { allowed: false, reason: 'USER_RPM' };
    }

    if (userBucket.dailyCount >= maxRpd) {
      return { allowed: false, reason: 'USER_RPD' };
    }

    return { allowed: true };
  }

  public isRateLimited(remoteJid: string, senderJid: string, isGroup?: boolean): boolean {
    return !this.checkRateLimit(remoteJid, senderJid).allowed;
  }

  public recordResponse(remoteJid: string, senderJid: string): void {
    const now = Date.now();
    const isGroup = remoteJid.endsWith('@g.us');

    if (isGroup) {
      const gTimestamps = this.groupBuckets.get(remoteJid) || [];
      gTimestamps.push(now);
      this.groupBuckets.set(remoteJid, gTimestamps);
    }

    const userBucket = this.getBucket(senderJid);
    userBucket.timestamps.push(now);
    userBucket.dailyCount += 1;
  }

  public async applyJitterDelay(): Promise<void> {
    // Human Jitter Delay between 1000ms and 2500ms
    const delayMs = Math.floor(Math.random() * (2500 - 1000 + 1)) + 1000;
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

export const rateLimiter = new TieredRateLimiter();
