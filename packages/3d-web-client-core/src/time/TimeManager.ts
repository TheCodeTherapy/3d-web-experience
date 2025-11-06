import { ease } from "../helpers/math-helpers";

export class TimeManager {
  private roundMagnitude: number = 200000;
  private maxAverageFrames: number = 150;
  private deltaTimes: number[] = [];

  private targetAverageDeltaTime: number = 0;
  private lerpedAverageMagDelta: number = 0;
  private fpsUpdateTime: number = 0;
  private framesSinceLastFPSUpdate: number = 0;

  private previousTime: number = 0;

  public time: number = 0;
  public deltaTime: number = 0;
  public rawDeltaTime: number = 0;
  public smoothDeltaTime: number = 0;
  public frame: number = 0;
  public fps: number = 0;
  public averageFPS: number = 0;

  public static maxDeltaTime = 0.1; // 100ms

  public static MILLISECONDS_TO_SECONDS = 1000;

  update() {
    const now = performance.now();
    this.rawDeltaTime = (now - this.previousTime) / TimeManager.MILLISECONDS_TO_SECONDS;
    this.previousTime = now;

    if (this.rawDeltaTime > TimeManager.maxDeltaTime) {
      this.rawDeltaTime = TimeManager.maxDeltaTime;
    }

    this.frame++;
    this.time += this.rawDeltaTime;
    this.deltaTimes.push(this.rawDeltaTime);

    if (this.deltaTimes.length > this.maxAverageFrames) this.deltaTimes.shift();

    this.targetAverageDeltaTime =
      this.deltaTimes.reduce((prev, curr) => prev + curr, 0) / this.deltaTimes.length;

    this.lerpedAverageMagDelta += ease(
      this.targetAverageDeltaTime * this.roundMagnitude,
      this.lerpedAverageMagDelta,
      0.12,
    );

    const revertMagnitude = this.lerpedAverageMagDelta / this.roundMagnitude;
    const smoothDT = Math.round(revertMagnitude * this.roundMagnitude) / this.roundMagnitude;

    this.smoothDeltaTime = smoothDT > this.rawDeltaTime * 1.75 ? this.rawDeltaTime : smoothDT;
    this.deltaTime = this.smoothDeltaTime;

    this.framesSinceLastFPSUpdate++;
    if (this.framesSinceLastFPSUpdate >= 60) {
      this.fps =
        Math.round((this.framesSinceLastFPSUpdate / (this.time - this.fpsUpdateTime)) * 100) / 100;

      this.fpsUpdateTime = this.time;
      this.framesSinceLastFPSUpdate = 0;
    }
  }
}
