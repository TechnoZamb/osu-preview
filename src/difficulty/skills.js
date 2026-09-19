import { DiffUtils as D } from './math.js';
import { SnapAimEvaluator } from './SnapAimEvaluator.js';
import { FlowAimEvaluator } from './FlowAimEvaluator.js';
import { AgilityEvaluator } from './AgilityEvaluator.js';
import { SpeedEvaluator } from './SpeedEvaluator.js';
import { RhythmEvaluator } from './RhythmEvaluator.js';
import { ReadingEvaluator } from './ReadingEvaluator.js';
import { FlashlightEvaluator } from './FlashlightEvaluator.js';

export class Skills {
    constructor(mods) {
        this.mods = mods;
        this.aim = this.speed = this.reading = this.flashlight = 0;
    }
    process(obj) {
        const dt = obj.AdjustedDeltaTime;
        const snap = SnapAimEvaluator.EvaluateDifficultyOf(obj, true) * 70.9;
        const agility = AgilityEvaluator.EvaluateDifficultyOf(obj) * 2.35;
        const flow = FlowAimEvaluator.EvaluateDifficultyOf(obj, true) * 242;
        const combinedSnap = D.Norm(1.2, snap, agility),
            ratio = flow / combinedSnap;
        const pSnap = Number.isNaN(ratio) ? 1 : ratio === 0 ? 0 : D.Logistic(-7.27 * Math.log(ratio));
        const aimDifficulty =
            (combinedSnap * pSnap + flow * (1 - pSnap)) *
            1.12 *
            (0.985 + Math.max(0, obj.OverallDifficulty) ** 2 / 4000);
        const ad = 0.2 ** (dt / 1000),
            sd = 0.3 ** (dt / 1000),
            rd = 0.8 ** (obj.DeltaTime / 1000);
        this.aim = this.aim * ad + aimDifficulty * (1 - ad);
        this.speed = this.speed * sd + SpeedEvaluator.EvaluateDifficultyOf(obj) * (1 - sd) * 1.16;
        const speed = this.speed * RhythmEvaluator.EvaluateDifficultyOf(obj);
        const readingDifficulty =
            ReadingEvaluator.EvaluateDifficultyOf(obj, this.mods.has('hd')) *
            (0.825 + Math.max(0, obj.OverallDifficulty) ** 2.2 / 1125);
        this.reading = this.reading * rd + readingDifficulty * (1 - rd) * 2.5;
        if (this.mods.has('fl'))
            this.flashlight =
                this.flashlight * 0.15 ** (obj.DeltaTime / 1000) +
                FlashlightEvaluator.EvaluateDifficultyOf(obj, this.mods) *
                    (0.985 + Math.max(0, obj.OverallDifficulty) ** 2 / 4000) *
                    0.058;
        const values = [this.aim, speed, this.reading, this.flashlight];
        if (!values.every((x) => Number.isFinite(x) && x >= 0)) throw new Error('Unsupported difficulty pattern');
        return values;
    }
}

// Preserve variable-length aim sections. Only the final difficulty summation sorts them.
export class AimPeaks {
    constructor() {
        this.peaks = [];
        this.queue = [];
        this.peak = 0;
        this.begin = null;
        this.end = 0;
        this.lastStrain = 0;
        this.lastTime = 0;
    }
    save(length) {
        if (length > 0 && this.peak > 0) this.peaks.push({ value: this.peak, length: Math.round(length) });
    }
    process(time, strain) {
        if (this.begin === null) {
            this.begin = time;
            this.end = time + 400;
            this.peak = strain;
        } else {
            while (time > this.end) {
                this.save(this.end - this.begin);
                this.begin = this.end;
                const queued = this.queue.shift();
                this.end = queued ? queued.time + 400 : this.begin + 400;
                this.peak = this.lastStrain * 0.2 ** ((this.begin - this.lastTime) / 1000);
                if (queued) this.peak = Math.max(this.peak, queued.strain);
            }
            if (strain > this.peak) {
                this.queue = [];
                this.save(time - this.begin);
                this.begin = time;
                this.end = time + 400;
                this.peak = strain;
            } else {
                while (this.queue.length && this.queue.at(-1).strain < strain) this.queue.pop();
                this.queue.push({ strain, time });
            }
        }
        this.lastStrain = strain;
        this.lastTime = time;
    }
    difficulty() {
        if (this.begin === null) return 0;
        const peaks = [...this.peaks, { value: this.peak, length: Math.round(this.end - this.begin) }]
            .filter((p) => p.value > 0)
            .sort((a, b) => b.value - a.value);
        let stored = 0,
            keep = 0;
        while (keep < peaks.length && stored < 44000) stored += peaks[keep++].length;
        peaks.length = keep;
        // Compact persistent history, but never persist the temporary current section.
        if (this.peaks.length > 4096) {
            this.peaks.sort((a, b) => b.value - a.value);
            let length = 0,
                n = 0;
            while (n < this.peaks.length && length < 44000) length += this.peaks[n++].length;
            this.peaks.length = n;
        }
        const reduced = [];
        let elapsed = 0;
        for (const peak of peaks) {
            if (elapsed < 4000) {
                for (let added = 0; added < peak.length; added += 20) {
                    const scale = Math.log10(1 + 9 * Math.min(1, (elapsed + added) / 4000));
                    reduced.push({
                        value: peak.value * (0.727 + 0.273 * scale),
                        length: Math.min(20, peak.length - added),
                    });
                }
                elapsed += peak.length;
            } else reduced.push(peak);
        }
        reduced.sort((a, b) => b.value - a.value);
        let time = 0,
            result = 0;
        for (const p of reduced) {
            const end = time + p.length / 400;
            result += p.value * (0.9 ** time - 0.9 ** end);
            time = end;
        }
        return result / 0.1;
    }
}

// Log buckets avoid re-sorting the complete score prefix hundreds of times.
export class HarmonicSum {
    constructor(scale, capacity) {
        this.counts = new Uint32Array(2048);
        this.sums = new Float64Array(2048);
        this.weights = new Float64Array(capacity + 1);
        this.max = 0;
        for (let i = 0; i < capacity; i++) {
            const h = scale / (1 + i);
            this.weights[i + 1] = this.weights[i] + (1 + h) / (i ** 0.9 + 1 + h);
        }
    }
    add(value) {
        if (!(value > 0)) return;
        const bin = Math.max(0, Math.min(2047, Math.floor(Math.log(value + 1) / Math.log(1.01))));
        this.counts[bin]++;
        this.sums[bin] += value;
        this.max = Math.max(this.max, value);
    }
    clear() {
        this.counts.fill(0);
        this.sums.fill(0);
        this.max = 0;
    }
    difficulty() {
        let rank = 0,
            value = 0;
        for (let i = 2047; i >= 0; i--) {
            const count = this.counts[i];
            if (!count) continue;
            value += (this.sums[i] / count) * (this.weights[rank + count] - this.weights[rank]);
            rank += count;
        }
        return value;
    }
    relevantCount() {
        if (!this.max) return 0;
        let count = 0;
        for (let i = 0; i < 2048; i++)
            if (this.counts[i]) count += this.counts[i] * D.Logistic(this.sums[i] / this.counts[i] / this.max, 0.5, 12);
        return count;
    }
}

export class FlashlightPeaks {
    constructor() {
        this.sum = 0;
        this.peak = 0;
        this.end = null;
        this.last = 0;
        this.lastTime = 0;
    }
    process(time, strain) {
        this.end ??= Math.ceil(time / 400) * 400;
        while (time > this.end) {
            this.sum += this.peak;
            this.peak = this.last * 0.15 ** ((this.end - this.lastTime) / 1000);
            this.end += 400;
        }
        this.peak = Math.max(this.peak, strain);
        this.last = strain;
        this.lastTime = time;
    }
    difficulty(count) {
        return (
            (this.sum + this.peak) *
            (0.7 + 0.1 * Math.min(1, count / 200) + (count > 200 ? 0.2 * Math.min(1, (count - 200) / 200) : 0))
        );
    }
}
