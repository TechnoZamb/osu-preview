// Perfect classic-score subset: no misses, dropped sliders or replay judgments.
import { DiffUtils as D, erf, erfInv } from './math.js';
export const aimRating = (value) => value ** 0.63 * 0.02275;
export const rating = (value) => Math.sqrt(value) * 0.0675;
function cognition(reading, flashlight) {
    if (!reading || !flashlight) return reading + flashlight;
    return D.Norm(1.1, reading, flashlight * D.Clamp(flashlight / reading, 0.25, 1));
}
export function localDifficulty(aim, speed, reading, flashlight) {
    return Math.cbrt(
        1.12 *
            D.Norm(
                1.1,
                4 * aimRating(aim) ** 3,
                4 * rating(speed) ** 3,
                cognition(4 * rating(reading) ** 3, 25 * rating(flashlight) ** 2),
            ),
    );
}
export function perfectPerformance(attrs, counts, settings) {
    const n = counts.total;
    if (!n) return 0;
    const aim =
        4 * attrs.aim ** 3 * (0.95 + 0.35 * Math.min(1, n / 2000) + (n > 2000 ? Math.log10(n / 2000) * 0.5 : 0));
    let speed = 4 * attrs.speed ** 3;
    if (speed > 0) {
        const relevant = Math.max(1, attrs.speedNotes + (n - attrs.speedNotes) * 0.1);
        const p = relevant / (relevant + 2.32634787404 ** 2);
        const great = (79.5 - 6 * settings.od) / settings.rate,
            ok = (139.5 - 8 * settings.od) / settings.rate;
        let deviation = p > 0.01 ? great / (Math.SQRT2 * erfInv(p)) : ok / Math.sqrt(3);
        if (p > 0.01)
            deviation *= Math.sqrt(
                Math.max(
                    0,
                    1 -
                        (Math.sqrt(2 / Math.PI) * ok * Math.exp(-0.5 * (ok / deviation) ** 2)) /
                            (deviation * erf(ok / (Math.SQRT2 * deviation))),
                ),
            );
        const cutoff = 100 + 220 * (22 / deviation) ** 6.5;
        if (speed > cutoff)
            speed = D.Lerp(
                50 * (Math.log((speed - cutoff) / 50 + 1) + cutoff / 50),
                speed,
                1 - D.ReverseLerp(deviation, 22, 27),
            );
        speed *= erf((20 * (4 / attrs.speed) ** 0.35) / deviation) ** 2;
    }
    const od = (79.5 - (79.5 - 6 * settings.od) / settings.rate) / 6;
    const accuracy = counts.circles
        ? 1.52163 ** od * 2.83 * (counts.circles / 1000) ** (counts.circles < 1000 ? 0.3 : 0.1)
        : 0;
    return 1.12 * D.Norm(1.1, aim, speed, accuracy, cognition(4 * attrs.reading ** 3, 25 * attrs.flashlight ** 2));
}
