import { MusicPlayer } from "./player.js";
import { ProgressBar } from "./progress.js";
import { parseSkin, asyncLoadImages } from "./skin.js";
import urlJoin from "./url-join.js";

const mapFolder = 1 ? "songs/1712395 Ashrount - AureoLe ~for Triumph~/" : "songs/1919786 MIMI vs Leah Kate - 10 Things I Hate About Ai no Sukima/";
const diff = 1 ? "Ashrount - AureoLe ~for Triumph~ (R3m) [FINAL].osu" : "MIMI vs. Leah Kate - 10 Things I Hate About Ai no Sukima (Log Off Now) [ssadasdsa].osu";

const BEZIER_SEGMENT_MAX_LENGTH = 10;        // in screen pixels
var bezierSegmentMaxLengthSqrd;             // in osu pixels, squared

var player, progressBar;
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
var bufferCanvas, bufferCtx;

const canvasSize = [1600, 1200];
const minMargin = 50;
var fieldSize = [], margins, bgSize;
var beatmap, skin;
var bg;
var preempt, fadein, fadeout = 233;
var radius;
var time2 = 0;

var cursorPos;
var bgdim = 1//0.33;
var drawGrid = true;


var osuToPixelsX, osuToPixelsY;

window.onload = async (e) => {
    document.querySelector("#play").addEventListener("click", e => player.play())
    document.querySelector("#pause").addEventListener("click", e => player.pause());

    window.onmousemove = e => cursorPos = [e.clientX, e.clientY];
    document.querySelector("input").oninput = (e) => bgdim = e.target.value;
    document.querySelector("input").value = bgdim;

    bufferCanvas = document.createElement("canvas");
    bufferCtx = bufferCanvas.getContext("2d");

    canvas.width = canvasSize[0];
    canvas.height = canvasSize[1];
    bufferCanvas.width = canvas.width;
    bufferCanvas.height = canvas.height;

    if (canvasSize[0] / canvasSize[1] > 512 / 384) {
        fieldSize[1] = canvasSize[1] - minMargin * 2;
        fieldSize[0] = fieldSize[1] / 384 * 512;
        margins = [(canvasSize[0] - fieldSize[0]) / 2, minMargin];
    }
    else {
        fieldSize[0] = canvasSize[0] - minMargin * 2;
        fieldSize[1] = fieldSize[0] / 512 * 384;
        margins = [minMargin, (canvasSize[1] - fieldSize[1]) / 2];
    }
    osuToPixelsX = (val) => val / 512 * fieldSize[0];
    osuToPixelsY = (val) => val / 384 * fieldSize[1];

    const text = await fetch(mapFolder + diff).then(r => r.text());
    beatmap = parseBeatmap(text);
    radius = 54.4 - 4.48 * parseFloat(beatmap.Difficulty.CircleSize);
    const ar = parseFloat(beatmap.Difficulty.ApproachRate);
    if (ar < 5) {
        preempt = 1200 + 600 * (5 - ar) / 5;
        fadein = 800 + 400 * (5 - ar) / 5;
    }
    else if (ar == 5) {
        preempt = 1200;
        fadein = 800;
    }
    else {
        preempt = 1200 - 750 * (ar - 5) / 5;
        fadein = 800 - 500 * (ar - 5) / 5;
    }

    bg = await asyncLoadImages("b/leah miku.jpg");
    skin = await parseSkin("skins/- YUGEN -");

    if (canvasSize[0] / canvasSize[1] > bg.width / bg.height) {
        bgSize = [canvasSize[0], bg.height * canvasSize[0] / bg.width];
    }
    else {
        bgSize = [bg.width * canvasSize[1] / bg.height, canvasSize[1]];
    }
    bgSize = [...bgSize, (canvasSize[1] - bgSize[1]) / 2, (canvasSize[0] - bgSize[0]) / 2];
    bezierSegmentMaxLengthSqrd = fieldSize[0] > fieldSize[1] ?
        Math.pow(BEZIER_SEGMENT_MAX_LENGTH / fieldSize[0] * 512, 2) :
        Math.pow(BEZIER_SEGMENT_MAX_LENGTH / fieldSize[1] * 384, 2);

    player = window.player = await MusicPlayer.init(mapFolder + beatmap.General.AudioFilename);
    progressBar = new ProgressBar("#progress-bar", player, callback);
    player.currentTime = 0.015//41.083;
}

function callback(time) {
    //console.log(100 / (performance.now() - time2));
    time2 = performance.now();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // draw background
    ctx.drawImage(bg, bgSize[3], bgSize[2], bgSize[0], bgSize[1]);

    // dim background
    ctx.fillStyle = `rgb(0,0,0,${bgdim})`;
    ctx.fillRect(0, 0, canvasSize[0], canvasSize[1]);

    // draw grid
    if (drawGrid) {
        ctx.lineWidth = 1;
        for (let i = 0; i <= 16; i++) {
            if (i == 8)
                ctx.strokeStyle = "#e0e0e0a0";
            else
                ctx.strokeStyle = "#e0e0e050";

            ctx.beginPath();
            ctx.moveTo(i * fieldSize[0] / 16 + margins[0], margins[1]);
            ctx.lineTo(i * fieldSize[0] / 16 + margins[0], fieldSize[1] + margins[1]);
            ctx.stroke();
        }
        for (let i = 0; i <= 12; i++) {
            if (i == 6)
                ctx.strokeStyle = "#e0e0e0a0";
            else
                ctx.strokeStyle = "#e0e0e050";

            ctx.beginPath();
            ctx.moveTo(margins[0], i * fieldSize[1] / 12 + margins[1]);
            ctx.lineTo(fieldSize[0] + margins[0], i * fieldSize[1] / 12 + margins[1]);
            ctx.stroke();
        }
    }

    // playfield border
    ctx.lineWidth = 2;
    ctx.strokeStyle = "black";
    ctx.strokeRect(margins[0], margins[1], fieldSize[0], fieldSize[1])

    // find first object to paint
    time *= 1000;
    var index = binarySearch(beatmap.HitObjects, time + preempt);

    var approachQueue = [];
    
    while (index >= 0 && beatmap.HitObjects[index][2] + fadeout > time) {
        const obj = beatmap.HitObjects[index];

        if (obj[3] & 2) {      // slider

            var snake = 1;

            bufferCtx.globalCompositeOperation = "source-over";
            bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
            bufferCtx.beginPath();
            if (time <= obj[2]) {
                approachQueue.push(obj);
                bufferCtx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 1);
                snake = clamp(0, (time - (obj[2] - preempt)) / fadein, 0.5) * 2;
            }
            else {
                bufferCtx.globalAlpha = 1;
            }

            bufferCtx.moveTo(osuToPixelsX(obj[0]) + margins[0], osuToPixelsY(obj[1]) + margins[1]);
            // linear
            if (obj[5][0] == "L") {
                for (let i = 1; i < obj[5].length; i++) {
                    bufferCtx.lineTo(osuToPixelsX(obj[5][i][0]) + margins[0], osuToPixelsY(obj[5][i][1]) + margins[1]);
                }
            }
            // perfect circle
            else if (obj[5][0] == "P" && obj[5].length == 3) {
                // https://stackoverflow.com/a/22793494/8414010
                const a = [obj[0], obj[1]];
                const b = [obj[5][1][0], obj[5][1][1]];
                const c = [obj[5][2][0], obj[5][2][1]];
                const x1 = 2 * (a[0] - b[0]);
                const y1 = 2 * (a[1] - b[1]);
                const z1 = a[0] * a[0] + a[1] * a[1] - b[0] * b[0] - b[1] * b[1];
                const x2 = 2 * (a[0] - c[0]);
                const y2 = 2 * (a[1] - c[1]);
                const z2 = a[0] * a[0] + a[1] * a[1] - c[0] * c[0] - c[1] * c[1];

                const y = (z2 - (x2 * z1) / x1) / (y2 - (x2 * y1) / x1);
                const x = (z1 - y1 * y) / x1;

                const radius = Math.sqrt((a[0] - x) * (a[0] - x) + (a[1] - y) * (a[1] - y));
                const anglea = Math.atan2(a[1] - y, a[0] - x);
                var anglec = Math.atan2(c[1] - y, c[0] - x);
                const det = determinant([[a[0], a[1], 1], [b[0], b[1], 1], [c[0], c[1], 1]]);

                const arclength = radius * (det < 0 ? mod(anglea - anglec, 2 * Math.PI) : mod(anglec - anglea, 2 * Math.PI));
                var xincr, yincr;
                if (arclength > obj[7]) {
                    anglec = anglea + obj[7] / radius * (det > 0 ? 1 : -1);
                }
                else {
                    const slope = 1 / Math.tan(anglec);
                    xincr = Math.sqrt(Math.pow(obj[7] - arclength, 2) / (1 + slope * slope)) * (anglec < 0 ? -1 : 1);
                    yincr = xincr * slope * (anglec < Math.PI ? -1 : 1);
                    console.log(anglec, slope)
                }

                bufferCtx.arc(osuToPixelsX(x) + margins[0], osuToPixelsY(y) + margins[1], osuToPixelsX(radius), anglea, anglec, det < 0);
                if (xincr)
                    bufferCtx.lineTo(osuToPixelsX(c[0] + xincr) + margins[0], osuToPixelsY(c[1] + yincr) + margins[1]);
            }
            // bezier curve
            else if (obj[5][0] == "B" || (obj[5][0] == "P" && obj[5].length > 3)) {
                const controlPoints = [[obj[0], obj[1]], ...obj[5].slice(1)];
                var pointsBuffer = [controlPoints[0]];
                var totlength = [0]
                for (let i = 1; i < controlPoints.length; i++) {
                    if (controlPoints[i][0] == controlPoints[i - 1][0] && controlPoints[i][1] == controlPoints[i - 1][1]) {
                        const points = bezierPoints(pointsBuffer, 0, 1, [], totlength);
                        for (let point of points)
                            bufferCtx.lineTo(osuToPixelsX(point[0]) + margins[0], osuToPixelsY(point[1]) + margins[1]);
                        pointsBuffer = [];
                    }
                    pointsBuffer.push(controlPoints[i]);
                }

                const points = bezierPoints(pointsBuffer, 0, 1, [], totlength);
                for (let point of points)
                    bufferCtx.lineTo(osuToPixelsX(point[0]) + margins[0], osuToPixelsY(point[1]) + margins[1]);

            }

            const diameter = radius * 2 / 512 * fieldSize[0] * 0.8;
            bufferCtx.lineJoin = 'round';
            bufferCtx.lineCap = 'round';
            bufferCtx.globalAlpha = 1

            // slider border
            bufferCtx.lineWidth = diameter + 30;
            bufferCtx.strokeStyle = "#ffffffa0";
            bufferCtx.stroke();
            bufferCtx.lineWidth = diameter;
            bufferCtx.globalCompositeOperation = "destination-out";
            bufferCtx.strokeStyle = "black";
            bufferCtx.stroke();

            // slider gradient
            bufferCtx.globalCompositeOperation = "source-over";
            for (let i = diameter; i > 0; i -= 1000) {
                bufferCtx.lineWidth = diameter * i / diameter;
                const perc = (1 - i / diameter) / 255 * 43;
                //bufferCtx.globalAlpha = 1 - (i / diameter)
                bufferCtx.strokeStyle = `rgb(0,0,0,0.65)`;
                bufferCtx.stroke();
            }
            

            ctx.globalAlpha = 1;
            ctx.drawImage(bufferCanvas, 0, 0);
        }
        if (obj[3] & 1 || obj[3] & 2) {

            const hitcircle = skin["hitcircle"];
            const tinted = hitcircle.combos[obj[obj.length - 1][1] % skin.ini.combos.length];
            const overlay = skin["hitcircleoverlay"];
            var circleScale;

            if (time <= obj[2]) {
                approachQueue.push(obj);
                ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 1);
                circleScale = 1;
            }
            else {
                ctx.globalAlpha = clamp(0, (obj[2] + fadeout - time) / fadeout, 1);
                circleScale = 1 + easeOut(clamp(0, 1 - (obj[2] + fadeout - time) / fadeout, 1)) * 0.25;
            }

            var size = [osuToPixelsX(radius) * 2 / (hitcircle.isHD ? 256 : 128) * tinted.width * circleScale, osuToPixelsY(radius) * 2 / (hitcircle.isHD ? 256 : 128) * tinted.height * circleScale];
            ctx.drawImage(tinted, osuToPixelsX(obj[0]) + margins[0] - size[0] / 2, osuToPixelsY(obj[1]) + margins[1] - size[1] / 2, size[0], size[1]);
            size = [osuToPixelsX(radius) * 2 / (overlay.isHD ? 256 : 128) * overlay.img.width * circleScale, osuToPixelsY(radius) * 2 / (overlay.isHD ? 256 : 128) * overlay.img.height * circleScale];
            ctx.drawImage(overlay.img, osuToPixelsX(obj[0]) + margins[0] - size[0] / 2, osuToPixelsY(obj[1]) + margins[1] - size[1] / 2, size[0], size[1]);

            const combo = obj[obj.length - 1][0].toString();
            if (time > obj[2]) {
                // number disappears 60 ms after being hit
                ctx.globalAlpha = clamp(0, (obj[2] + 60 - time) / 60, 1);
            }

            const width = skin["default-" + combo[0]].img.width;
            const height = skin["default-" + combo[0]].img.height;
            const isHD = skin["default-" + combo[0]].isHD;
            const totalWidth = width * combo.length - (combo.length - 1) * skin.ini.Fonts.HitCircleOverlap / 640 * fieldSize[0];
            const numberScale = radius / (isHD ? 160 : 80) / 512 * fieldSize[0];
            for (let i = 0; i < combo.length; i++) {
                const letter = skin["default-" + combo[i]];
                ctx.drawImage(letter.img, osuToPixelsX(obj[0]) + margins[0] + (-totalWidth / 2 + (width - skin.ini.Fonts.HitCircleOverlap / 640 * fieldSize[0]) * i) * numberScale, osuToPixelsY(obj[1]) + margins[1] - height / 2 * numberScale, letter.img.width * numberScale, letter.img.height * numberScale);
            }
        }


        index--;
    }

    // draw approach circles on top of hitcircles
    for (let obj of approachQueue) {
        const approachScale = 1 + clamp(0, 1 - (time - (obj[2] - preempt)) / preempt, 1) * 3;
        ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 0.9) / 0.9 * 0.5;
        
        // get tinted approachcircle
        const tinted = skin["approachcircle"].combos[obj[obj.length - 1][1] % skin.ini.combos.length];

        ctx.drawImage(tinted, osuToPixelsX(obj[0] - radius * approachScale) + margins[0], osuToPixelsY(obj[1] - radius * approachScale) + margins[1], radius / 256 * fieldSize[0] * approachScale, radius / 192 * fieldSize[1] * approachScale);
    }

    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgb(255,0,0,0.5)";
    if (cursorPos) {
        //ctx.fillRect(cursorPos[0] - 20 - canvas.offsetLeft, cursorPos[1] - 20 - canvas.offsetTop, 40, 40)
    }
}

const bezierPoints = (points, start, end, arr = [], totlength = []) => {
    const startP = bezierAt(points, start);
    const endP = bezierAt(points, end);
    const length = Math.pow(startP[0] - endP[0], 2) + Math.pow(startP[1] - endP[1], 2);

    if (length > bezierSegmentMaxLengthSqrd) {
        bezierPoints(points, start, (start + end) / 2, arr, totlength);
        bezierPoints(points, (start + end) / 2, end, arr, totlength);
        return arr;
    }
    else {
        arr.push(endP);
        totlength[0] = totlength[0] + Math.sqrt(length);
        return arr;
    }
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

const factorialsLUT = await fetch("factorials.json").then(r => r.json());
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

const parseBeatmap = (text) => {
    var result = {};
    var currCategory, matches;

    for (let line of text.split("\n")) {
        if (!line.trim() || line.startsWith("//") || line.match(/^osu file format v/)) {
            continue;
        }

        if ((matches = line.match(/^\s*\[([^\[\]]+)\]\s*$/))) {
            currCategory = matches[1];
            if (["HitObjects", "TimingPoints", "Events"].includes(currCategory))
                result[currCategory] = [];
            else
                result[currCategory] = {};
        }
        else if (!currCategory) {
            return null;
        }
        else if (currCategory == "HitObjects") {
            var vals = line.trim().split(",");
            for (let i = 0; i < 5; i++) {
                vals[i] = parseInt(vals[i]);
            }
            if (vals[3] & 2) {
                vals[5] = vals[5].split("|");
                for (let i = 1; i < vals[5].length; i++) {
                    vals[5][i] = vals[5][i].split(":").map(x => parseInt(x));
                }
                vals[6] = parseInt(vals[6]);
                vals[7] = parseInt(vals[7]);
            }
            result[currCategory].push(vals);
        }
        else if (["TimingPoints", "Events"].includes(currCategory)) {
            result[currCategory].push(line.trim().split(","));
        }
        else {
            var keyval = line.trim().split(":");
            result[currCategory][keyval[0].trim()] = keyval[1].trim();
        }
    }

    // pre compute combos
    var currentCombo = 1, comboIndex = -1;
    for (let obj of result.HitObjects) {
        if (obj[3] & 4) { // new combo
            currentCombo = 1;
            comboIndex += 1 + (((16 & obj[3]) + (32 & obj[3]) + (64 & obj[3])) >> 4);
        }
        obj.push([currentCombo, comboIndex]);
        currentCombo++;
    }

    return result;
}

const binarySearch = (objects, time) => {
    let l = 0, r = objects.length - 1, m;

    while (l <= r) {
        if (objects[r][2] < time) {
            return r;
        }
        m = Math.floor((l + r) / 2);
        if (objects[m][2] == time) {
            return m;
        }
        if (m > 0 && objects[m - 1][2] <= time && time < objects[m][2]) {
            return m - 1;
        }

        if (objects[m][2] < time) {
            l = m + 1;
        }
        else {
            r = m - 1;
        }
    }

    return -1;
}

const easeOut = (t) => {
    return 1.5 * t / (0.5 + t);
}

const mod = (a, n) => (a % n + n) % n;
const clamp = (min, n, max) => Math.min(max, Math.max(min, n));
