export class ReadyManager {
  private isReady = false;
  private readyQueue: (() => void)[] = [];
  wait() {
    return new Promise<void>((resolve) => {
      if (this.isReady) return resolve();
      this.readyQueue.push(resolve);
    });
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
