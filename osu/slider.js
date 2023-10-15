import { osuCoords2PixelsX, osuCoords2PixelsY, margins, bezierSegmentMaxLengthSqrd } from "/osu/render.js";
import { beatmap, activeMods } from "/osu/osu.js";
import { mod, lerp } from "/functions.js";

let factorialsLUT;      // factorials look-up table
let bakedPaths = [];

window.addEventListener("load", async () => {
    factorialsLUT = await fetch("factorials.json").then(r => r.json());
});

export function drawSlider(obj, length, draw = true, bufferCtx) {
    if (draw && length == 0) {
        return [obj.x, obj.y];
    }

    // linear
    if (obj.curveType == "L") {
        var actualLength = 0, prevLength = 0;
        var prevObj = obj;

        for (let i = 0; i < obj.curvePoints.length; i++) {
            const point = obj.curvePoints[0];
            actualLength += Math.sqrt(Math.pow(point.x - prevObj.x, 2) + Math.pow(point.y - prevObj.y, 2));

            if (actualLength > length) {
                const ratio = (length - prevLength) / (actualLength - prevLength);
                if (draw) {
                    bufferCtx.lineTo(osuCoords2PixelsX(prevObj.x + (point.x - prevObj.x) * ratio) + margins[0], osuCoords2PixelsY(prevObj.y + (point.y - prevObj.y) * ratio) + margins[1]);
                    break;
                }
                else {
                    return [prevObj.x + (point.x - prevObj.x) * ratio, prevObj.y + (point.y - prevObj.y) * ratio, Math.atan2(point.y - prevObj.y, point.x - prevObj.x)];
                }
            }
            else {
                if (draw)
                    bufferCtx.lineTo(osuCoords2PixelsX(point.x) + margins[0], osuCoords2PixelsY(point.y) + margins[1]);
            }

            prevObj = point;
            prevLength = actualLength;
        }

        if (actualLength < length) {
            const point = obj.curvePoints.at(-1);
            prevObj = obj.curvePoints.at(-2) ?? obj;

            prevLength = actualLength - Math.sqrt(Math.pow(point.x - prevObj.x, 2) + Math.pow(point.y - prevObj.y, 2));
            const ratio = (length - prevLength) / (actualLength - prevLength);
            if (draw)
                bufferCtx.lineTo(osuCoords2PixelsX(prevObj.x + (point.x - prevObj.x) * ratio) + margins[0], osuCoords2PixelsY(prevObj.y + (point.y - prevObj.y) * ratio) + margins[1]);
            else
                return [prevObj.x + (point.x - prevObj.x) * ratio, prevObj.y + (point.y - prevObj.y) * ratio, Math.atan2(point.y - prevObj.y, point.x - prevObj.x)];
        }

        if (!draw) {
            const lastPoint = obj.curvePoints.at(-1);
            return [lastPoint.x, lastPoint.y, Math.atan2(lastPoint.y - obj.y, lastPoint.x - obj.x)];
        }
    }
    // perfect circle
    else if (obj.curveType == "P" && obj.curvePoints.length == 2) {
        // https://stackoverflow.com/a/22793494/8414010
        const a = obj;
        const b = obj.curvePoints[0];
        const c = obj.curvePoints[1];
        const x1 = 2 * (a.x - b.x) || 0.00001;
        const y1 = 2 * (a.y - b.y);
        const z1 = a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y;
        const x2 = 2 * (a.x - c.x);
        const y2 = 2 * (a.y - c.y);
        const z2 = a.x * a.x + a.y * a.y - c.x * c.x - c.y * c.y;

        var y = (z2 - (x2 * z1) / x1) / (y2 - (x2 * y1) / x1);
        var x = (z1 - y1 * y) / x1;

        const r = Math.sqrt((a.x - x) * (a.x - x) + (a.y - y) * (a.y - y));
        const anglea = Math.atan2(a.y - y, a.x - x);
        var anglec = Math.atan2(c.y - y, c.x - x);
        const det = determinant([[a.x, a.y, 1], [b.x, b.y, 1], [c.x, c.y, 1]]);

        // if determinant = 0, the three points are in a straight line, so handle the slider as if it was a linear slider
        if (det == 0) {
            obj.curveType = "L";
            drawSlider(obj, length, draw, bufferCtx);
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
            bufferCtx.arc(osuCoords2PixelsX(x) + margins[0], osuCoords2PixelsY(y) + margins[1], osuCoords2PixelsX(r),
                anglea * (activeMods.has("hr") ? -1 : 1), anglec * (activeMods.has("hr") ? -1 : 1), ((det < 0) + activeMods.has("hr")) % 2);

            if (xincr) {
                bufferCtx.lineTo(osuCoords2PixelsX(c.x + xincr) + margins[0], osuCoords2PixelsY(c.y + yincr) + margins[1]);
            }
        }
        else {
            if (xincr) {
                return [c.x + xincr, c.y + yincr, Math.atan2(yincr, xincr)];
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
    else if (obj.curveType == "B" || (obj.curveType == "P" && obj.curvePoints.length > 2)) {
        const controlPoints = [obj, ...obj.curvePoints];
        var pointsBuffer = [controlPoints[0]];

        var actualLength = 0, prevLength = 0;
        var prevObj = obj;

        for (let i = 1; i < controlPoints.length + 1; i++) {
            if (i == controlPoints.length || controlPoints[i].x == controlPoints[i - 1].x && controlPoints[i].y == controlPoints[i - 1].y) {

                if (pointsBuffer.length == 2) {
                    const point = pointsBuffer.at(-1);
                    actualLength += Math.sqrt(Math.pow(point.x - prevObj.x, 2) + Math.pow(point.y - prevObj.y, 2));

                    if (actualLength > length) {
                        const ratio = (length - prevLength) / (actualLength - prevLength);
                        if (draw) {
                            bufferCtx.lineTo(osuCoords2PixelsX(prevObj.x + (point.x - prevObj.x) * ratio) + margins[0], osuCoords2PixelsY(prevObj.y + (point.y - prevObj.y) * ratio) + margins[1]);
                            break; // out
                        }
                        else {
                            return [prevObj.x + (point.x - prevObj.x) * ratio, prevObj.y + (point.y - prevObj.y) * ratio, Math.atan2(point.y - prevObj.y, point.x - prevObj.x)];
                        }
                    }
                    else {
                        if (draw)
                            bufferCtx.lineTo(osuCoords2PixelsX(point.x) + margins[0], osuCoords2PixelsY(point.y) + margins[1]);
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
                            const prevp = points[j - 1] ?? [pointsBuffer[0].x, pointsBuffer[0].y];
                            const prevl = lengths[j - 1] ?? 0;
                            const ratio = (length - (prevl + actualLength)) / (lengths[j] - prevl);
                            if (draw) {
                                bufferCtx.lineTo(osuCoords2PixelsX(lerp(prevp[0], points[j][0], ratio)) + margins[0], osuCoords2PixelsY(lerp(prevp[1], points[j][1], ratio)) + margins[1]);
                                return;
                            }
                            else {
                                return [lerp(prevp[0], points[j][0], ratio), lerp(prevp[1], points[j][1], ratio), Math.atan2(points[j][1] - prevp[1], points[j][0] - prevp[0])];
                            }
                        }
                        // not reached desired length yet; keep drawing
                        else {
                            if (draw)
                                bufferCtx.lineTo(osuCoords2PixelsX(points[j][0]) + margins[0], osuCoords2PixelsY(points[j][1]) + margins[1]);
                        }
                    }

                    // not reached desired length yet
                    prevObj = points.at(-1);
                    prevObj = { x: prevObj[0], y: prevObj[1] }
                    actualLength += lengths.at(-1);
                    prevLength = actualLength;
                }

                pointsBuffer = [];
            }

            pointsBuffer.push(controlPoints[i]);
        }

        if (!draw) {
            return obj.curvePoints.at(-1);
        }
        else {
        }
    }

    return [0, 0, 0];
}

export function getFollowPosition(obj, length) {
    return drawSlider(obj, length, false);
}

export function getSliderTicks(obj, includeEdge) {
    var ticks = [];
    for (let i = obj.beatLength / beatmap.Difficulty.SliderTickRate; i < obj.duration; i += obj.beatLength / beatmap.Difficulty.SliderTickRate) {
        if (i < (includeEdge ? obj.duration - obj.beatLength / 32 : obj.duration - obj.beatLength / beatmap.Difficulty.SliderTickRate / 4 - 0.001)) ticks.push(i);
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
        r[0] += points[i].x * bernstain(i, n, t);
        r[1] += points[i].y * bernstain(i, n, t);
    }
    return r;
}

const bernstain = (i, n, t) => {
    return fact(n) / (fact(i) * fact(n - i)) * Math.pow(t, i) * Math.pow(1 - t, n - i);
}

const fact = (n) => {
    if (n == 0 || n == 1)
        return 1;
    if (factorialsLUT[n] > 0)
        return factorialsLUT[n];
    return factorialsLUT[n] = fact(n - 1) * n;
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
