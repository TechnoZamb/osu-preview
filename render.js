import * as main from "./index.js";
import { mod, clamp, lerp, range, rgb } from "./functions.js";
import { drawSlider, getFollowPosition, getSliderTicks } from "./slider.js";
import { asyncLoadImages } from "./skin.js";

const canvasSize = [1524, 1200];
const minMargin = 112;
const drawGrid = true;

const BEZIER_SEGMENT_MAX_LENGTH = 10;        // in screen pixels
export let bezierSegmentMaxLengthSqrd;       // in osu pixels, squared

let canvas, ctx, bufferCanvas, bufferCtx;
let bg;
export let fieldSize = [], margins, bgSize;
export let osuToPixelsX, osuToPixelsY;
let prevTime = -1, framesN = 0, avgFPS, avgFrames = [];
let sliderGradientDivisions = 20;

export async function init() {
    canvas = document.querySelector("canvas");
    ctx = canvas.getContext("2d");
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

    bg = await asyncLoadImages("b/leah miku.jpg");

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

}

export function render(time) {
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // draw background
    ctx.drawImage(bg, bgSize[3], bgSize[2], bgSize[0], bgSize[1]);

    // dim background
    ctx.fillStyle = `rgb(0,0,0,${main.bgdim})`;
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
    else {
        // playfield border
        ctx.lineWidth = 2;
        ctx.strokeStyle = "black";
        ctx.strokeRect(margins[0], margins[1], fieldSize[0], fieldSize[1]);
    }

    // find first (last in hitobjects list) object to paint
    time *= 1000;
    //var index = binarySearch(main.beatmap.HitObjects, time + main.beatmap.preempt);
    var index = main.beatmap.HitObjects.length - 1;

    var approachQueue = [], followQueue = [];

    while (index >= 0) {
        const obj = main.beatmap.HitObjects[index];

        if (obj[2] + (obj[3] & 2 ? obj.at(-2) * obj[6] : (obj[3] & 8 ? obj[5] - obj[2] : 0)) + main.beatmap.fadeout < time ||
            obj[2] - main.beatmap.preempt > time) {
            index--;
            continue;
        }

        if (obj[3] & 2) {                   // slider
            bufferCtx.globalCompositeOperation = "source-over";
            bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
            bufferCtx.beginPath();

            var snake;
            if (time < obj[2]) {
                approachQueue.push(obj);
                ctx.globalAlpha = clamp(0, (time - (obj[2] - main.beatmap.preempt)) / main.beatmap.fadein, 1);
                snake = clamp(0, (time - (obj[2] - main.beatmap.preempt)) / main.beatmap.fadein, 0.5) * 2;
            }
            else {
                if (time < obj[2] + obj.at(-2) * obj[6] + 200) {
                    followQueue.push(obj);
                }
                ctx.globalAlpha = clamp(0, (obj[2] + obj.at(-2) * obj[6] + main.beatmap.fadeout - time) / main.beatmap.fadeout, 1);
                snake = 1;
            }

            bufferCtx.moveTo(osuToPixelsX(obj[0]) + margins[0], osuToPixelsY(obj[1]) + margins[1]);
            drawSlider(obj, obj[7] * snake, true, bufferCtx);

            const diameter = main.beatmap.radius * 2 / 512 * fieldSize[0] * 0.8;
            bufferCtx.lineJoin = "round";
            bufferCtx.lineCap = "round";
            bufferCtx.globalAlpha = 1

            // slider border
            bufferCtx.lineWidth = diameter * 1.15;
            bufferCtx.strokeStyle = `rgb(${main.skin.ini.Colours.SliderBorder})`;
            bufferCtx.stroke();
            bufferCtx.lineWidth = diameter;
            bufferCtx.globalCompositeOperation = "destination-out";
            bufferCtx.strokeStyle = "black";
            bufferCtx.stroke();

            ctx.shadowColor = "#404040";
            ctx.shadowBlur = 0.11 * osuToPixelsX(main.beatmap.radius);
            ctx.drawImage(bufferCanvas, 0, 0);
            ctx.shadowColor = "transparent";

            // slider gradient
            const gradientColor = rgb(main.skin.ini.Colours.SliderTrackOverride) || main.skin.ini.combos[obj.at(-1)[1] % main.skin.ini.combos.length];
            const inner = gradientColor.map(x => clamp(61, range(0, 170, 61, 255, x), 255));
            const outer = gradientColor.map(x => x * 0.91);

            bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
            bufferCtx.globalCompositeOperation = "source-over";
            for (let divs = sliderGradientDivisions, i = divs; i > 0; i--) {
                bufferCtx.lineWidth = diameter * i / divs;
                bufferCtx.strokeStyle = `rgb(${inner.map((x, j) => lerp(x, outer[j], i / divs)).join(",")})`;
                bufferCtx.stroke();
            }

            ctx.globalAlpha *= 0.7;
            ctx.drawImage(bufferCanvas, 0, 0);

            const slideN = Math.max(Math.floor((time - obj[2]) / obj.at(-2)), 0);

            //#region slider end
            let circleSprite = main.skin["sliderendcircle"][obj.at(-1)[1] % main.skin.ini.combos.length];
            let overlaySprite = main.skin["sliderendcircleoverlay"];

            const _drawEnd = (sprite, position, startTime, scale) => {
                const size = [osuToPixelsX(main.beatmap.radius) / 64 * sprite.width, osuToPixelsY(main.beatmap.radius) / 64 * sprite.height];
                const scale2 = 1 + (scale ? (1 - easeOut(mod((time - startTime) / obj.at(-3), 1))) * 0.3 : 0);
                ctx.globalAlpha = clamp(0, (time - startTime) / 150, 1);
                ctx.drawImage(sprite, osuToPixelsX(position[0]) + margins[0] - size[0] / 2 * scale2, osuToPixelsY(position[1]) + margins[1] - size[1] / 2 * scale2, size[0] * scale2, size[1] * scale2);
            };

            // slider end at the end of the slider
            if (slideN < obj[6] && slideN % 2 == 0 || slideN < obj[6] - 1) {
                let position = getFollowPosition(obj, obj[7]);
                let startTime = obj[2] + obj.at(-2) * (slideN == 0 || slideN % 2 ? slideN : slideN - 1) + (slideN == 0 ? -main.beatmap.preempt + main.beatmap.fadein / 2 : 0);
                _drawEnd(circleSprite, position, startTime, false);
                _drawEnd(overlaySprite, position, startTime, false);
            }
            // slider end at the start of the slider (when slides > 1)
            if (slideN < obj[6] && slideN % 2 == 1 || slideN < obj[6] - 1) {
                let position = getFollowPosition(obj, 0);
                let startTime = obj[2] + obj.at(-2) * (slideN % 2 ? slideN - 1 : slideN);
                _drawEnd(circleSprite, position, startTime, false);
                _drawEnd(overlaySprite, position, startTime, false);
            }

            // slider ends expanding and fading out after being tapped
            let i = slideN;
            while (i > 0 && i <= obj[6] && time - (obj[2] + obj.at(-2) * i) < main.beatmap.fadeout) {
                const position = getFollowPosition(obj, obj[7] * (i % 2));
                const scale = 1 + easeOut(clamp(0, 1 - (obj[2] + obj.at(-2) * i + main.beatmap.fadeout - time) / main.beatmap.fadeout, 1)) * 0.35;
                ctx.globalAlpha = clamp(0, (obj[2] + obj.at(-2) * slideN + main.beatmap.fadeout - time) / main.beatmap.fadeout, 1);

                let size = [osuToPixelsX(main.beatmap.radius) / 64 * circleSprite.width, osuToPixelsY(main.beatmap.radius) / 64 * circleSprite.height];
                ctx.drawImage(circleSprite, osuToPixelsX(position[0]) + margins[0] - size[0] / 2 * scale, osuToPixelsY(position[1]) + margins[1] - size[1] / 2 * scale, size[0] * scale, size[1] * scale);
                size = [osuToPixelsX(main.beatmap.radius) / 64 * overlaySprite.width, osuToPixelsY(main.beatmap.radius) / 64 * overlaySprite.height];
                ctx.drawImage(overlaySprite, osuToPixelsX(position[0]) + margins[0] - size[0] / 2 * scale, osuToPixelsY(position[1]) + margins[1] - size[1] / 2 * scale, size[0] * scale, size[1] * scale);
                i--;
            }
            //#endregion

            //#region reverse arrows
            if (obj[6] > 1) {
                const reverse1 = slideN < obj[6] - 1;
                const reverse2 = slideN < obj[6] - 2;

                const sprite = main.skin["reversearrow"];
                const size = [osuToPixelsX(main.beatmap.radius) / 64 * sprite.width, osuToPixelsY(main.beatmap.radius) / 64 * sprite.height];

                const _drawArrow = (position, startTime, flip) => {
                    const scale = 1 + (1 - easeOut(mod((time - startTime) / obj.at(-3), 1))) * 0.3;
                    ctx.globalAlpha = clamp(0, (time - startTime) / 150, 1);
                    ctx.save();
                    ctx.translate(osuToPixelsX(position[0]) + margins[0], osuToPixelsY(position[1]) + margins[1]);
                    ctx.rotate(position[2] + (flip ? Math.PI : 0));
                    ctx.drawImage(sprite, -size[0] / 2 * scale, -size[1] / 2 * scale, size[0] * scale, size[1] * scale);
                    ctx.restore();
                };

                // arrow at the end (assuming 1 slide) of the slider
                if ((slideN % 2 == 0 && reverse1) || (slideN % 2 == 1 && reverse2)) {
                    _drawArrow(getFollowPosition(obj, obj[7]), obj[2] + obj.at(-2) * (slideN == 0 || slideN % 2 ? slideN : slideN - 1) + (slideN == 0 ? -main.beatmap.preempt + main.beatmap.fadein / 2 : 0), true);
                }
                // arrow at the start (assuming 1 slide) of the slider
                if ((slideN % 2 == 0 && reverse2) || (slideN % 2 == 1 && reverse1)) {
                    _drawArrow(getFollowPosition(obj, 0), obj[2] + obj.at(-2) * (slideN % 2 ? slideN - 1 : slideN), false);
                }

                // slider arrows expanding and fading out after being tapped
                let i = slideN;
                while (i > 0 && i < obj[6] && time - (obj[2] + obj.at(-2) * i) < main.beatmap.fadeout) {
                    const arrowScale = 1 + easeOut(clamp(0, 1 - (obj[2] + obj.at(-2) * i + main.beatmap.fadeout - time) / main.beatmap.fadeout, 1)) * 0.35;
                    ctx.globalAlpha = clamp(0, (obj[2] + obj.at(-2) * slideN + main.beatmap.fadeout - time) / main.beatmap.fadeout, 1);
                    const position = getFollowPosition(obj, obj[7] * (i % 2));
                    ctx.save();
                    ctx.translate(osuToPixelsX(position[0]) + margins[0], osuToPixelsY(position[1]) + margins[1]);
                    ctx.rotate(position[2] + (i % 2 ? Math.PI : 0));
                    ctx.drawImage(sprite, -size[0] / 2 * arrowScale, -size[1] / 2 * arrowScale, size[0] * arrowScale, size[1] * arrowScale);
                    ctx.restore();
                    i--;
                }
            }
            //#endregion

            //#region slider ticks
            const ticks = getSliderTicks(obj);
            var drawn = 0;
            var n = slideN;

            while (n < obj[6]) {
                var firstTickTime = n == 0 ? (obj[2] - main.beatmap.fadein) : (obj[2] + obj.at(-2) * n - 280 + (n % 2 ? obj.at(-2) - ticks.at(-1) : ticks[0]) / 2);

                for (let i = 0; i < ticks.length; i++) {
                    const tick = ticks[i];

                    if (time < obj[2] + obj.at(-2) * n + (n % 2 ? obj.at(-2) - ticks[ticks.length - i - 1] : tick)) {
                        const sprite = main.skin["sliderscorepoint"];
                        const followPos = getFollowPosition(obj, ((n > 0 && n % 2) ? ticks[ticks.length - i - 1] : tick) / obj.at(-2) * obj[7]);
                        const temp = time - firstTickTime - tick / 2;
                        const scale = temp < 140 ? (0.5 + clamp(0, temp / 140, 1) * 0.7) : (1 + (1 - clamp(0, (temp - 140) / 140, 1)) * 0.2);
                        const size = [osuToPixelsX(main.beatmap.radius) * 2 / 128 * sprite.width * scale, osuToPixelsY(main.beatmap.radius) * 2 / 128 * sprite.height * scale];
                        ctx.globalAlpha = clamp(0, temp / 140, 1);
                        ctx.drawImage(sprite, osuToPixelsX(followPos[0]) + margins[0] - size[0] / 2, osuToPixelsX(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);

                        drawn++;
                    }
                }

                if (drawn != 0) break;
                else n++;
            }
            //#endregion
        }
        if (obj[3] & 1 || obj[3] & 2) {     // hitcircle

            let circleSprite, overlaySprite;
            if (obj[3] & 2) {
                circleSprite = main.skin["sliderstartcircle"][obj.at(-1)[1] % main.skin.ini.combos.length];
                overlaySprite = main.skin["sliderstartcircleoverlay"];
            }
            else {
                circleSprite = main.skin["hitcircle"][obj.at(-1)[1] % main.skin.ini.combos.length];
                overlaySprite = main.skin["hitcircleoverlay"];
            }

            let circleScale;
            if (time <= obj[2]) {
                approachQueue.push(obj);
                ctx.globalAlpha = clamp(0, (time - (obj[2] - main.beatmap.preempt)) / main.beatmap.fadein, 1);
                circleScale = 1;
            }
            else {
                ctx.globalAlpha = clamp(0, (obj[2] + main.beatmap.fadeout - time) / main.beatmap.fadeout, 1);
                circleScale = 1 + easeOut(clamp(0, 1 - (obj[2] + main.beatmap.fadeout - time) / main.beatmap.fadeout, 1)) * 0.35;
            }

            var size = [osuToPixelsX(main.beatmap.radius) * 2 / 128 * circleSprite.width * circleScale, osuToPixelsY(main.beatmap.radius) * 2 / 128 * circleSprite.height * circleScale];
            ctx.drawImage(circleSprite, osuToPixelsX(obj[0]) + margins[0] - size[0] / 2, osuToPixelsY(obj[1]) + margins[1] - size[1] / 2, size[0], size[1]);
            size = [osuToPixelsX(main.beatmap.radius) * 2 / 128 * overlaySprite.width * circleScale, osuToPixelsY(main.beatmap.radius) * 2 / 128 * overlaySprite.height * circleScale];
            ctx.drawImage(overlaySprite, osuToPixelsX(obj[0]) + margins[0] - size[0] / 2, osuToPixelsY(obj[1]) + margins[1] - size[1] / 2, size[0], size[1]);

            // draw combo number
            if (time > obj[2]) {
                // number disappears 60 ms after being hit
                ctx.globalAlpha = clamp(0, (obj[2] + 60 - time) / 60, 1);
            }

            const combo = obj.at(-1)[0].toString();
            const width = main.skin["default-" + combo[0]].width;
            const height = main.skin["default-" + combo[0]].height;
            const totalWidth = width * combo.length - main.skin.ini.Fonts.HitCircleOverlap / 640 * fieldSize[0] / 2 * (combo.length - 1);
            const numberScale = main.beatmap.radius / 80 / 512 * fieldSize[0];
            for (let i = 0; i < combo.length; i++) {
                const sprite = main.skin["default-" + combo[i]];

                const [x, y, w, h] = [
                    osuToPixelsX(obj[0]) + margins[0] + (-totalWidth / 2 + (width - main.skin.ini.Fonts.HitCircleOverlap / 640 * fieldSize[0] / 2) * i) * numberScale,
                    osuToPixelsY(obj[1]) + margins[1] - height / 2 * numberScale,
                    width * (sprite.naturalWidth / main.skin["default-" + combo[0]].naturalWidth) * numberScale,
                    height * (sprite.naturalHeight / main.skin["default-" + combo[0]].naturalHeight) * numberScale
                ];

                ctx.drawImage(sprite, x, y, w, h);
            }
        }
        else if (obj[3] && 8) {             // spinner
            let sprite;

            if (time < obj[5]) {
                ctx.globalAlpha = clamp(0, (time - obj[2] + 400) / 400, 1);
            }
            else {
                ctx.globalAlpha = clamp(0, (obj[5] - time + main.beatmap.fadeout) / main.beatmap.fadeout, 1);
            }

            if (main.skin.isOldSpinner) {
                // spinner background
                sprite = main.skin["spinner-background"][0];
                size = [osuToPixelsX(sprite.width) * 0.625, osuToPixelsY(sprite.height) * 0.625];
                ctx.drawImage(sprite, osuToPixelsX(256) + margins[0] - size[0] / 2,
                    osuToPixelsY(192) + margins[1] - size[1] / 2, size[0], size[1]);

                // spinner circle
                sprite = main.skin["spinner-circle"];
                size = [osuToPixelsX(sprite.width) * 0.625, osuToPixelsY(sprite.height) * 0.625];
                const pow = 2;
                const maxRPM = 477;
                // time it takes to reach maxRPM
                const timemaxRPM = (obj[5] - obj[2]) / 10;
                ctx.save();
                ctx.translate(osuToPixelsX(256) + margins[0], osuToPixelsY(192) + margins[1]);
                ctx.rotate((Math.pow(clamp(0, (time - obj[2]) / timemaxRPM, 1), pow) / pow * timemaxRPM
                    + clamp(0, time - obj[2] - timemaxRPM, obj[5] - obj[2] - timemaxRPM)) / 1000 / 60 * -maxRPM * Math.PI * 2);
                ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
                ctx.restore();

                // spinner metre
                sprite = main.skin["spinner-metre"];
                const barN = Math.floor(clamp(0, (time - obj[2]) / (obj[5] - obj[2]) / 0.45, 1) * 10);
                ctx.drawImage(sprite,
                    0, (10 - barN) * (768 - 34) / 10 /** fieldSize[1] / 600*/ * sprite.naturalHeight / sprite.height,
                    sprite.naturalWidth, barN * (768 - 34) / 10 * sprite.naturalHeight / sprite.height,
                    canvas.width / 2 - 512 * fieldSize[0] / 800, (canvas.height / 2 - (383 - 34) * fieldSize[1] / 600) + (10 - barN) * (768 - 34) / 10 * fieldSize[1] / 600,
                    sprite.width * fieldSize[0] / 800, barN * (768 - 34) / 10 * fieldSize[1] / 600
                );
            }
            else {
                const pow = 2;
                const baseTimeMaxRPM = (obj[5] - obj[2]) / 10;
                const scale = 0.8 + easierOut(clamp(0, (time - obj[2]) / ((obj[5] - obj[2]) * 0.45), 1)) * 0.2;
                let maxRPM, timeMaxRPM;

                // spinner glow
                sprite = main.skin["spinner-glow"][0];
                const tempAlpha = ctx.globalAlpha;
                if (time < obj[5]) {
                    ctx.globalAlpha = clamp(0, (time - obj[2]) / ((obj[5] - obj[2]) * 0.45), 1);
                }
                else {
                    ctx.globalAlpha = clamp(0, (obj[5] + main.beatmap.fadeout - time) / main.beatmap.fadeout, 1);
                }
                size = [osuToPixelsX(sprite.width) * 0.625 * scale, osuToPixelsY(sprite.height) * 0.625 * scale];
                ctx.drawImage(sprite, osuToPixelsX(256) + margins[0] - size[0] / 2,
                    osuToPixelsY(192) + margins[1] - size[1] / 2, size[0], size[1]);
                ctx.globalAlpha = tempAlpha;

                // spinner bottom
                sprite = main.skin["spinner-bottom"];
                size = [osuToPixelsX(sprite.width) * 0.625 * scale, osuToPixelsY(sprite.height) * 0.625 * scale];
                maxRPM = 75;
                timeMaxRPM = baseTimeMaxRPM / 5;
                ctx.save();
                ctx.translate(osuToPixelsX(256) + margins[0], osuToPixelsY(192) + margins[1]);
                ctx.rotate((Math.pow(clamp(0, (time - obj[2]) / baseTimeMaxRPM, 1), pow) / pow * baseTimeMaxRPM
                    + clamp(0, time - obj[2] - baseTimeMaxRPM, obj[5] - obj[2] - baseTimeMaxRPM)) / 1000 / 60 * -maxRPM * Math.PI * 2);
                ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
                ctx.restore();

                // spinner top
                sprite = main.skin["spinner-top"];
                size = [osuToPixelsX(sprite.width) * 0.625 * scale, osuToPixelsY(sprite.height) * 0.625 * scale];
                maxRPM = 230;
                timeMaxRPM = baseTimeMaxRPM / 3;
                ctx.save();
                ctx.translate(osuToPixelsX(256) + margins[0], osuToPixelsY(192) + margins[1]);
                ctx.rotate((Math.pow(clamp(0, (time - obj[2]) / timeMaxRPM, 1), pow) / pow * timeMaxRPM
                    + clamp(0, time - obj[2] - timeMaxRPM, obj[5] - obj[2] - timeMaxRPM)) / 1000 / 60 * -maxRPM * Math.PI * 2);
                ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
                ctx.restore();

                // spinner middle2
                sprite = main.skin["spinner-middle2"];
                size = [osuToPixelsX(sprite.width) * 0.625 * scale, osuToPixelsY(sprite.height) * 0.625 * scale];
                timeMaxRPM = baseTimeMaxRPM / 3;
                ctx.save();
                ctx.translate(osuToPixelsX(256) + margins[0], osuToPixelsY(192) + margins[1]);
                ctx.rotate((Math.pow(clamp(0, (time - obj[2]) / timeMaxRPM, 1), pow) / pow * timeMaxRPM
                    + clamp(0, time - obj[2] - timeMaxRPM, obj[5] - obj[2] - timeMaxRPM)) / 1000 / 60 * -maxRPM * Math.PI * 2);
                ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
                ctx.restore();

                // spinner middle
                sprite = main.skin["spinner-middle"];
                size = [osuToPixelsX(sprite.width) * 0.625 * scale, osuToPixelsY(sprite.height) * 0.625 * scale];
                ctx.drawImage(sprite, osuToPixelsX(256) + margins[0] - size[0] / 2,
                    osuToPixelsY(192) + margins[1] - size[1] / 2, size[0], size[1]);
            }

            const maxRPM = 477;
            sprite = main.skin["cursor"];
            const size2 = [osuToPixelsX(main.beatmap.radius) / 64 * sprite.width, osuToPixelsY(main.beatmap.radius) / 64 * sprite.height];
            ctx.save();
            ctx.translate(osuToPixelsX(obj[0]) + margins[0], osuToPixelsY(obj[1]) + margins[1]);
            ctx.rotate(-clamp(0, time - obj[2], obj[5] - obj[2]) / 1000 / 60 * maxRPM * Math.PI * 2);
            ctx.drawImage(sprite, -size2[0] / 2, -size2[1] / 2 - 100, size2[0], size2[1]);
            ctx.restore();

            // approach circle
            sprite = main.skin["spinner-approachcircle"];
            const approachScale = 0.05 + clamp(0, (obj[5] - time) / (obj[5] - obj[2]), 1) * 0.95;
            size = [osuToPixelsX(sprite.width) * 1.16 * approachScale, osuToPixelsY(sprite.height) * 1.16 * approachScale];
            ctx.drawImage(sprite, osuToPixelsX(256) + margins[0] - size[0] / 2,
                osuToPixelsY(192) + margins[1] - size[1] / 2, size[0], size[1]);

            // spinner clear
            const temp = time - obj[2] - (obj[5] - obj[2]) * 0.45;
            if (temp > 0) {
                sprite = main.skin["spinner-clear"];
                const scale = temp < 225 ? (1.7 - easeOut(clamp(0, temp / 225, 1))) : (0.7 + clamp(0, (temp - 225) / 141, 1) * 0.2);
                size = [osuToPixelsX(sprite.width) * 0.7 * scale, osuToPixelsY(sprite.height) * 0.7 * scale];
                if (ctx.globalAlpha == 1) {
                    ctx.globalAlpha = clamp(0, temp / 366, 1);
                }
                ctx.drawImage(sprite, osuToPixelsX(256) + margins[0] - size[0] / 2,
                    osuToPixelsY(86.5) + margins[1] - size[1] / 2, size[0], size[1]);
            }
        }

        index--;
    }

    // draw approach circles
    for (let obj of approachQueue) {
        const approachScale = 1 + clamp(0, 1 - (time - (obj[2] - main.beatmap.preempt)) / main.beatmap.preempt, 1) * 3;
        ctx.globalAlpha = clamp(0, (time - (obj[2] - main.beatmap.preempt)) / main.beatmap.fadein, 0.9) / 0.9 * 0.5;

        // get tinted approachcircle
        const tinted = main.skin["approachcircle"][obj.at(-1)[1] % main.skin.ini.combos.length];

        const size = [osuToPixelsX(main.beatmap.radius) / 64 * tinted.width * approachScale, osuToPixelsY(main.beatmap.radius) / 64 * tinted.height * approachScale];
        ctx.drawImage(tinted, osuToPixelsX(obj[0]) + margins[0] - size[0] / 2, osuToPixelsX(obj[1]) + margins[1] - size[1] / 2, size[0], size[1]);
    }

    // draw slider elements with higher priority
    for (let obj of followQueue) {
        const endTime = obj[2] + obj.at(-2) * obj[6];

        if (time < endTime) {
            const slideN = (time - obj[2]) / obj.at(-2);
            const ratio = (Math.floor(slideN) % 2) ? (1 - (slideN % 1)) : (slideN % 1);
            const followPos = getFollowPosition(obj, ratio * obj[7]);

            // follow circle
            let sprite = main.skin["sliderfollowcircle"];
            let followScale = 0.5 + easeOut(clamp(0, (time - obj[2]) / 150, 1)) * 0.5;
            if (followScale >= 1) {
                // follow circle expands when touching slider ticks
                const slideN = Math.max(Math.floor((time - obj[2]) / obj.at(-2)), 0);
                if (slideN % 2) {
                    const ticks = [...getSliderTicks(obj), obj.at(-2)];
                    const lastTouchedTick = ticks.find(x => obj.at(-2) - x < time - (obj[2] + obj.at(-2) * slideN)) ?? ticks[0];
                    followScale = 1 + (1 - clamp(0, (time - (obj[2] + obj.at(-2) * slideN) - obj.at(-2) + lastTouchedTick) / 200, 1)) * 0.1;
                }
                else {
                    const ticks = [0, ...getSliderTicks(obj)];
                    const lastTouchedTick = ticks[ticks.findIndex(x => x >= time - (obj[2] + obj.at(-2) * slideN)) - 1] ?? ticks.at(-1);
                    followScale = 1 + (1 - clamp(0, (time - (obj[2] + obj.at(-2) * slideN) - lastTouchedTick) / 200, 1)) * 0.1;
                }
            }
            let size = [osuToPixelsX(main.beatmap.radius) / 64 * sprite.width * followScale, osuToPixelsY(main.beatmap.radius) / 64 * sprite.height * followScale];
            ctx.globalAlpha = clamp(0, (time - obj[2]) / 60, 1);
            ctx.drawImage(sprite, osuToPixelsX(followPos[0]) + margins[0] - size[0] / 2, osuToPixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);

            // slider ball
            ctx.globalAlpha = 1;
            if (main.skin.isDefaultSliderBall) {
                sprite = main.skin["sliderb-nd"];
                size = [osuToPixelsX(main.beatmap.radius) / 64 * sprite.width, osuToPixelsY(main.beatmap.radius) / 64 * sprite.height];
                ctx.drawImage(sprite, osuToPixelsX(followPos[0]) + margins[0] - size[0] / 2, osuToPixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);
            }
            const sliderbFrame = parseInt((time - obj[2]) / 16.6);
            sprite = main.skin.sliderb[sliderbFrame % main.skin.sliderb.length][parseInt(main.skin.ini.General.AllowSliderBallTint) ? obj.at(-1)[1] % main.skin.ini.combos.length : 0];
            const flipX = (parseInt(main.skin.ini.General.SliderBallFlip) && Math.floor(slideN) % 2) ? -1 : 1;
            const flipY = followPos[3] ? -1 : 1;
            size = [osuToPixelsX(main.beatmap.radius) / 64 * sprite.width, osuToPixelsY(main.beatmap.radius) / 64 * sprite.height];
            ctx.save();
            ctx.translate(osuToPixelsX(followPos[0]) + margins[0], osuToPixelsY(followPos[1]) + margins[1]);
            ctx.rotate(followPos[2]);
            ctx.scale(flipX, flipY);
            ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
            ctx.restore();

            if (main.skin.isDefaultSliderBall) {
                sprite = main.skin["sliderb-spec"];
                size = [osuToPixelsX(main.beatmap.radius) / 64 * sprite.width, osuToPixelsY(main.beatmap.radius) / 64 * sprite.height];
                ctx.globalCompositeOperation = "lighter";
                ctx.drawImage(sprite, osuToPixelsX(followPos[0]) + margins[0] - size[0] / 2, osuToPixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);
                ctx.globalCompositeOperation = "source-over";
            }
        }
        else {
            // follow circle
            const sprite = main.skin["sliderfollowcircle"];
            const followPos = getFollowPosition(obj, obj[6] % 2 ? obj[7] : 0);
            const scale = 1 - clamp(0, easeOut((time - endTime) / 150) * 0.2, 0.2);
            const size = [osuToPixelsX(main.beatmap.radius) / 64 * sprite.width * scale, osuToPixelsY(main.beatmap.radius) / 64 * sprite.height * scale];
            ctx.globalAlpha = clamp(0, (obj[2] + obj.at(-2) * obj[6] - time + 200) / 200, 1);
            ctx.drawImage(sprite, osuToPixelsX(followPos[0]) + margins[0] - size[0] / 2, osuToPixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);
        }
    }

    adjustSliderGradientDivisions();
}

const adjustSliderGradientDivisions = () => {
    /*const deltaT = performance.now() - prevTime;
        if (prevTime != 0) {
            if (avgTimes.length < 100) {
                avgTimes.push(deltaT);
                if (avgTimes.length == 100) {
                    avgTime = avgTimes.reduce((x, y) => x + y, 0) / 100;
                }
            }
            if (avgTime) {
                if (sliderGradientDivisions < 20 && deltaT < avgTime - 0.1) {
                    sliderGradientDivisions++;
                }
                if (sliderGradientDivisions > 2 && deltaT > avgTime + 1) {
                    sliderGradientDivisions--;
                }
                document.querySelector("#fps").innerHTML = Math.round(1000 / deltaT);
            }
        }
        console.log(sliderGradientDivisions)
        prevTime += deltaT;*/

    // adjust slider gradient divison number (n.1 performance killer) to boost fps
    framesN++;
    const now = performance.now();
    if (prevTime == -1) {
        prevTime = now;
    }
    else {
        if (!avgFPS) {
            avgFrames.push(now - prevTime);
            prevTime = now;
            if (avgFrames.length > 99) {
                avgFPS = 1000 / avgFrames.sort()[avgFrames.length / 2];
            }
        }
        else if (now - prevTime > 100) {
            const fps = framesN / (now - prevTime) * 1000;
            if (sliderGradientDivisions < 20 && fps > avgFPS - 10) {
                sliderGradientDivisions++;
            }
            if (sliderGradientDivisions > 6 && fps < avgFPS - 20) {
                sliderGradientDivisions--;
            }
            prevTime = now;
            framesN = 0;
        }
    }
}

const easeOut = (t) => {
    return 1.5 * t / (0.5 + t);
}
const easierOut = (t) => {
    return 1.2 * t / (0.2 + t);
}
