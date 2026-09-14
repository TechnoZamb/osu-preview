import { decode } from './beatmap.js';
import { canonicalMods, prepare } from './objects.js';
import { Skills, AimPeaks, HarmonicSum, FlashlightPeaks } from './skills.js';
import { aimRating, rating, localDifficulty, perfectPerformance } from './performance.js';

export function calculateStrains(map, modList = [], durationMs = 0) {
    const mods = new Set(canonicalMods(modList));
    if (typeof map === 'string') map = decode(map);
    const { difficulties, objects, settings } = prepare(map, mods),
        skills = new Skills(mods);
    const count = objects.length,
        times = new Float64Array(count),
        ends = new Float64Array(count),
        kinds = new Uint8Array(count);
    const channels = Array.from({ length: 4 }, () => new Float64Array(count));
    let duration = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
    for (let i = 0; i < count; i++) {
        times[i] = objects[i].StartTime;
        ends[i] = objects[i].EndTime;
        kinds[i] = objects[i].isSpinner ? 2 : objects[i].isSlider ? 1 : 0;
        duration = Math.max(duration, ends[i]);
    }
    if (duration > 21600000) throw new Error('Beatmap duration is too long to preview');
    for (let i = 0; i < difficulties.length; i++) {
        const values = skills.process(difficulties[i]);
        for (let channel = 0; channel < 4; channel++) channels[channel][i + 1] = values[channel];
    }
    // Fixed audio-time buckets for drawing only; official skill evaluation remains per object.
    const bucketMs = Math.max(250, duration / 12000),
        graph = new Float32Array(Math.ceil(duration / bucketMs) + 1);
    for (let i = 1; i < count; i++) {
        const index = Math.max(0, Math.floor(times[i] / bucketMs));
        graph[index] = Math.max(graph[index], localDifficulty(...channels.map((a) => a[i])));
        const next = i + 1 < count ? times[i + 1] : Math.min(duration, ends[i] + 3000);
        for (let j = index + 1; j * bucketMs < next && j < graph.length; j++) {
            const elapsed = (j * bucketMs - times[i]) / settings.rate / 1000;
            if (elapsed > 12) break;
            const values = channels.map((a, k) => a[i] * [0.2, 0.3, 0.8, 0.15][k] ** elapsed);
            graph[j] = Math.max(graph[j], localDifficulty(...values));
        }
    }

    const gaps = [];
    let coveredUntil = 0;
    for (let i = 0; i < count; i++) {
        const start = Math.max(0, times[i]);
        if (
            start > coveredUntil &&
            (i === 0 ||
                (start - coveredUntil) / settings.rate >= 1000 ||
                (map.breaks ?? []).some(([a, b]) => a < start && b > coveredUntil))
        )
            gaps.push([coveredUntil, start]);
        coveredUntil = Math.max(coveredUntil, ends[i]);
    }
    if (coveredUntil < duration) gaps.push([coveredUntil, duration]);
    return {
        gaps,
        durationMs: duration,
        bucketMs,
        graph,
        times,
        ends,
        kinds,
        channels,
        settings,
    };
}

export function calculatePP(trace) {
    const { times, ends, channels, kinds, settings } = trace,
        n = times.length;
    const aim = new AimPeaks(),
        speed = new HarmonicSum(20, n),
        reading = new HarmonicSum(1, n),
        fl = new FlashlightPeaks();
    const positiveReading = [],
        ppTimes = [0],
        ppValues = [0],
        counts = { total: 0, circles: 0 };
    const interval = Math.max(1000, trace.durationMs / 600);
    const reducedUntil = n > 1 ? times[1] / settings.rate + 60000 : Infinity;
    let reducedCount = 0,
        fixedReading = false,
        nextSnapshot = 0,
        completion = 0;
    for (let i = 0; i < n; i++) {
        counts.total++;
        if (kinds[i] === 0) counts.circles++;
        completion = Math.max(completion, ends[i]);
        if (i > 0) {
            const time = times[i] / settings.rate;
            aim.process(time, channels[0][i]);
            speed.add(channels[1][i]);
            fl.process(time, channels[3][i]);
            if (time <= reducedUntil) reducedCount++;
            const value = channels[2][i];
            if (value > 0) {
                const index = positiveReading.length;
                positiveReading.push(value);
                if (fixedReading)
                    reading.add(index < reducedCount ? value * Math.log10(1 + (9 * index) / reducedCount) : value);
            }
        }
        if (completion >= nextSnapshot || i === n - 1) {
            if (!fixedReading) {
                reading.clear();
                positiveReading.forEach((v, j) =>
                    reading.add(j < reducedCount ? v * Math.log10(1 + (9 * j) / reducedCount) : v),
                );
                if (times[i] / settings.rate > reducedUntil) fixedReading = true;
            }
            const attributes = {
                aim: aimRating(aim.difficulty()),
                speed: rating(speed.difficulty()),
                reading: rating(reading.difficulty()),
                flashlight: rating(fl.difficulty(counts.total)),
                speedNotes: speed.relevantCount(),
            };
            const value = perfectPerformance(attributes, counts, settings);
            if (!Number.isFinite(value)) throw new Error('Could not estimate PP for this map');
            if (completion === ppTimes.at(-1)) ppValues[ppValues.length - 1] = value;
            else {
                ppTimes.push(completion);
                ppValues.push(value);
            }
            nextSnapshot = completion + interval;
        }
    }
    return {
        times: Float64Array.from(ppTimes),
        values: Float32Array.from(ppValues),
    };
}
