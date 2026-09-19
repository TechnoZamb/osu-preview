// Slider flattening and legacy edge cases are approximate; original timestamps are preserved.
import { clamp, point, distance, lerpPoint, DiffUtils } from './math.js';
import { pathPosition } from './beatmap.js';

export function canonicalMods(input = []) {
    const mods = new Set(input.map((m) => m.toLowerCase()));
    for (const mod of mods)
        if (!['ez', 'hr', 'ht', 'dt', 'hd', 'fl'].includes(mod)) throw new Error(`Unsupported mod: ${mod}`);
    if ((mods.has('ez') && mods.has('hr')) || (mods.has('dt') && mods.has('ht'))) throw new Error('Incompatible mods');
    return [...mods].sort();
}
function settingsFor(map, mods) {
    const factor = mods.has('ez') ? 0.5 : mods.has('hr') ? 1.4 : 1;
    const cs = clamp(map.difficulty.CircleSize * (mods.has('ez') ? 0.5 : mods.has('hr') ? 1.3 : 1), 0, 10);
    const ar = clamp(map.difficulty.ApproachRate * factor, 0, 10),
        od = clamp(map.difficulty.OverallDifficulty * factor, 0, 10);
    return {
        rate: mods.has('dt') ? 1.5 : mods.has('ht') ? 0.75 : 1,
        radius: 54.4 - 4.48 * cs,
        preempt: ar < 5 ? 1800 - 120 * ar : 1200 - 150 * (ar - 5),
        od,
    };
}
function sliderPosition(raw, elapsed) {
    if (!raw.isSlider || raw.spanDuration <= 0) return point(raw.x, raw.y);
    let progress = clamp(elapsed / raw.spanDuration, 0, raw.repeats + 1);
    progress = progress % 2 > 1 ? 1 - (progress % 1) : progress % 1;
    // At exact odd span ends, progress is one, rather than modulo zero.
    const span = elapsed / raw.spanDuration;
    if (Number.isInteger(span)) progress = span % 2;
    return pathPosition(raw.path, progress);
}
function stack(objects, map, settings) {
    const threshold = settings.preempt * map.general.StackLeniency;
    if (map.version < 6) {
        for (let i = 0; i < objects.length; i++) {
            const a = objects[i];
            if (a.isSpinner || (a.stack && !a.isSlider)) continue;
            let end = a.EndTime,
                sliderStack = 0;
            for (let j = i + 1; j < objects.length; j++) {
                const b = objects[j];
                if (b.StartTime - threshold > end) break;
                if (distance(a.Position, b.Position) < 3) {
                    a.stack++;
                    end = b.EndTime;
                } else if (distance(a.EndPosition, b.Position) < 3) {
                    b.stack -= ++sliderStack;
                    end = b.EndTime;
                }
            }
        }
    } else {
        for (let i = objects.length - 1; i > 0; i--) {
            let a = objects[i];
            if (a.stack || a.isSpinner) continue;
            for (let n = i - 1; n >= 0; n--) {
                const b = objects[n];
                if (b.isSpinner) continue;
                if (a.StartTime - threshold > (a.isSlider ? b.StartTime : b.EndTime)) break;
                if (!a.isSlider && b.isSlider && distance(b.EndPosition, a.Position) < 3) {
                    const offset = a.stack - b.stack + 1;
                    for (let j = n + 1; j <= i; j++)
                        if (distance(b.EndPosition, objects[j].Position) < 3) objects[j].stack -= offset;
                    break;
                }
                if (distance(a.isSlider ? b.EndPosition : b.Position, a.Position) < 3) {
                    b.stack = a.stack + 1;
                    a = b;
                }
            }
        }
    }
    for (const obj of objects) {
        const offset = (obj.stack * settings.radius) / 10;
        obj.StackedPosition = point(obj.Position.x - offset, obj.Position.y - offset);
        obj.StackedEndPosition = point(obj.EndPosition.x - offset, obj.EndPosition.y - offset);
        obj.positionAt = (elapsed) => {
            const p = sliderPosition(obj.raw, elapsed);
            return point(p.x - offset, (obj.hr ? 384 - p.y : p.y) - offset);
        };
    }
}
export function prepare(map, mods) {
    const settings = settingsFor(map, mods);
    const objects = map.objects.map((raw) => {
        const transform = (p) => point(p.x, mods.has('hr') ? 384 - p.y : p.y);
        return {
            raw,
            hr: mods.has('hr'),
            StartTime: raw.start,
            EndTime: raw.end,
            isSlider: raw.isSlider,
            isSpinner: raw.isSpinner,
            Radius: settings.radius,
            Position: transform(point(raw.x, raw.y)),
            EndPosition: transform(sliderPosition(raw, raw.end - raw.start)),
            RepeatCount: raw.repeats,
            stack: 0,
        };
    });
    stack(objects, map, settings);
    const difficulties = [];
    for (let i = 1; i < objects.length; i++)
        difficulties.push(new DifficultyObject(objects[i], objects[i - 1], settings, difficulties, i - 1));
    return { objects, difficulties, settings };
}
function angle(a, b, c) {
    const x1 = a.x - b.x,
        y1 = a.y - b.y,
        x2 = c.x - b.x,
        y2 = c.y - b.y;
    return Math.abs(Math.atan2(x1 * y2 - y1 * x2, x1 * x2 + y1 * y2));
}
export class DifficultyObject {
    static NORMALISED_RADIUS = 50;
    static NORMALISED_DIAMETER = 100;
    constructor(obj, last, settings, list, index) {
        this.BaseObject = obj;
        this.LastObject = last;
        this.list = list;
        this.Index = index;
        this.ClockRate = settings.rate;
        this.StartTime = obj.StartTime / settings.rate;
        this.EndTime = obj.EndTime / settings.rate;
        this.DeltaTime = (obj.StartTime - last.StartTime) / settings.rate;
        this.AdjustedDeltaTime = Math.max(25, this.DeltaTime);
        this.LastObjectEndDeltaTime = this.Previous()
            ? Math.max(25, this.StartTime - this.Previous().EndTime)
            : this.AdjustedDeltaTime;
        this.HitWindowGreat = (2 * (79.5 - 6 * settings.od)) / settings.rate;
        this.OverallDifficulty = (79.5 - this.HitWindowGreat / 2) / 6;
        this.Preempt = settings.preempt / settings.rate;
        this.rawPreempt = settings.preempt;
        this.SmallCircleBonus = Math.max(1, 1 + (30 - obj.Radius) / 70);
        this.JumpDistance =
            this.LazyJumpDistance =
            this.MinimumJumpDistance =
            this.TravelDistance =
            this.TravelTime =
            this.LazyTravelDistance =
            this.LazyTravelTime =
                0;
        this.MinimumJumpTime = this.AdjustedDeltaTime;
        this.Angle = this.NormalisedVectorAngle = null;
        this.LazyEndPosition = obj.StackedPosition;
        if (obj.isSlider) this.computeSlider();
        if (obj.isSpinner || last.isSpinner) return;
        const scale = 50 / obj.Radius,
            previous = this.Previous();
        let lastCursor = previous?.LazyEndPosition ?? last.StackedPosition;
        this.JumpDistance = distance(last.StackedPosition, obj.StackedPosition) * scale;
        this.LazyJumpDistance = distance(lastCursor, obj.StackedPosition) * scale;
        this.MinimumJumpDistance = this.LazyJumpDistance;
        if (last.isSlider && previous) {
            this.MinimumJumpTime = Math.max(
                25,
                this.AdjustedDeltaTime - Math.max(25, previous.LazyTravelTime / settings.rate),
            );
            this.MinimumJumpDistance = Math.max(
                0,
                Math.min(
                    this.LazyJumpDistance - 30,
                    distance(last.StackedEndPosition, obj.StackedPosition) * scale - 120,
                ),
            );
        }
        const prior = this.Previous(1);
        if (prior && !prior.BaseObject.isSpinner) {
            if (last.isSlider && previous.TravelDistance > 0) lastCursor = last.StackedPosition;
            this.Angle = angle(prior.LazyEndPosition, lastCursor, obj.StackedPosition);
            if (last.isSlider && previous.TravelDistance > 0 && previous.secondLastNested)
                this.Angle = Math.min(
                    this.Angle,
                    angle(previous.secondLastNested, last.StackedPosition, obj.StackedPosition),
                );
            this.NormalisedVectorAngle = Math.atan2(
                Math.abs(obj.StackedPosition.y - lastCursor.y),
                Math.abs(obj.StackedPosition.x - lastCursor.x),
            );
        }
    }
    Previous(skip = 0) {
        return this.list[this.Index - skip - 1] ?? null;
    }
    Next(skip = 0) {
        return this.list[this.Index + skip + 1] ?? null;
    }
    OpacityAt(time, hidden) {
        if (time > this.BaseObject.StartTime) return 0;
        const start = this.BaseObject.StartTime - this.rawPreempt;
        const fade = 400 * Math.min(1, this.rawPreempt / 450);
        if (hidden)
            return Math.min(
                clamp((time - start) / fade),
                1 - clamp((time - start - this.rawPreempt * 0.4) / (this.rawPreempt * 0.3)),
            );
        return clamp((time - start) / fade);
    }
    CalculateDoubleTapFeasibility(next) {
        if (!next) return 0;
        const dt = Math.max(1, this.DeltaTime),
            ndt = Math.max(1, next.DeltaTime);
        const speedRatio = dt / Math.max(dt, Math.abs(ndt - dt));
        const window = Math.min(1, dt / this.HitWindowGreat) ** 5;
        const factor = DiffUtils.ReverseLerp(this.LazyJumpDistance, 100, 50) ** 2;
        return 1 - speedRatio ** (factor * (1 - window));
    }
    computeSlider() {
        const obj = this.BaseObject,
            raw = obj.raw,
            duration = obj.EndTime - obj.StartTime;
        let trackingEnd = Math.max(duration - 36, duration / 2);
        const events = [];
        const ticks = raw.generateTicks ? Math.min(1000, Math.ceil(raw.path.length / raw.tickDistance)) : 0;
        if (ticks * (raw.repeats + 1) > 20000) throw new Error('Slider has too many ticks to preview');
        for (let span = 0; span <= raw.repeats; span++) {
            for (let tick = 1; tick < ticks; tick++) {
                const t = (raw.spanDuration * tick * raw.tickDistance) / Math.max(1e-9, raw.path.length);
                if (t >= raw.spanDuration - 10) break;
                events.push({ time: span * raw.spanDuration + t, repeat: false });
            }
            if (span < raw.repeats) events.push({ time: (span + 1) * raw.spanDuration, repeat: true });
        }
        if (events.length) trackingEnd = Math.max(trackingEnd, events.at(-1).time);
        this.LazyTravelTime = trackingEnd;
        const lazyTarget = obj.positionAt(trackingEnd);
        events.push({ time: duration, repeat: false, tail: true });
        this.secondLastNested = obj.positionAt(events.at(-2)?.time ?? 0);
        let cursor = obj.StackedPosition;
        const scale = 50 / obj.Radius;
        for (const event of events) {
            let target = obj.positionAt(event.time);
            if (event.tail && distance(cursor, lazyTarget) < distance(cursor, target)) target = lazyTarget;
            const d = distance(cursor, target) * scale,
                radius = event.repeat ? 50 : 90;
            if (d > radius) {
                const portion = (d - radius) / d;
                cursor = lerpPoint(cursor, target, portion);
                this.LazyTravelDistance += d - radius;
            }
        }
        this.LazyEndPosition = cursor;
        this.TravelDistance = this.LazyTravelDistance * Math.max(1, raw.repeats ** 0.3);
        this.TravelTime = Math.max(25, trackingEnd / this.ClockRate);
    }
}
