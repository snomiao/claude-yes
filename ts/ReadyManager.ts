export class ReadyManager {
  isReady = false;
  private readyQueue: (() => void)[] = [];
  wait() {
    if (this.isReady) return;
    return new Promise<void>((resolve) => this.readyQueue.push(resolve));
  }
  unready() {
    this.isReady = false;
  }
  ready() {
    this.isReady = true;
    if (!this.readyQueue.length) return; // check len for performance
    this.readyQueue.splice(0).map((resolve) => resolve());
  }
}
