export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const DiffUtils = {
    Pow: Math.pow,
    Clamp: clamp,
    Lerp: (a, b, t) => a + (b - a) * t,
    DegreesToRadians: (x) => (x * Math.PI) / 180,
    ReverseLerp: (x, a, b) => clamp((x - a) / (b - a)),
    Smoothstep(x, a, b) {
        x = this.ReverseLerp(x, a, b);
        return x * x * (3 - 2 * x);
    },
    Smootherstep(x, a, b) {
        x = this.ReverseLerp(x, a, b);
        return x ** 3 * (x * (6 * x - 15) + 10);
    },
    SmoothstepBellCurve(x) {
        x = clamp((0.5 - Math.abs(x - 0.5)) * 2);
        return x * x * (3 - 2 * x);
    },
    Logistic(x, midpoint, multiplier, max = 1) {
        return midpoint === undefined ? 1 / (1 + Math.exp(x)) : max / (1 + Math.exp(multiplier * (midpoint - x)));
    },
    Norm: (p, ...values) => values.reduce((sum, x) => sum + x ** p, 0) ** (1 / p),
    MillisecondsToBPM: (ms, delimiter = 4) => 60000 / (ms * delimiter),
    BPMToMilliseconds: (bpm, delimiter = 4) => 60000 / (bpm * delimiter),
};
export const Vector2 = { Distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y) };
export const point = (x, y) => ({ x, y });
export const lerpPoint = (a, b, t) => point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const distance = Vector2.Distance;

// Bounded error-function approximation for the estimated perfect-play counter.
export function erf(x) {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    return (
        sign *
        (1 -
            ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
                t *
                Math.exp(-x * x))
    );
}
export function erfInv(x) {
    let lo = 0,
        hi = 8;
    for (let i = 0; i < 35; i++) {
        const m = (lo + hi) / 2;
        if (erf(m) < x) lo = m;
        else hi = m;
    }
    return (lo + hi) / 2;
}
