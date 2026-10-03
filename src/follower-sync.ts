/** Manual opt-out stays off; browsing otherwise resumes sync after inactivity. */
export class FollowerSync {
  private manualPause = false;
  private active = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  constructor(private change: (following: boolean) => void, private resume: () => void) {}
  setManual(checked: boolean) {
    if (this.destroyed) return;
    clearTimeout(this.timer); this.manualPause = !checked;
    this.change(checked);
    if (checked) this.resume();
  }
  begin() {
    if (this.destroyed) return;
    this.active++; clearTimeout(this.timer);
    this.change(false);
  }
  end() {
    if (this.destroyed) return;
    this.active = Math.max(0, this.active - 1);
    if (this.manualPause || this.active) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.destroyed || this.manualPause || this.active) return;
      this.change(true); this.resume();
    }, 3000);
  }
  destroy() { this.destroyed = true; clearTimeout(this.timer); }
}
