import { clamp, point, lerpPoint, distance } from './math.js';

function flattenBezier(control, out, depth = 0) {
    if (out.length >= 4096) throw new Error('Slider path is too complex to preview');
    let flat = true;
    for (let i = 1; i < control.length - 1; i++) {
        if (
            Math.hypot(
                control[i - 1].x - 2 * control[i].x + control[i + 1].x,
                control[i - 1].y - 2 * control[i].y + control[i + 1].y,
            ) > 0.25
        ) {
            flat = false;
            break;
        }
    }
    if (flat || depth >= 12) {
        out.push(control.at(-1));
        return;
    }
    let row = control.slice();
    const left = [row[0]],
        right = [row.at(-1)];
    while (row.length > 1) {
        row = row.slice(1).map((p, i) => lerpPoint(row[i], p, 0.5));
        left.push(row[0]);
        right.push(row.at(-1));
    }
    flattenBezier(left, out, depth + 1);
    flattenBezier(right.reverse(), out, depth + 1);
}

function flattenPath(type, controls) {
    const out = [controls[0]];
    if (type === 'L') return controls;
    if (type === 'P' && controls.length === 3) {
        const [a, b, c] = controls;
        const det = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
        if (Math.abs(det) > 1e-7) {
            const aa = a.x ** 2 + a.y ** 2,
                bb = b.x ** 2 + b.y ** 2,
                cc = c.x ** 2 + c.y ** 2;
            const centre = point(
                (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / det,
                (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / det,
            );
            const radius = distance(a, centre),
                start = Math.atan2(a.y - centre.y, a.x - centre.x);
            let span = Math.atan2(c.y - centre.y, c.x - centre.x) - start;
            const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
            if (cross > 0 && span < 0) span += Math.PI * 2;
            if (cross < 0 && span > 0) span -= Math.PI * 2;
            const count = clamp(
                Math.ceil(Math.abs(span) / Math.max(0.005, 2 * Math.acos(clamp(1 - 0.25 / radius, -1, 1)))),
                2,
                2048,
            );
            for (let i = 1; i <= count; i++)
                out.push(
                    point(
                        centre.x + radius * Math.cos(start + (span * i) / count),
                        centre.y + radius * Math.sin(start + (span * i) / count),
                    ),
                );
            return out;
        }
    }
    if (type === 'C') {
        for (let i = 0; i < controls.length - 1; i++) {
            const p0 = controls[Math.max(0, i - 1)],
                p1 = controls[i],
                p2 = controls[i + 1];
            const p3 = controls[i + 2] ?? point(p2.x * 2 - p1.x, p2.y * 2 - p1.y);
            for (let j = 1; j <= 50; j++) {
                const t = j / 50;
                const f = (k) =>
                    0.5 *
                    (2 * p1[k] +
                        (-p0[k] + p2[k]) * t +
                        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t +
                        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t ** 3);
                out.push(point(f('x'), f('y')));
            }
        }
        return out;
    }
    let segment = [controls[0]];
    for (let i = 1; i < controls.length; i++) {
        segment.push(controls[i]);
        if (i === controls.length - 1 || distance(controls[i], controls[i + 1]) === 0) {
            if (segment.length > 1) flattenBezier(segment, out);
            segment = [controls[i]];
            if (i < controls.length - 1) i++;
        }
    }
    return out;
}

function makePath(type, controls, expectedLength) {
    const flat = flattenPath(type, controls),
        points = [flat[0]],
        lengths = [0];
    // Legacy files use zero to mean unspecified distance, retaining the natural curve length.
    if (!(expectedLength > 0)) expectedLength = flat.reduce((sum, p, i) => sum + (i ? distance(flat[i - 1], p) : 0), 0);
    let length = 0;
    for (let i = 1; i < flat.length; i++) {
        const d = distance(points.at(-1), flat[i]);
        if (d < 1e-9) continue;
        if (length + d >= expectedLength) {
            points.push(lerpPoint(points.at(-1), flat[i], (expectedLength - length) / d));
            lengths.push(expectedLength);
            length = expectedLength;
            break;
        }
        points.push(flat[i]);
        length += d;
        lengths.push(length);
    }
    if (length < expectedLength && points.length > 1) {
        const a = points.at(-2),
            b = points.at(-1),
            d = distance(a, b);
        points.push(lerpPoint(a, b, 1 + (expectedLength - length) / d));
        lengths.push(expectedLength);
    }
    return { points, lengths, length: lengths.at(-1) };
}
export function pathPosition(path, progress) {
    const length = clamp(progress) * path.length,
        a = path.lengths;
    let lo = 0,
        hi = a.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (a[mid] < length) lo = mid + 1;
        else hi = mid;
    }
    if (lo === 0) return path.points[0];
    return lerpPoint(path.points[lo - 1], path.points[lo], (length - a[lo - 1]) / Math.max(1e-9, a[lo] - a[lo - 1]));
}

export function decode(text) {
    if (typeof text !== 'string' || text.length > 16 * 1024 * 1024) throw new Error('Beatmap is too large to preview');
    const version = +(text.match(/osu file format v(\d+)/)?.[1] ?? 14);
    const difficulty = {
        HPDrainRate: 5,
        CircleSize: 5,
        OverallDifficulty: 5,
        SliderMultiplier: 1.4,
        SliderTickRate: 1,
    };
    const general = { StackLeniency: 0.7, Mode: 0 };
    const timing = [],
        raw = [],
        breaks = [];
    let section = '';
    for (const original of text.split(/\r?\n/)) {
        const line = original.trim();
        if (!line || line.startsWith('//')) continue;
        if (line.startsWith('[')) {
            section = line.slice(1, -1);
            continue;
        }
        if (section === 'Difficulty' || section === 'General') {
            const index = line.indexOf(':');
            if (index >= 0) {
                const value = +line.slice(index + 1);
                if (Number.isFinite(value))
                    (section === 'Difficulty' ? difficulty : general)[line.slice(0, index)] = value;
            }
        } else if (section === 'Events') {
            const fields = line.split(',');
            if (fields[0] === '2' || fields[0].toLowerCase() === 'break') {
                const start = +fields[1],
                    end = +fields[2];
                if (Number.isFinite(start) && Number.isFinite(end) && end > start) breaks.push([start, end]);
            }
        } else if (section === 'TimingPoints') timing.push(line.split(',').map(Number));
        else if (section === 'HitObjects') raw.push(line.split(','));
    }
    if (general.Mode !== 0) throw new Error('Strain preview supports osu!standard only');
    if (raw.length > 50000) throw new Error('Beatmap has too many objects to preview');
    difficulty.ApproachRate ??= difficulty.OverallDifficulty;
    timing.sort((a, b) => a[0] - b[0]);
    raw.sort((a, b) => +a[2] - +b[2]);
    let ti = 0,
        beatLength = 500,
        sv = 1,
        generateTicks = true;
    const objects = raw.map((fields) => {
        const x = +fields[0],
            y = +fields[1],
            start = +fields[2],
            kind = +fields[3];
        if (
            ![x, y, start, kind].every(Number.isFinite) ||
            Math.abs(x) > 1e6 ||
            Math.abs(y) > 1e6 ||
            Math.abs(start) > 21600000
        )
            throw new Error('Unsupported hit object');
        while (ti < timing.length && timing[ti][0] <= start) {
            const tp = timing[ti++];
            generateTicks = !Number.isNaN(tp[1]);
            if ((tp[6] ?? 1) && tp[1] > 0) {
                beatLength = tp[1];
                sv = 1;
            } else if (tp[1] < 0) sv = clamp(-100 / tp[1], 0.1, 10);
            else sv = 1;
        }
        const obj = { x, y, start, end: start, isSlider: !!(kind & 2), isSpinner: !!(kind & 8), repeats: 0 };
        if (obj.isSpinner) obj.end = Math.max(start, +fields[5] || start);
        else if (obj.isSlider) {
            const parts = (fields[5] ?? 'L').split('|'),
                type = parts.shift();
            const controls = [
                point(x, y),
                ...parts.map((s) => {
                    const [a, b] = s.split(':').map(Number);
                    return point(a, b);
                }),
            ];
            if (controls.length > 256 || !controls.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))
                throw new Error('Unsupported slider path');
            const length = clamp(+fields[7] || 0, 0, 100000);
            obj.repeats = clamp(Math.trunc(+fields[6] || 1), 1, 1000) - 1;
            obj.path = makePath(type, controls, length);
            obj.spanDuration = (obj.path.length / (100 * Math.max(0.1, difficulty.SliderMultiplier) * sv)) * beatLength;
            obj.end = start + obj.spanDuration * (obj.repeats + 1);
            obj.tickDistance =
                (100 * Math.max(0.1, difficulty.SliderMultiplier) * (version >= 8 ? sv : 1)) /
                Math.max(0.1, difficulty.SliderTickRate);
            obj.generateTicks = generateTicks;
        }
        if (obj.end > 21600000) throw new Error('Beatmap duration is too long to preview');
        return obj;
    });
    return { version, difficulty, general, objects, breaks };
}
