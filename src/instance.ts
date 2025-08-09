import { AceClass, Action, Condition, Expression, Param, Plugin, Trigger } from "@c3framework/core";
import { dependencies } from "@c3framework/core/utils";
import Config from "./addon.js";

const C3Lib: any = self.C3;
let realRuntime: IRealRuntime;
let originalTick: (...args: any[]) => Promise<void>;
let tickAgain: () => void;
let intervalId: number;
let timeoutId: number;

type IFpsManagerFramerateMode = 'max-fps' | 'fixed-fps' | 'forked-fps';
const FRAMERATE_MODES: IFpsManagerFramerateMode[] = [
  'max-fps',
  'fixed-fps',
  'forked-fps'
];

@AceClass()
class Instance extends Plugin.Instance(Config, globalThis.ISDKInstanceBase) {
  _framerateLimit = 0;
  _mode: IFpsManagerFramerateMode = 'max-fps';

  constructor() {
    super();

    const props = this._getInitProperties();

    this._framerateLimit = props[0] ? parseInt(props[0] as any) : 0;

    dependencies<[IJailBreakInstance?]>(this, {
      'MasterPose_JailBreak': '?>=1.1.0'
    }).then(([JailBreak, throwError]) => {
      realRuntime = JailBreak?.realRuntime ?? (globalThis as any)['C3_RealRuntime'];
      if (!realRuntime) throwError('Neither MasterPose_JailBreak or an exposed `globalThis.C3_RealRuntime` was found. Please include JailBreak first.');
    }).then(() => this.#initialize());
  }

  @Action({
    displayText: 'Limit to {0} FPS',
    listName: 'Set max framerate',
    description: 'Sets the maximum framerate your game can run on. (Set 0 to disable).',
    category: 'framerate',
    highlight: true
  })
  setMaxFramerate(
    @Param({ desc: 'The framerate limit to impose. Should be greater or equal to zero.' })
    limit: number
  ) {
    const framerate = parseInt(limit as any);

    if (
      this._framerateLimit === framerate ||
      isNaN(framerate) ||
      !isFinite(framerate) ||
      framerate < 0
    ) {
      return;
    }

    this._framerateLimit = framerate;
    this.#overrideTick();
    this.trigger(this.onChangeMaxFramerate);
  }

  @Action({
    listName: 'Set framerate mode',
    displayText: 'Set framerate mode to {0}',
    description: 'Sets the framerate mode.',
    category: 'framerate',
  })
  setFramerateMode(
    @Param({
      items: [
        { maxFps: 'Max FPS' },
        { fixedFps: 'Fixed FPS' },
        { forkedFps: 'Forked FPS' },
      ]
    })
    mode: combo
  ) {
    const framerateMode = FRAMERATE_MODES[mode];

    if (
      framerateMode === undefined ||
      framerateMode === this._mode ||
      isNaN(mode) ||
      !isFinite(mode) ||
      mode < 0 ||
      mode >= FRAMERATE_MODES.length
    ) {
      return;
    }

    this._mode = framerateMode;
    this.#overrideTick();
    this.trigger(this.onChangeFramerateMode);
  }

  @Action({
    displayText: 'Disable max framerate',
    description: 'Disables the max framerate.',
    category: 'framerate'
  })
  disableMaxFramerate() {
    this.setMaxFramerate(0);
  }

  @Expression({
    description: 'Returns the configured maximum framerate, returns 0 when disabled.',
    category: 'framerate'
  })
  maxFramerate(): number {
    return this._framerateLimit;
  }

  @Expression({
    description: 'Returns the framerate mode or "disabled" if the plugin is disabled.',
    category: 'framerate'
  })
  framerateMode(): string {
    if (this._framerateLimit === 0) {
      return 'disabled';
    }
    return this._mode;
  }

  @Trigger({
    displayText: 'On change max framerate',
    description: 'Triggers when a new framerate has been chosen.',
    category: 'framerate'
  })
  onChangeMaxFramerate() {
    return true;
  }

  @Trigger({
    displayText: 'On change framerate mode',
    description: 'Triggers when a new framerate mode has been chosen.',
    category: 'framerate'
  })
  onChangeFramerateMode() {
    return true;
  }

  /* =========
   * Internal
   =========== */

  #initialize() {
    originalTick = realRuntime.Tick.bind(realRuntime);
    if (!tickAgain) {
      tickAgain = () => {
        C3Lib.RequestUnlimitedAnimationFrame((time: number) => {
          realRuntime._rafId = -1;
          realRuntime._ruafId = -1;
          realRuntime.Tick(time); // Call itself again until the threshold is met, basically a wait
        });
      }
    }

    this.#overrideTick();
  }

  #overrideTick() {
    const maxFPS = this._framerateLimit;

    if (intervalId) clearInterval(intervalId);
    if (timeoutId) clearTimeout(timeoutId);

    if (maxFPS === 0 || isNaN(maxFPS) || !isFinite(maxFPS)) {
      realRuntime.Tick = originalTick;
      return;
    }

    switch (this._mode) {
      case 'fixed-fps':
        return this.#useFixedFpsTick();
      case 'forked-fps':
        return this.#useForkedTick();
      default:
        return this.#useMaxFpsTick();
    }
  }

  #useMaxFpsTick() {
    const maxFPS = this._framerateLimit;
    const timeShouldPassBetweenFrames = 1000 / (maxFPS + 1);
    let lastFrameTime = performance.now();

    realRuntime.Tick = async (time: number) => {
      const curFrameTime = time ?? lastFrameTime;
      const timeElapsedBetweenLastFrame = curFrameTime - lastFrameTime;

      if (timeElapsedBetweenLastFrame <= timeShouldPassBetweenFrames) {
        tickAgain();
        return;
      }

      lastFrameTime = curFrameTime;

      // Run the tick
      originalTick(time);
    };

    realRuntime.Tick(lastFrameTime);
  }

  #useForkedTick() {
    const maxFPS = this._framerateLimit;
    const timeShouldPassBetweenFrames = 1000 / (maxFPS + 1);
    let lastFrameTime = performance.now();

    intervalId = setInterval(() => {
      const time = performance.now();
      realRuntime._ruafId = -1;
      originalTick(time, false, 'skip-render');
    }, timeShouldPassBetweenFrames);

    const gpuTick = async (time: number) => {
      const curFrameTime = time ?? lastFrameTime;
      const timeElapsedBetweenLastFrame = curFrameTime - lastFrameTime;

      if (timeElapsedBetweenLastFrame <= timeShouldPassBetweenFrames) {
        tickAgain()
        return;
      }

      // Run the tick
      lastFrameTime = curFrameTime;
      realRuntime.Render();
    };

    realRuntime.Tick = gpuTick;
    realRuntime.Tick(lastFrameTime);
  }

  #useFixedFpsTick() {
    const maxFPS = this._framerateLimit;
    const timeShouldPassBetweenFrames = 1000 / maxFPS;
    let maxLoops = 2;
    let realMaxLoops = 32768 * 2 * 2;
    let waitDelay = timeShouldPassBetweenFrames;
    let precisionRatio = 0.006;
    let precision = precisionRatio * timeShouldPassBetweenFrames;
    let ignoreNext = false;
    let instantTick = false;
    let lastTime = performance.now();

    const hangWhileLoopFor = (duration: number) => {
      let now = performance.now();
      let start = now;
      let nbLoops = 0;
      while (now - start < duration && nbLoops < maxLoops) {
        if (this._mode !== 'fixed-fps') break;
        now = performance.now();
        nbLoops++;
      }
      return nbLoops === maxLoops;
    }

    const doTick = (elapsed: number) => {
      if (ignoreNext) return true;
      let doTickStart = performance.now();

      if (elapsed <= 0) {
        return true;
      }

      if (elapsed > timeShouldPassBetweenFrames - precision) {
        let overshotBy = elapsed - timeShouldPassBetweenFrames + precision;
        waitDelay = waitDelay - Math.max(overshotBy / 70, 0);

        return true;
      }

      let start = performance.now();
      let hangFor = timeShouldPassBetweenFrames - elapsed - (start - doTickStart);

      if (hangWhileLoopFor(hangFor) && maxLoops < realMaxLoops) {
        maxLoops = Math.min(maxLoops * 2, realMaxLoops);
        return true;
      }

      return true;
    }

    const tickCallback = (tickDuration: number) => {
      if (instantTick) {
        instantTick = false;
        tick();
        return;
      }
      let duration = waitDelay - tickDuration;
      if (duration < 0) duration = timeShouldPassBetweenFrames;
      ignoreNext = false;
      timeoutId = setTimeout(tick, Math.max(duration, 0));
    };

    const tick = () => {
      originalTick(performance.now());
    }

    realRuntime.Tick = async () => {
      let now = performance.now();
      let elapsed = now - lastTime;

      if (doTick(elapsed)) {
        let now2 = performance.now();
        elapsed = now2 - lastTime;
        lastTime = now2;
        let tickDuration = performance.now() - now;
        tickCallback(tickDuration);
      }
    }

    timeoutId = setTimeout(tick, timeShouldPassBetweenFrames);
  }

  _saveToJson() {
    return {
      f: this._framerateLimit,
      m: this._mode,
    };
  }

  _loadFromJson(o: any) {
    this._framerateLimit = o.f ?? 0;
    this._mode = o.m ?? 'max-fps';
    this.#overrideTick();
  }
}

export default Instance;
