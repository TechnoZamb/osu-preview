import { osuToPixelsX, osuToPixelsY, margins, bezierSegmentMaxLengthSqrd } from "./render.js";
import { beatmap } from "./index.js";
import { mod, lerp } from "./functions.js";

let factorialsLUT;      // factorials look-up table
let bakedPaths = [];

window.addEventListener("load", async () => {
    factorialsLUT = await fetch("factorials.json").then(r => r.json());
});

export function drawSlider(obj, length, draw = true, bufferCtx) {
    if (draw && length == 0) {
        return [obj[0], obj[1]];
    }

    // linear
    if (obj[5][0] == "L") {
        var actualLength = 0, prevLength = 0;
        var prevObj = obj;

        for (let i = 1; i < obj[5].length; i++) {
            const point = obj[5][i];
            actualLength += Math.sqrt(Math.pow(point[0] - prevObj[0], 2) + Math.pow(point[1] - prevObj[1], 2));

            if (actualLength > length) {
                const ratio = (length - prevLength) / (actualLength - prevLength);
                if (draw) {
                    bufferCtx.lineTo(osuToPixelsX(prevObj[0] + (point[0] - prevObj[0]) * ratio) + margins[0], osuToPixelsY(prevObj[1] + (point[1] - prevObj[1]) * ratio) + margins[1]);
                    break;
                }
                else {
                    return [prevObj[0] + (point[0] - prevObj[0]) * ratio, prevObj[1] + (point[1] - prevObj[1]) * ratio, Math.atan2(point[1] - prevObj[1], point[0] - prevObj[0])];
                }
            }
            else {
                if (draw)
                    bufferCtx.lineTo(osuToPixelsX(point[0]) + margins[0], osuToPixelsY(point[1]) + margins[1]);
            }

            prevObj = point;
            prevLength = actualLength;
        }

        if (actualLength < length) {
            const point = obj[5].at(-1);
            prevObj = obj[5].length > 2 ? obj[5].at(-2) : obj;

            prevLength = actualLength - Math.sqrt(Math.pow(point[0] - prevObj[0], 2) + Math.pow(point[1] - prevObj[1], 2));
            const ratio = (length - prevLength) / (actualLength - prevLength);
            if (draw)
                bufferCtx.lineTo(osuToPixelsX(prevObj[0] + (point[0] - prevObj[0]) * ratio) + margins[0], osuToPixelsY(prevObj[1] + (point[1] - prevObj[1]) * ratio) + margins[1]);
            else
                return [prevObj[0] + (point[0] - prevObj[0]) * ratio, prevObj[1] + (point[1] - prevObj[1]) * ratio, Math.atan2(point[1] - prevObj[1], point[0] - prevObj[0])];
        }

        if (!draw) {
            const lastPoint = obj[5].at(-1);
            return [lastPoint[0], lastPoint[1], Math.atan2(lastPoint[1] - obj[1], lastPoint[0] - obj[0])];
        }
    }
    // perfect circle
    else if (obj[5][0] == "P" && obj[5].length == 3) {
        // https://stackoverflow.com/a/22793494/8414010
        const a = [obj[0], obj[1]];
        const b = [obj[5][1][0], obj[5][1][1]];
        const c = [obj[5][2][0], obj[5][2][1]];
        const x1 = 2 * (a[0] - b[0]) || 0.00001;
        const y1 = 2 * (a[1] - b[1]);
        const z1 = a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1];
        const x2 = 2 * (a[0] - c[0]);
        const y2 = 2 * (a[1] - c[1]);
        const z2 = a[0] * a[0] + a[1] * a[1] - c[0] * c[0] - c[1] * c[1];

        var y = (z2 - (x2 * z1) / x1) / (y2 - (x2 * y1) / x1);
        var x = (z1 - y1 * y) / x1;

        const r = Math.sqrt((a[0] - x) * (a[0] - x) + (a[1] - y) * (a[1] - y));
        const anglea = Math.atan2(a[1] - y, a[0] - x);
        var anglec = Math.atan2(c[1] - y, c[0] - x);
        const det = determinant([[a[0], a[1], 1], [b[0], b[1], 1], [c[0], c[1], 1]]);

        // if determinant = 0, the three points are in a straight line, so handle the slider as if it was a linear slider
        if (det == 0) {
            obj[5][0] = "L";
            drawSlider(obj, length, draw);
            return;
        }

        const arclength = r * (det < 0 ? mod(anglea - anglec, 2 * Math.PI) : mod(anglec - anglea, 2 * Math.PI));
        var xincr = null, yincr = null;
        if (arclength > length) {
            anglec = anglea + length / r * (det > 0 ? 1 : -1);
        }
        else {
            const slope = 1 / Math.tan(anglec);
            xincr = Math.sqrt(Math.pow(length - arclength, 2) / (1 + slope * slope)) * (anglec < 0 ? -1 : 1);
            yincr = xincr * slope * (anglec < Math.PI ? -1 : 1);
        }

        if (draw) {
            bufferCtx.arc(osuToPixelsX(x) + margins[0], osuToPixelsY(y) + margins[1], osuToPixelsX(r), anglea, anglec, det < 0);
            if (xincr)
                bufferCtx.lineTo(osuToPixelsX(c[0] + xincr) + margins[0], osuToPixelsY(c[1] + yincr) + margins[1]);
        }
        else {
            if (xincr) {
                return [c[0] + xincr, c[1] + yincr, Math.atan2(yincr, xincr)];
            }
            else {
                const endp = [x + Math.cos(anglec) * r, y + Math.sin(anglec) * r];
                // if ball angle at start of slider is > 0, draw ball flipped
                const flipped = det < 0 ? anglea < 0 : anglea > 0;
                return [endp[0], endp[1], Math.atan2(endp[1] - y, endp[0] - x) + Math.PI / 2 * (det > 0 ? 1 : -1), flipped];
            }
        }
    }
    // bezier curve
    else if (obj[5][0] == "B" || (obj[5][0] == "P" && obj[5].length > 3)) {
        const controlPoints = [[obj[0], obj[1]], ...obj[5].slice(1)];
        var pointsBuffer = [controlPoints[0]];

        var actualLength = 0, prevLength = 0;
        var prevObj = obj;

        for (let i = 1; i < controlPoints.length + 1; i++) {
            if (i == controlPoints.length || controlPoints[i][0] == controlPoints[i - 1][0] && controlPoints[i][1] == controlPoints[i - 1][1]) {

                if (pointsBuffer.length == 2) {
                    const point = pointsBuffer.at(-1);
                    actualLength += Math.sqrt(Math.pow(point[0] - prevObj[0], 2) + Math.pow(point[1] - prevObj[1], 2));

                    if (actualLength > length) {
                        const ratio = (length - prevLength) / (actualLength - prevLength);
                        if (draw) {
                            bufferCtx.lineTo(osuToPixelsX(prevObj[0] + (point[0] - prevObj[0]) * ratio) + margins[0], osuToPixelsY(prevObj[1] + (point[1] - prevObj[1]) * ratio) + margins[1]);
                            break; // out
                        }
                        else {
                            return [prevObj[0] + (point[0] - prevObj[0]) * ratio, prevObj[1] + (point[1] - prevObj[1]) * ratio, Math.atan2(point[1] - prevObj[1], point[0] - prevObj[0])];
                        }
                    }
                    else {
                        if (draw)
                            bufferCtx.lineTo(osuToPixelsX(point[0]) + margins[0], osuToPixelsY(point[1]) + margins[1]);
                    }

                    prevObj = point;
                    prevLength = actualLength;
                }
                else if (pointsBuffer.length > 2) {
                    var points, lengths;
                    const index = beatmap.HitObjects.indexOf(obj);

                    if (!bakedPaths[index]) {
                        bakedPaths[index] = [];
                    }
                    if (!bakedPaths[index][i]) {
                        [points, lengths] = bakedPaths[index][i] = bezierPoints(pointsBuffer);
                    }
                    else {
                        [points, lengths] = bakedPaths[index][i];
                    }

                    for (let j = 0; j < points.length; j++) {
                        // we have surpassed the desired length
                        if (actualLength + lengths[j] > length) {
                            const prevp = points[j - 1] ?? pointsBuffer[0];
                            const prevl = lengths[j - 1] ?? 0;
                            const ratio = (length - (prevl + actualLength)) / (lengths[j] - prevl);
                            if (draw) {
                                bufferCtx.lineTo(osuToPixelsX(lerp(prevp[0], points[j][0], ratio)) + margins[0], osuToPixelsY(lerp(prevp[1], points[j][1], ratio)) + margins[1]);
                                return;
                            }
                            else {
                                return [lerp(prevp[0], points[j][0], ratio), lerp(prevp[1], points[j][1], ratio), Math.atan2(points[j][1] - prevp[1], points[j][0] - prevp[0])];
                            }
                        }
                        // not reached desired length yet; keep drawing
                        else {
                            if (draw)
                                bufferCtx.lineTo(osuToPixelsX(points[j][0]) + margins[0], osuToPixelsY(points[j][1]) + margins[1]);
                        }
                    }

                    // not reached desired length yet
                    prevObj = points.at(-1);
                    actualLength += lengths.at(-1);
                    prevLength = actualLength;
                }

                pointsBuffer = [];
            }

            pointsBuffer.push(controlPoints[i]);
        }

        if (!draw) {
            return obj[5].at(-1);
        }
        else {
        }
    }

    return [0, 0];
}
export function getFollowPosition(obj, length) {
    return drawSlider(obj, length, false);
}

export function getSliderTicks(obj) {
    var ticks = [];
    for (let i = obj.at(-3) / beatmap.Difficulty.SliderTickRate; i < obj.at(-2); i += obj.at(-3) / beatmap.Difficulty.SliderTickRate) {
        if (i < obj.at(-2) - obj.at(-3) / 4 - 0.001) ticks.push(i);
    }
    return ticks;
}

const bezierPoints = (points, start = 0, end = 1) => {
    const arr = [], lengths = [];

    const _bezierPoints = (start, end, minDivs) => {
        const startP = bezierAt(points, start);
        const endP = bezierAt(points, end);
        const length = Math.pow(startP[0] - endP[0], 2) + Math.pow(startP[1] - endP[1], 2);

        if (minDivs > 0 || length > bezierSegmentMaxLengthSqrd) {
            _bezierPoints(start, (start + end) / 2, minDivs - 1);
            _bezierPoints((start + end) / 2, end, minDivs - 1);
        }
        else {
            arr.push(endP);
            lengths.push((lengths.at(-1) ?? 0) + Math.sqrt(length));
        }
    };
    _bezierPoints(start, end, 2);

    return [arr, lengths];
}

const bezierAt = (points, t) => {
    var r = [0, 0];
    var n = points.length - 1;
    for (let i = 0; i <= n; i++) {
        r[0] += points[i][0] * bernstain(i, n, t);
        r[1] += points[i][1] * bernstain(i, n, t);
    }
    return r;
}

const fact = (n) => {
    if (n == 0 || n == 1)
        return 1;
    if (factorialsLUT[n] > 0)
        return factorialsLUT[n];
    return factorialsLUT[n] = fact(n - 1) * n;
}

const bernstain = (i, n, t) => {
    return fact(n) / (fact(i) * fact(n - i)) * Math.pow(t, i) * Math.pow(1 - t, n - i);
}

// https://stackoverflow.com/a/57696101/8414010
const determinant = (m) => {
    if (m.length == 1)
        return m[0][0];
    else if (m.length == 2)
        return m[0][0] * m[1][1] - m[0][1] * m[1][0];
    else
        return m[0].reduce((r, e, i) =>
            r + (-1) ** (i + 2) * e * determinant(m.slice(1).map(c =>
                c.filter((_, j) => i != j))), 0);
}
