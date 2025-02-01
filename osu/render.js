import { beatmap, skin, breaks, activeMods } from "/osu/osu.js";
import { options } from "/popup.js";
import { mod, clamp, lerp, range, rgb, distance, $ } from "/functions.js";
import { strokeSlider, getFollowPosition, getSliderTicks } from "/osu/slider.js";

let canvasSize = [];
const minMargin = 20;
const drawGrid = false;
const maxRPM = 477;

const BEZIER_SEGMENT_MAX_LENGTH = 10;        // in screen pixels
export let bezierSegmentMaxLengthSqrd;       // in osu pixels, squared

let canvas, ctx, bufferCanvas, bufferCtx;
let lastKiaiTime = -1, wasInKiai = false;
let lastBreakTime = -1, wasInBreak;
export let fieldSize = [], margins, bgSize;
export let osuCoords2PixelsX, osuCoords2PixelsY;
let prevTime = -1, framesN = 0, avgFPS, avgFrames = [];
let sliderGradientDivisions = 20;
const trailInterval = 16, longTrailStepLength = 3;
const precomputedTrailPoints = [];
let flashlight;

export async function init() {
    canvas = $("#main-canvas");
    ctx = canvas.getContext("2d");
    bufferCanvas = document.createElement("canvas");
    bufferCtx = bufferCanvas.getContext("2d");

    canvasSize[0] = canvas.width;
    canvasSize[1] = canvas.height;
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

    osuCoords2PixelsX = (val) => val / 512 * fieldSize[0];
    osuCoords2PixelsY = (val) => (activeMods.has("hr") ? 384 - val : val) / 512 * fieldSize[0];

    const bg = beatmap.backgroundPicture;
    if (bg) {
        if (canvasSize[0] / canvasSize[1] > bg.width / bg.height) {
            bgSize = [canvasSize[0], bg.height * canvasSize[0] / bg.width];
        }
        else {
            bgSize = [bg.width * canvasSize[1] / bg.height, canvasSize[1]];
        }
        bgSize = [...bgSize, (canvasSize[1] - bgSize[1]) / 2, (canvasSize[0] - bgSize[0]) / 2];
    }

    bezierSegmentMaxLengthSqrd = fieldSize[0] > fieldSize[1] ?
        Math.pow(BEZIER_SEGMENT_MAX_LENGTH / fieldSize[0] * 512, 2) :
        Math.pow(BEZIER_SEGMENT_MAX_LENGTH / fieldSize[1] * 384, 2);

    flashlight = document.querySelector("#flashlight");
}

export const precalculateTrailPoints = () => {
    let prevTrailPoint;

    for (let time2 = -trailInterval * 34; time2 < beatmap.HitObjects.at(-1).endTime; time2 += trailInterval) {
        let [x, y] = getTrailPoint(time2);

        if (x == null) {
            precomputedTrailPoints.push([time2, 0]);
        }
        else {
            if (prevTrailPoint) {
                const thisTrailPoint = [x, y];
                const dist = distance(thisTrailPoint, prevTrailPoint);
                let step = prevTrailPoint[2];
                while (step < dist) {
                    step += longTrailStepLength;
                }
                prevTrailPoint = [x, y, step - dist];
                precomputedTrailPoints.push([time2, prevTrailPoint[2]]);
            }
            else {
                prevTrailPoint = [x, y, 0];
                precomputedTrailPoints.push([time2, 0]);
            }
        }
    }
}

export function render(time) {

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // draw background
    if (beatmap.backgroundPicture) {
        ctx.drawImage(beatmap.backgroundPicture, bgSize[3], bgSize[2], bgSize[0], bgSize[1]);
    }
 
    // dim background
    ctx.fillStyle = `rgb(0,0,0,${getBGDim(options.BackgroundDim, time)})`;
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

    followPoints(time);

    // paint hitobjects from last to first
    var index = beatmap.HitObjects_drawOrder.length - 1;
    var approachQueue = [], followQueue = [];

    while (index >= 0) {
        const obj = beatmap.HitObjects_drawOrder[index];

        if (obj.time + (obj.isSlider ? obj.duration * obj.slides : (obj.isSpinner ? obj.duration : 0)) + beatmap.fadeout < time ||
            obj.time - beatmap.preempt > time) {
            index--;
            continue;
        }

        if (obj.isSlider) {
            bufferCtx.globalCompositeOperation = "source-over";
            bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
            bufferCtx.beginPath();

            var snake;
            if (time < obj.time) {
                if (index == 0 || !activeMods.has("hd")) {
                    approachQueue.push(obj);
                }
                ctx.globalAlpha = clamp(0, (time - (obj.time - beatmap.preempt)) / beatmap.fadein, 1);
                snake = clamp(0, (time - (obj.time - beatmap.preempt)) / beatmap.fadein, 0.5) * 2;
            }
            else {
                if (time < obj.time + obj.duration * obj.slides + 200) {
                    followQueue.push(obj);
                }
                if (activeMods.has("hd")) {
                    // TODO: INCORRECT
                    ctx.globalAlpha = easingFunctions.easeIn(clamp(0, (obj.endTime - time) / (obj.duration * obj.slides), 1));
                }
                else {
                    ctx.globalAlpha = clamp(0, (obj.time + obj.duration * obj.slides + beatmap.fadeout - time) / beatmap.fadeout, 1);
                }
                snake = 1;
            }

            bufferCtx.moveTo(osuCoords2PixelsX(obj.x) + margins[0], osuCoords2PixelsY(obj.y) + margins[1]);
            strokeSlider(obj, obj.pixelLength * snake, true, bufferCtx);

            const diameter = beatmap.radius * 2 / 512 * fieldSize[0] * 0.8;
            bufferCtx.lineJoin = "round";
            bufferCtx.lineCap = "round";
            bufferCtx.globalAlpha = 1

            // slider border
            bufferCtx.lineWidth = diameter * 1.15;
            bufferCtx.strokeStyle = `rgb(${skin.ini.Colours.SliderBorder})`;
            bufferCtx.stroke();
            bufferCtx.lineWidth = diameter;
            bufferCtx.globalCompositeOperation = "destination-out";
            bufferCtx.strokeStyle = "black";
            bufferCtx.stroke();

            ctx.shadowColor = "#404040";
            ctx.shadowBlur = 0.11 * osuCoords2PixelsX(beatmap.radius);
            ctx.drawImage(bufferCanvas, 0, 0);
            ctx.shadowColor = "transparent";

            // slider gradient
            const gradientColor = rgb(skin.ini.Colours.SliderTrackOverride) || skin.ini.combos[obj.comboIndex % skin.ini.combos.length];
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

            const slideN = Math.max(Math.floor((time - obj.time) / obj.duration), 0);

            //#region slider end
            let circleSprite = skin["sliderendcircle"][obj.comboIndex % skin.ini.combos.length];
            let overlaySprite = skin["sliderendcircleoverlay"];

            const _drawEnd = (sprite, position, startTime, scale) => {
                const size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height];
                const scale2 = 1 + (scale ? (1 - easingFunctions.easeOut(mod((time - startTime) / obj.beatLength, 1))) * 0.3 : 0);
                ctx.globalAlpha = clamp(0, (time - startTime) / 150, 1);
                ctx.drawImage(sprite, osuCoords2PixelsX(position[0]) + margins[0] - size[0] / 2 * scale2, osuCoords2PixelsY(position[1]) + margins[1] - size[1] / 2 * scale2, size[0] * scale2, size[1] * scale2);
            };

            // slider end at the end of the slider
            if (slideN < obj.slides && slideN % 2 == 0 || slideN < obj.slides - 1) {
                let position = getFollowPosition(obj, obj.pixelLength);
                let startTime = obj.time + obj.duration * (slideN == 0 || slideN % 2 ? slideN : slideN - 1) + (slideN == 0 ? -beatmap.preempt + beatmap.fadein / 2 : 0);
                _drawEnd(circleSprite, position, startTime, false);
                _drawEnd(overlaySprite, position, startTime, false);
            }
            // slider end at the start of the slider (when slides > 1)
            if (slideN < obj.slides && slideN % 2 == 1 || slideN < obj.slides - 1) {
                let position = getFollowPosition(obj, 0);
                let startTime = obj.time + obj.duration * (slideN % 2 ? slideN - 1 : slideN);
                _drawEnd(circleSprite, position, startTime, false);
                _drawEnd(overlaySprite, position, startTime, false);
            }

            // slider ends expanding and fading out after being tapped
            let i = slideN;
            while (i > 0 && i <= obj.slides && time - (obj.time + obj.duration * i) < beatmap.fadeout) {
                const position = getFollowPosition(obj, obj.pixelLength * (i % 2));
                const scale = 1 + easingFunctions.easeOut(clamp(0, 1 - (obj.time + obj.duration * i + beatmap.fadeout - time) / beatmap.fadeout, 1)) * 0.35;
                ctx.globalAlpha = clamp(0, (obj.time + obj.duration * slideN + beatmap.fadeout - time) / beatmap.fadeout, 1);

                let size = [osuCoords2PixelsX(beatmap.radius) / 64 * circleSprite.width, osuCoords2PixelsX(beatmap.radius) / 64 * circleSprite.height];
                ctx.drawImage(circleSprite, osuCoords2PixelsX(position[0]) + margins[0] - size[0] / 2 * scale, osuCoords2PixelsY(position[1]) + margins[1] - size[1] / 2 * scale, size[0] * scale, size[1] * scale);
                size = [osuCoords2PixelsX(beatmap.radius) / 64 * overlaySprite.width, osuCoords2PixelsX(beatmap.radius) / 64 * overlaySprite.height];
                ctx.drawImage(overlaySprite, osuCoords2PixelsX(position[0]) + margins[0] - size[0] / 2 * scale, osuCoords2PixelsY(position[1]) + margins[1] - size[1] / 2 * scale, size[0] * scale, size[1] * scale);
                i--;
            }
            //#endregion

            //#region reverse arrows
            if (obj.slides > 1) {
                const reverse1 = slideN < obj.slides - 1;
                const reverse2 = slideN < obj.slides - 2;

                const sprite = skin["reversearrow"];
                const size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height];

                const _drawArrow = (position, startTime, flip) => {
                    const scale = 1 + (1 - easingFunctions.easeOut(mod((time - startTime) / obj.beatLength, 1))) * 0.3;
                    ctx.globalAlpha = clamp(0, (time - startTime) / 150, 1);
                    ctx.save();
                    ctx.translate(osuCoords2PixelsX(position[0]) + margins[0], osuCoords2PixelsY(position[1]) + margins[1]);
                    ctx.rotate(position[2] * (activeMods.has("hr") ? -1 : 1) + (flip ? Math.PI : 0));
                    ctx.drawImage(sprite, -size[0] / 2 * scale, -size[1] / 2 * scale, size[0] * scale, size[1] * scale);
                    ctx.restore();
                };

                // arrow at the end (assuming 1 slide) of the slider
                if ((slideN % 2 == 0 && reverse1) || (slideN % 2 == 1 && reverse2)) {
                    _drawArrow(getFollowPosition(obj, obj.pixelLength), obj.time + obj.duration * (slideN == 0 || slideN % 2 ? slideN : slideN - 1) + (slideN == 0 ? -beatmap.preempt + beatmap.fadein / 2 : 0), true);
                }
                // arrow at the start (assuming 1 slide) of the slider
                if ((slideN % 2 == 0 && reverse2) || (slideN % 2 == 1 && reverse1)) {
                    _drawArrow(getFollowPosition(obj, 0), obj.time + obj.duration * (slideN % 2 ? slideN - 1 : slideN), false);
                }

                // slider arrows expanding and fading out after being tapped
                let i = slideN;
                while (i > 0 && i < obj.slides && time - (obj.time + obj.duration * i) < beatmap.fadeout) {
                    const arrowScale = 1 + easingFunctions.easeOut(clamp(0, 1 - (obj.time + obj.duration * i + beatmap.fadeout - time) / beatmap.fadeout, 1)) * 0.35;
                    ctx.globalAlpha = clamp(0, (obj.time + obj.duration * slideN + beatmap.fadeout - time) / beatmap.fadeout, 1);
                    const position = getFollowPosition(obj, obj.pixelLength * (i % 2));
                    ctx.save();
                    ctx.translate(osuCoords2PixelsX(position[0]) + margins[0], osuCoords2PixelsY(position[1]) + margins[1]);
                    ctx.rotate(position[2] * (activeMods.has("hr") ? -1 : 1) + (i % 2 ? Math.PI : 0));
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

            while (n < obj.slides) {
                var firstTickTime = n == 0 ? (obj.time - beatmap.fadein) : (obj.time + obj.duration * n - 280 + (n % 2 ? obj.duration - ticks.at(-1) : ticks[0]) / 2);

                for (let i = 0; i < ticks.length; i++) {
                    const tick = ticks[i];
                    const tickEndTime = obj.time + obj.duration * n + (n % 2 ? obj.duration - ticks[ticks.length - i - 1] : tick);

                    if (time < tickEndTime) {
                        const sprite = skin["sliderscorepoint"];
                        const followPos = getFollowPosition(obj, ((n > 0 && n % 2) ? ticks[ticks.length - i - 1] : tick) / obj.duration * obj.pixelLength);
                        const temp = time - firstTickTime - tick / 2;
                        const scale = temp < 140 ? (0.5 + clamp(0, temp / 140, 1) * 0.7) : (1 + (1 - clamp(0, (temp - 140) / 140, 1)) * 0.2);
                        const size = [osuCoords2PixelsX(beatmap.radius) * 2 / 128 * sprite.width * scale, osuCoords2PixelsX(beatmap.radius) * 2 / 128 * sprite.height * scale];
                        ctx.globalAlpha = clamp(0, temp / 140, 1);
                        if (activeMods.has("hd") && temp > 140) {
                            // TODO: incorrect
                            ctx.globalAlpha = clamp(0, 1 - (temp - 140) / (tickEndTime - (firstTickTime - tick / 2) - 140), 1);
                        }
                        ctx.drawImage(sprite, osuCoords2PixelsX(followPos[0]) + margins[0] - size[0] / 2, osuCoords2PixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);

                        drawn++;
                    }
                }

                if (drawn != 0) break;
                else n++;
            }
            //#endregion
        }
        if (obj.isHitCircle || obj.isSlider) {     // hitcircle

            let circleSprite, overlaySprite;
            if (obj.isSlider) {
                circleSprite = skin["sliderstartcircle"][obj.comboIndex % skin.ini.combos.length];
                overlaySprite = skin["sliderstartcircleoverlay"];
            }
            else {
                circleSprite = skin["hitcircle"][obj.comboIndex % skin.ini.combos.length];
                overlaySprite = skin["hitcircleoverlay"];
            }

            let circleScale;
            if (activeMods.has("hd")) {
                if (time <= obj.time) {
                    if (index == 0) {
                        approachQueue.push(obj);
                    }

                    const hiddenFadeInStart = obj.time - beatmap.preempt;
                    const hiddenFadeInEnd = obj.time - (beatmap.preempt * 0.6);
                    ctx.globalAlpha = clamp(0, 1 - (hiddenFadeInEnd - time) / (hiddenFadeInEnd - hiddenFadeInStart), 1);

                    // hidden hitobject body fadeout
                    const hiddenFadeOutStart = obj.time - (beatmap.preempt * 0.6);
                    const hiddenFadeOutEnd = obj.time - (beatmap.preempt * 0.3);
                    if (time >= hiddenFadeOutStart)
                        ctx.globalAlpha = clamp(0, (hiddenFadeOutEnd - time) / (hiddenFadeOutEnd - hiddenFadeOutStart), 1);
                }
                else {
                    ctx.globalAlpha = 0;
                }
                circleScale = 1;
            }
            else {
                if (time <= obj.time) {
                    approachQueue.push(obj);
                    ctx.globalAlpha = clamp(0, (time - (obj.time - beatmap.preempt)) / beatmap.fadein, 1);
                    circleScale = 1;
                }
                else {
                    ctx.globalAlpha = clamp(0, (obj.time + beatmap.fadeout - time) / beatmap.fadeout, 1);
                    circleScale = 1 + easingFunctions.easeOut(clamp(0, 1 - (obj.time + beatmap.fadeout - time) / beatmap.fadeout, 1)) * 0.35;
                }
            }

            var size = [osuCoords2PixelsX(beatmap.radius) * 2 / 128 * circleSprite.width * circleScale, osuCoords2PixelsX(beatmap.radius) * 2 / 128 * circleSprite.height * circleScale];
            ctx.drawImage(circleSprite, osuCoords2PixelsX(obj.x) + margins[0] - size[0] / 2, osuCoords2PixelsY(obj.y) + margins[1] - size[1] / 2, size[0], size[1]);
            size = [osuCoords2PixelsX(beatmap.radius) * 2 / 128 * overlaySprite.width * circleScale, osuCoords2PixelsX(beatmap.radius) * 2 / 128 * overlaySprite.height * circleScale];
            ctx.drawImage(overlaySprite, osuCoords2PixelsX(obj.x) + margins[0] - size[0] / 2, osuCoords2PixelsY(obj.y) + margins[1] - size[1] / 2, size[0], size[1]);

            // draw combo number
            if (time > obj.time && !activeMods.has("hd")) {
                // number disappears 60 ms after being hit
                ctx.globalAlpha = clamp(0, (obj.time + 60 - time) / 60, 1);
            }

            const combo = obj.combo.toString();
            const width = skin["default-" + combo[0]].width;
            const height = skin["default-" + combo[0]].height;
            const totalWidth = width * combo.length - skin.ini.Fonts.HitCircleOverlap * (combo.length - 1);
            const numberScale = beatmap.radius / 80 / 512 * fieldSize[0];
            for (let i = 0; i < combo.length; i++) {
                const sprite = skin["default-" + combo[i]];

                const [x, y, w, h] = [
                    osuCoords2PixelsX(obj.x) + margins[0] + (-totalWidth / 2 + (width - skin.ini.Fonts.HitCircleOverlap) * i) * numberScale,
                    osuCoords2PixelsY(obj.y) + margins[1] - height / 2 * numberScale,
                    width * (sprite.naturalWidth / skin["default-" + combo[0]].naturalWidth) * numberScale,
                    height * (sprite.naturalHeight / skin["default-" + combo[0]].naturalHeight) * numberScale
                ];

                ctx.drawImage(sprite, x, y, w, h);
            }
        }
        else if (obj.isSpinner) {
            let sprite;

            if (time < obj.endTime) {
                ctx.globalAlpha = clamp(0, (time - obj.time + 400) / 400, 1);
            }
            else {
                ctx.globalAlpha = clamp(0, (obj.endTime - time + beatmap.fadeout) / beatmap.fadeout, 1);
            }

            if (skin.isOldSpinner) {
                // spinner background
                sprite = skin["spinner-background"][0];
                size = [osuCoords2PixelsX(sprite.width) * 0.625, osuCoords2PixelsX(sprite.height) * 0.625];
                ctx.drawImage(sprite, osuCoords2PixelsX(256) + margins[0] - size[0] / 2,
                    osuCoords2PixelsX(192) + margins[1] - size[1] / 2, size[0], size[1]);

                // spinner circle
                sprite = skin["spinner-circle"];
                size = [osuCoords2PixelsX(sprite.width) * 0.625, osuCoords2PixelsX(sprite.height) * 0.625];
                const pow = 2;
                const maxRPM = 477;
                // time it takes to reach maxRPM
                const timemaxRPM = obj.duration / 10;
                ctx.save();
                ctx.translate(osuCoords2PixelsX(256) + margins[0], osuCoords2PixelsX(192) + margins[1]);
                ctx.rotate(((Math.pow(clamp(0, (time - obj.time) / timemaxRPM, 1), pow) / pow * timemaxRPM
                    + clamp(0, time - obj.time - timemaxRPM, obj.duration - timemaxRPM)) / 1000 / 60 * -maxRPM * Math.PI * 2) * (activeMods.has("hr") ? -1 : 1));
                ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
                ctx.restore();

                // spinner metre
                sprite = skin["spinner-metre"];
                const barN = Math.floor(clamp(0, (time - obj.time) / obj.duration / 0.45, 1) * 10);
                ctx.drawImage(sprite,
                    0, (10 - barN) * (768 - 34) / 10 * sprite.naturalHeight / sprite.height,
                    sprite.naturalWidth, barN * (768 - 34) / 10 * sprite.naturalHeight / sprite.height,
                    canvas.width / 2 - 512 * fieldSize[0] / 800, (canvas.height / 2 - (383 - 34) * fieldSize[1] / 600) + (10 - barN) * (768 - 34) / 10 * fieldSize[1] / 600,
                    sprite.width * fieldSize[0] / 800, barN * (768 - 34) / 10 * fieldSize[1] / 600
                );
            }
            else {
                const pow = 2;
                const baseTimeMaxRPM = (obj.duration) / 10;
                const scale = 0.8 + easingFunctions.easierOut(clamp(0, (time - obj.time) / (obj.duration * 0.45), 1)) * 0.2;
                let maxRPM, timeMaxRPM;

                // spinner glow
                sprite = skin["spinner-glow"][0];
                const tempAlpha = ctx.globalAlpha;
                if (time < obj.endTime) {
                    ctx.globalAlpha = clamp(0, (time - obj.time) / (obj.duration * 0.45), 1);
                }
                else {
                    ctx.globalAlpha = clamp(0, (obj.endTime + beatmap.fadeout - time) / beatmap.fadeout, 1);
                }
                size = [osuCoords2PixelsX(sprite.width) * 0.625 * scale, osuCoords2PixelsX(sprite.height) * 0.625 * scale];
                ctx.drawImage(sprite, osuCoords2PixelsX(256) + margins[0] - size[0] / 2,
                    osuCoords2PixelsX(192) + margins[1] - size[1] / 2, size[0], size[1]);
                ctx.globalAlpha = tempAlpha;

                // spinner bottom
                sprite = skin["spinner-bottom"];
                size = [osuCoords2PixelsX(sprite.width) * 0.625 * scale, osuCoords2PixelsX(sprite.height) * 0.625 * scale];
                maxRPM = 75;
                timeMaxRPM = baseTimeMaxRPM / 5;
                ctx.save();
                ctx.translate(osuCoords2PixelsX(256) + margins[0], osuCoords2PixelsX(192) + margins[1]);
                ctx.rotate(((Math.pow(clamp(0, (time - obj.time) / baseTimeMaxRPM, 1), pow) / pow * baseTimeMaxRPM
                    + clamp(0, time - obj.time - baseTimeMaxRPM, obj.duration - baseTimeMaxRPM)) / 1000 / 60 * -maxRPM * Math.PI * 2) * (activeMods.has("hr") ? -1 : 1));
                ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
                ctx.restore();

                // spinner top
                sprite = skin["spinner-top"];
                size = [osuCoords2PixelsX(sprite.width) * 0.625 * scale, osuCoords2PixelsX(sprite.height) * 0.625 * scale];
                maxRPM = 230;
                timeMaxRPM = baseTimeMaxRPM / 3;
                ctx.save();
                ctx.translate(osuCoords2PixelsX(256) + margins[0], osuCoords2PixelsX(192) + margins[1]);
                ctx.rotate(((Math.pow(clamp(0, (time - obj.time) / timeMaxRPM, 1), pow) / pow * timeMaxRPM
                    + clamp(0, time - obj.time - timeMaxRPM, obj.duration - timeMaxRPM)) / 1000 / 60 * -maxRPM * Math.PI * 2) * (activeMods.has("hr") ? -1 : 1));
                ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
                ctx.restore();

                // spinner middle2
                sprite = skin["spinner-middle2"];
                size = [osuCoords2PixelsX(sprite.width) * 0.625 * scale, osuCoords2PixelsX(sprite.height) * 0.625 * scale];
                timeMaxRPM = baseTimeMaxRPM / 3;
                ctx.save();
                ctx.translate(osuCoords2PixelsX(256) + margins[0], osuCoords2PixelsX(192) + margins[1]);
                ctx.rotate(((Math.pow(clamp(0, (time - obj.time) / timeMaxRPM, 1), pow) / pow * timeMaxRPM
                    + clamp(0, time - obj.time - timeMaxRPM, obj.duration - timeMaxRPM)) / 1000 / 60 * -maxRPM * Math.PI * 2) * (activeMods.has("hr") ? -1 : 1));
                ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
                ctx.restore();

                // spinner middle
                sprite = skin["spinner-middle"];
                size = [osuCoords2PixelsX(sprite.width) * 0.625 * scale, osuCoords2PixelsX(sprite.height) * 0.625 * scale];
                ctx.drawImage(sprite, osuCoords2PixelsX(256) + margins[0] - size[0] / 2,
                    osuCoords2PixelsX(192) + margins[1] - size[1] / 2, size[0], size[1]);
            }

            // approach circle
            sprite = skin["spinner-approachcircle"];
            const approachScale = 0.05 + clamp(0, (obj.endTime - time) / obj.duration, 1) * 0.95;
            size = [osuCoords2PixelsX(sprite.width) * 1.16 * approachScale, osuCoords2PixelsX(sprite.height) * 1.16 * approachScale];
            ctx.drawImage(sprite, osuCoords2PixelsX(256) + margins[0] - size[0] / 2,
                osuCoords2PixelsX(192) + margins[1] - size[1] / 2, size[0], size[1]);

            // spinner clear
            const temp = time - obj.time - obj.duration * 0.45;
            if (temp > 0) {
                sprite = skin["spinner-clear"];
                const scale = temp < 225 ? (1.7 - easingFunctions.easeOut(clamp(0, temp / 225, 1))) : (0.7 + clamp(0, (temp - 225) / 141, 1) * 0.2);
                size = [osuCoords2PixelsX(sprite.width) * 0.7 * scale, osuCoords2PixelsX(sprite.height) * 0.7 * scale];
                if (ctx.globalAlpha == 1) {
                    ctx.globalAlpha = clamp(0, temp / 366, 1);
                }
                ctx.drawImage(sprite, osuCoords2PixelsX(256) + margins[0] - size[0] / 2,
                    osuCoords2PixelsX(86.5) + margins[1] - size[1] / 2, size[0], size[1]);
            }
        }

        index--;
    }

    // draw approach circles
    for (let obj of approachQueue) {
        const approachScale = 1 + clamp(0, 1 - (time - (obj.time - beatmap.preempt)) / beatmap.preempt, 1) * 3;
        ctx.globalAlpha = clamp(0, (time - (obj.time - beatmap.preempt)) / beatmap.fadein, 0.9) / 0.9 * 0.5;

        // get tinted approachcircle
        const tinted = skin["approachcircle"][obj.comboIndex % skin.ini.combos.length];

        const size = [osuCoords2PixelsX(beatmap.radius) / 64 * tinted.width * approachScale, osuCoords2PixelsX(beatmap.radius) / 64 * tinted.height * approachScale];
        ctx.drawImage(tinted, osuCoords2PixelsX(obj.x) + margins[0] - size[0] / 2, osuCoords2PixelsY(obj.y) + margins[1] - size[1] / 2, size[0], size[1]);
    }

    // draw slider elements with higher priority
    for (let obj of followQueue) {
        const endTime = obj.time + obj.duration * obj.slides;

        if (time < endTime) {
            const slideN = (time - obj.time) / obj.duration;
            const ratio = (Math.floor(slideN) % 2) ? (1 - (slideN % 1)) : (slideN % 1);
            const followPos = getFollowPosition(obj, ratio * obj.pixelLength);

            // follow circle
            let sprite = skin["sliderfollowcircle"];
            let followScale = 0.5 + easingFunctions.easeOut(clamp(0, (time - obj.time) / 150, 1)) * 0.5;
            if (followScale >= 1) {
                // follow circle expands when touching slider ticks
                const slideN = Math.max(Math.floor((time - obj.time) / obj.duration), 0);
                if (slideN % 2) {
                    const ticks = [...getSliderTicks(obj), obj.duration];
                    const lastTouchedTick = ticks.find(x => obj.duration - x < time - (obj.time + obj.duration * slideN)) ?? ticks[0];
                    followScale = 1 + (1 - clamp(0, (time - (obj.time + obj.duration * slideN) - obj.duration + lastTouchedTick) / 200, 1)) * 0.1;
                }
                else {
                    const ticks = [0, ...getSliderTicks(obj)];
                    const lastTouchedTick = ticks[ticks.findIndex(x => x >= time - (obj.time + obj.duration * slideN)) - 1] ?? ticks.at(-1);
                    followScale = 1 + (1 - clamp(0, (time - (obj.time + obj.duration * slideN) - lastTouchedTick) / 200, 1)) * 0.1;
                }
            }
            let size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width * followScale, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height * followScale];
            ctx.globalAlpha = clamp(0, (time - obj.time) / 60, 1);
            ctx.drawImage(sprite, osuCoords2PixelsX(followPos[0]) + margins[0] - size[0] / 2, osuCoords2PixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);

            // slider ball
            ctx.globalAlpha = 1;
            if (skin.isDefaultSliderBall) {
                sprite = skin["sliderb-nd"];
                size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height];
                ctx.drawImage(sprite, osuCoords2PixelsX(followPos[0]) + margins[0] - size[0] / 2, osuCoords2PixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);
            }
            const sliderbFrame = parseInt((time - obj.time) / 16.6);
            sprite = skin.sliderb[sliderbFrame % skin.sliderb.length][parseInt(skin.ini.General.AllowSliderBallTint) ? obj.comboIndex % skin.ini.combos.length : 0];
            const flipX = (parseInt(skin.ini.General.SliderBallFlip) && Math.floor(slideN) % 2) ? -1 : 1;
            const flipY = followPos[3] ? -1 : 1;
            size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height];
            ctx.save();
            ctx.translate(osuCoords2PixelsX(followPos[0]) + margins[0], osuCoords2PixelsY(followPos[1]) + margins[1]);
            ctx.rotate(followPos[2] * (activeMods.has("hr") ? -1 : 1));
            ctx.scale(flipX, flipY);
            ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
            ctx.restore();

            if (skin.isDefaultSliderBall) {
                sprite = skin["sliderb-spec"];
                size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height];
                ctx.globalCompositeOperation = "lighter";
                ctx.drawImage(sprite, osuCoords2PixelsX(followPos[0]) + margins[0] - size[0] / 2, osuCoords2PixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);
                ctx.globalCompositeOperation = "source-over";
            }
        }
        else {
            // slider follow circle
            const sprite = skin["sliderfollowcircle"];
            const followPos = getFollowPosition(obj, obj.slides % 2 ? obj.pixelLength : 0);
            const scale = 1 - clamp(0, easingFunctions.easeOut((time - endTime) / 150) * 0.2, 0.2);
            const size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width * scale, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height * scale];
            ctx.globalAlpha = clamp(0, (obj.time + obj.duration * obj.slides - time + 200) / 200, 1);
            ctx.drawImage(sprite, osuCoords2PixelsX(followPos[0]) + margins[0] - size[0] / 2, osuCoords2PixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);
        }
    }

    // draw cursor
    if (options.ShowCursor) {
        const trailPoints = [];

        for (let time2 = parseInt(time / trailInterval) * trailInterval - (skin.isLongerCursorTrail ? trailInterval * 32 : trailInterval * 10); time2 < time + trailInterval; time2 += trailInterval) {
            time2 = Math.min(time2, time);
            let [x, y] = getTrailPoint(time2);

            if (x == null)
                continue;

            if (skin.isLongerCursorTrail) {
                trailPoints.push([x, y, time2]);

                if (time2 >= time) {
                    if (trailPoints.length > 0) {
                        const sprite = skin.cursortrail;
                        const size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width * 1.6, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height * 1.6];

                        let leftOverDist = precomputedTrailPoints.find(x => x[0] == parseInt(trailPoints[0][2] / trailInterval) * trailInterval)?.[1] ?? 0;
                        for (let i = 1; i < trailPoints.length; i++) {
                            const dist = distance(trailPoints[i], trailPoints[i - 1]);
                            let step;
                            for (step = leftOverDist; step < dist; step += longTrailStepLength) {
                                ctx.globalAlpha = clamp(0, ((i - 1) * trailInterval + (step / dist) * trailInterval) / 350, 1);
                                ctx.drawImage(sprite,
                                    osuCoords2PixelsX(trailPoints[i - 1][0] + (trailPoints[i][0] - trailPoints[i - 1][0]) * (step / dist)) + margins[0] - size[0] / 2,
                                    osuCoords2PixelsY(trailPoints[i - 1][1] + (trailPoints[i][1] - trailPoints[i - 1][1]) * (step / dist)) + margins[1] - size[1] / 2,
                                    size[0], size[1]);
                            }
                            leftOverDist = step - dist;
                        }
                    }

                    ctx.globalAlpha = 1;
                    let sprite = skin.cursor;
                    let size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width * 1.6, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height * 1.6];
                    const center = parseInt(skin.ini.General.CursorCentre);

                    if (parseInt(skin.ini.General.CursorRotate)) {
                        ctx.save();
                        ctx.translate(osuCoords2PixelsX(x) + margins[0], osuCoords2PixelsY(y) + margins[1]);
                        ctx.rotate(time / 10000 * Math.PI * 2);
                        ctx.drawImage(sprite, (-size[0] / 2) * center, (-size[1] / 2) * center, size[0], size[1]);
                        ctx.restore();
                    }
                    else {
                        ctx.drawImage(sprite, osuCoords2PixelsX(x) + margins[0] - size[0] / 2 * center, osuCoords2PixelsY(y) + margins[1] - size[1] / 2 * center, size[0], size[1]);
                    }

                    sprite = skin.cursormiddle;
                    size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width * 1.6, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height * 1.6];
                    ctx.drawImage(sprite, osuCoords2PixelsX(x) + margins[0] - size[0] / 2 * center, osuCoords2PixelsY(y) + margins[1] - size[1] / 2 * center, size[0], size[1]);
                }
            }
            else {
                const sprite = time2 < time ? skin.cursortrail : skin.cursor;
                const size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width * 1.6, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height * 1.6];
                ctx.globalAlpha = clamp(0, 1 - ((time - time2) / 160) * 0.94, 1);
                const center = parseInt(skin.ini.General.CursorCentre);

                if (time2 < time ? parseInt(skin.ini.General.CursorTrailRotate) : parseInt(skin.ini.General.CursorRotate)) {
                    ctx.save();
                    ctx.translate(osuCoords2PixelsX(x) + margins[0], osuCoords2PixelsY(y) + margins[1]);
                    ctx.rotate(time / 10000 * Math.PI * 2);
                    ctx.drawImage(sprite, (-size[0] / 2) * (time2 < time ? 1 : center), (-size[1] / 2) * (time2 < time ? 1 : center), size[0], size[1]);
                    ctx.restore();
                }
                else {
                    ctx.drawImage(sprite, osuCoords2PixelsX(x) + margins[0] - size[0] / 2 * (time2 < time ? 1 : center),
                        osuCoords2PixelsY(y) + margins[1] - size[1] / 2 * (time2 < time ? 1 : center), size[0], size[1]);
                }
            }
        }
    }

    // flashlight mod
    if (activeMods.has("fl")) {
        const [x, y, inSlider] = getTrailPoint(time);
        ctx.globalAlpha = 1;
        if (inSlider) {
            ctx.fillStyle = "#000000a0";
            ctx.fillRect(0, 0, canvasSize[0], canvasSize[1]);
        }
        ctx.drawImage(flashlight, clamp(-1100, osuCoords2PixelsX(x) - 1900/2 + margins[0], 800), clamp(-900, osuCoords2PixelsY(y) - 1500/2 + margins[1], 600));
    }

    adjustSliderGradientDivisions();
}

const getTrailPoint = (t) => {
    let nextObjIndex = beatmap.HitObjects.findIndex(x => x.time >= t);
    let nextObj = beatmap.HitObjects[nextObjIndex];
    let lastObjIndex = nextObjIndex - 1;
    let lastObj = beatmap.HitObjects[lastObjIndex];

    let easer = easingFunctions.easeOut2;
    let x = 0, y = 0, inSlider = false;

    // after last object
    if (nextObjIndex == -1) {
        nextObj = { x: 0, y: 0, time: beatmap.duration + 10000, endTime: beatmap.duration + 10000 };
        lastObjIndex = beatmap.HitObjects.length - 1;
        lastObj = beatmap.HitObjects[lastObjIndex];
    }
    // inside of a spinner
    if (lastObj?.isSpinner && t < lastObj.endTime) {
        let angle = (t - lastObj.time) / 1000 / 60 * maxRPM * Math.PI * 2 + Math.PI / 2;
        if (lastObjIndex > 0) {
            const prevObj = beatmap.HitObjects[lastObjIndex - 1];
            angle += Math.atan2(192 - prevObj.y, prevObj.x - 256);
        }
        [x, y] = [256 + Math.cos(angle) * 50, 192 - Math.sin(angle) * 50];
    }
    // inside of a slider
    else if (lastObj?.isSlider && t < lastObj.endTime) {
        inSlider = true;
        const len = (t - lastObj.time) % lastObj.duration / lastObj.duration;
        [x, y] = getFollowPosition(lastObj, (parseInt((t - lastObj.time) / lastObj.duration) % 2 ? 1 - len : len) * lastObj.pixelLength);
    }
    else {
        // before first object
        if (nextObjIndex == 0) {
            // from center to first object animation
            if (t >= nextObj.time - 1000) {
                lastObj = { x: 256, y: 192, time: nextObj.time - 1000, endTime: nextObj.time - 1000 };
            }
            // from bottom to center animation
            else if (t >= nextObj.time - 1430) {
                nextObj = { x: 256, y: 192, time: nextObj.time - 1000, endTime: nextObj.time - 1000 };
                lastObj = { x: 256, y: 400, time: Math.max(nextObj.time - 1430, -600), endTime: Math.max(nextObj.time - 1430, -600) };
                easer = easingFunctions.linear;
            }
            // don't draw cursor before bottom to center animation
            else
                return [null, null, false];
        }

        // approaching a spinner
        if (nextObj.isSpinner) {
            let startAngle = 0;
            if (nextObjIndex > 0) {
                startAngle = Math.atan2(192 - lastObj.y, lastObj.x - 256);
                easer = easingFunctions.easeIn;
            }
            nextObj = {
                x: 256 + Math.cos(startAngle + Math.PI / 2) * 50, y: 192 - Math.sin(startAngle + Math.PI / 2) * 50,
                time: nextObj.time, endTime: nextObj.endTime
            };
        }

        // just finished spinner
        if (lastObj.isSpinner) {
            let angle = lastObj.duration / 1000 / 60 * maxRPM * Math.PI * 2 + Math.PI / 2;
            if (lastObjIndex > 0) {
                const prevObj = beatmap.HitObjects[lastObjIndex - 1];
                angle += Math.atan2(192 - prevObj.y, prevObj.x - 256);
            }
            [x, y] = [256 + Math.cos(angle) * 50, 192 - Math.sin(angle) * 50];
            lastObj = { x: x, y: y, time: lastObj.time, endTime: lastObj.endTime };
        }

        const lastObjEndPos = lastObj.isSlider ? getFollowPosition(lastObj, lastObj.pixelLength * (lastObj.slides % 2)) : [lastObj.x, lastObj.y];
        const nextObjStartPos = [nextObj.x, nextObj.y];
        let timePerc = 1 - clamp(0, (nextObj.time - t) / Math.min(nextObj.time - lastObj.endTime, beatmap.preempt - 92), 1);
        timePerc = easer(timePerc);
        x = lastObjEndPos[0] + (nextObjStartPos[0] - lastObjEndPos[0]) * timePerc;
        y = lastObjEndPos[1] + (nextObjStartPos[1] - lastObjEndPos[1]) * timePerc;
    }

    return [x, y, inSlider];
}

const getBGDim = (baseBgDim, time) => {
    let currentBgdim = baseBgDim;

    // break
    let found = breaks.find(x => x[0] <= time && time <= x[1]);

    const breakBGDimTime = 1000;
    const now = performance.now();

    if (lastBreakTime == -1) {
        lastBreakTime = now - breakBGDimTime * 2;
        wasInBreak = !!found;
    }
    else if ((found && !wasInBreak) || (!found && wasInBreak)) {
        lastBreakTime = now - Math.max(breakBGDimTime - now + lastBreakTime, 0);
        wasInBreak = !!found;
    }

    currentBgdim -= 0.25 * clamp(0, (wasInBreak ? now - lastBreakTime : lastBreakTime - now + breakBGDimTime) / breakBGDimTime, 1);

    // kiai
    let i = beatmap.TimingPoints.length - 1;
    while (i > 0 && beatmap.TimingPoints[i][0] > time) {
        i--;
    }
    if (!beatmap.TimingPoints[i][7] & 1) { // not in a kiai
        wasInKiai = false;
    }
    else if (!wasInKiai) {
        lastKiaiTime = now;
        wasInKiai = true;
    }

    if (currentBgdim < 1 && lastKiaiTime != -1) {
        if (now - lastKiaiTime < 200) {
            currentBgdim -= 0.1 * (now - lastKiaiTime) / 200;
        }
        else if (now - lastKiaiTime < 430) {
            currentBgdim -= 0.1;
        }
        else if (now - lastKiaiTime < 2000) {
            currentBgdim -= 0.1 * (1 - (now - lastKiaiTime - 430) / (2000 - 430));
        }
    }

    return currentBgdim;
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
                $("#fps").innerHTML = Math.round(1000 / deltaT);
            }
        }
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

// https://github.com/McKay42/McOsu/blob/56c9a928f05a73da02ac841826d5f3eb3b5cede2/src/App/Osu/OsuBeatmapStandard.cpp#L401
const followPoints = (time) => {
    for (let index = 1; index < beatmap.HitObjects.length; index++) {
        const obj = beatmap.HitObjects[index];
        let lastIndex = index - 1;
        const lastObj = beatmap.HitObjects[lastIndex];

        // ignore future spinners
        if (obj.isSpinner) {
            lastIndex = -1;
            continue;
        }

        if (lastIndex >= 0 && obj.combo != 1) {
            // ignore previous spinners
            if (lastObj.isSpinner) {
                lastIndex = -1;
                continue;
            }

            // get time and pos of the last and current object
            const timeDiff = obj.time - lastObj.endTime;

            const startPoint = [obj.x, obj.y];
            let endPoint = [lastObj.x, lastObj.y];
            if (lastObj.isSlider) {
                endPoint = getFollowPosition(lastObj, lastObj.pixelLength * (lastObj.slides % 2));
            }
            const dist = distance(startPoint, endPoint);

            // draw all points between the two objects
            const followPointSeparation = 32;
            for (let j = followPointSeparation * 1.5; j < dist - followPointSeparation; j += followPointSeparation) {
                const animRatio = j / dist;

                const fadeOutTime = lastObj.endTime + animRatio * timeDiff;
                const fadeInTime = fadeOutTime - 800;

                if (time < fadeInTime || time > fadeOutTime + 400) {
                    continue;
                }
                else if (time < fadeOutTime) {
                    ctx.globalAlpha = clamp(0, (time - fadeInTime) / 400, 1);
                }
                else {
                    ctx.globalAlpha = 1 - clamp(0, (time - fadeOutTime) / 400, 1);
                }

                const sprite = skin.followpoint[time >= fadeInTime + 1000 ? 0 : parseInt(Math.min(time - fadeInTime, 999) / 1000 * skin.followpoint.length)];
                const size = [osuCoords2PixelsX(beatmap.radius) / 64 * sprite.width, osuCoords2PixelsX(beatmap.radius) / 64 * sprite.height];
                const x = endPoint[0] + (startPoint[0] - endPoint[0]) * animRatio;
                const y = endPoint[1] + (startPoint[1] - endPoint[1]) * animRatio;
                ctx.save();
                ctx.translate(osuCoords2PixelsX(x) + margins[0], osuCoords2PixelsY(y) + margins[1]);
                ctx.rotate(Math.atan2(startPoint[1] - endPoint[1], startPoint[0] - endPoint[0]) * (activeMods.has("hr") ? -1 : 1));
                ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
                ctx.restore();
            }
        }

        lastIndex = index;

        if (obj.time >= time + 1200) {
            break;
        }
    }
}

const easingFunctions = {
    easeOut: (t) => 1.5 * t / (0.5 + t),
    easierOut: (t) => 1.2 * t / (0.2 + t),
    easeOut2: (t) => Math.sin((t * Math.PI) / 2),
    linear: (t) => t,
    easeIn: (t) => t * t
};
