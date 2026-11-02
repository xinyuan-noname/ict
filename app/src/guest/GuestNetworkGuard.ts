// 游客窗口内的网络闸门：阻断并计数，作为“零网络”的可验证证据。
export interface NetworkGuard {
  allowOutbound(): boolean;
  recordOutbound(): void;
}

export class GuestNetworkGuard implements NetworkGuard {
  private guestWindow = false;
  private attempts = 0;
  private outbound = 0;

  enterGuestMode(): void {
    this.guestWindow = true;
  }

  leaveGuestMode(): void {
    this.guestWindow = false;
  }

  allowOutbound(): boolean {
    if (!this.guestWindow) {
      return true;
    }
    this.attempts += 1;
    return false;
  }

  recordOutbound(): void {
    if (this.guestWindow) {
      this.outbound += 1;
    }
  }

  stats(): { guestWindow: boolean; attempts: number; outbound: number } {
    return { guestWindow: this.guestWindow, attempts: this.attempts, outbound: this.outbound };
  }

  resetCounters(): void {
    this.attempts = 0;
    this.outbound = 0;
  }
}