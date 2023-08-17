import { MusicPlayer } from "./player.js";
import { ProgressBar } from "./progress.js";
import { parseSkin, asyncLoadImages } from "./skin.js";
import { mod, clamp, lerp, range, rgb } from "./functions.js";

const mapFolder = 0 ? "songs/889855 GALNERYUS - RAISE MY SWORD/" : "songs/1919786 MIMI vs Leah Kate - 10 Things I Hate About Ai no Sukima/";
const diff = 0 ? "GALNERYUS - RAISE MY SWORD (Sotarks) [A THOUSAND FLAMES].osu" : "MIMI vs. Leah Kate - 10 Things I Hate About Ai no Sukima (Log Off Now) [sasasasasa].osu";
const skinName = ["_Kynan-2017-08-10", "Rafis 2017-08-21", "- YUGEN -"][2];

const BEZIER_SEGMENT_MAX_LENGTH = 10;        // in screen pixels
var bezierSegmentMaxLengthSqrd;             // in osu pixels, squared

var player, progressBar;
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
var bufferCanvas, bufferCtx;

const canvasSize = [1024, 768];
const minMargin = 112;
var fieldSize = [], margins, bgSize;
var beatmap, skin;
var bg;
var preempt, fadein, fadeout = 233;
var radius;
var prevTime = -1, framesN = 0, avgFPS, avgFrames = [];
var sliderGradientDivisions = 20;

var bgdim = 1;
var drawGrid = true;

var bakedPaths = [];


var osuToPixelsX, osuToPixelsY;

window.onload = async (e) => {
    document.querySelector("#play").addEventListener("click", e => player.play())
    document.querySelector("#pause").addEventListener("click", e => player.pause());

    //window.onmousemove = e => cursorPos = [e.clientX, e.clientY];
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
    skin = await parseSkin("skins/" + skinName, mapFolder, beatmap, true);

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
    player.currentTime = 0.369//41.072;

    var buffer = await fetch("skins/" + skinName + "/normal-hitclap.wav");
    buffer = await player.audioContext.decodeAudioData(await buffer.arrayBuffer());
    let source = player.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(player.audioContext.destination);
    source.start(0.569);
    source = player.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(player.audioContext.destination);
    source.start(1.569);
}

function callback(time) {
    document.querySelector("#fps").innerHTML = time;

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
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
    else {
        // playfield border
        ctx.lineWidth = 2;
        ctx.strokeStyle = "black";
        ctx.strokeRect(margins[0], margins[1], fieldSize[0], fieldSize[1]);
    }

    // find first (last in hitobjects list) object to paint
    time *= 1000;
    //var index = binarySearch(beatmap.HitObjects, time + preempt);
    var index = beatmap.HitObjects.length - 1;

    var approachQueue = [], followQueue = [];

    var merda = 0;
    
    while (index >= 0) {
        const obj = beatmap.HitObjects[index];

        if (obj[2] + (obj[3] & 2 ? obj.at(-2) * obj[6] : (obj[3] & 8 ? obj[5] - obj[2] : 0)) + fadeout < time ||
            obj[2] - preempt > time) {
            index--;
            continue;
        }
        merda++;

        if (obj[3] & 2) {                   // slider
            bufferCtx.globalCompositeOperation = "source-over";
            bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
            bufferCtx.beginPath();
            
            var snake;
            if (time < obj[2]) {
                approachQueue.push(obj);
                ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 1);
                snake = clamp(0, (time - (obj[2] - preempt)) / fadein, 0.5) * 2;
            }
            else {
                if (time < obj[2] + obj.at(-2) * obj[6] + 200) {
                    followQueue.push(obj);
                }
                ctx.globalAlpha = clamp(0, (obj[2] + obj.at(-2) * obj[6] + fadeout - time) / fadeout, 1);
                snake = 1;
            }

            bufferCtx.moveTo(osuToPixelsX(obj[0]) + margins[0], osuToPixelsY(obj[1]) + margins[1]);
            drawSlider(obj, obj[7] * snake);

            const diameter = radius * 2 / 512 * fieldSize[0] * 0.8;
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
            ctx.shadowBlur = 0.11 * osuToPixelsX(radius);
            ctx.drawImage(bufferCanvas, 0, 0);
            ctx.shadowColor = "transparent";

            // slider gradient
            const gradientColor = rgb(skin.ini.Colours.SliderTrackOverride) || skin.ini.combos[obj.at(-1)[1] % skin.ini.combos.length];            
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
            let circleSprite = skin["sliderendcircle"][obj.at(-1)[1] % skin.ini.combos.length];
            let overlaySprite = skin["sliderendcircleoverlay"];
            
            const _drawEnd = (sprite, position, startTime, scale) => {
                const size = [osuToPixelsX(radius) / 64 * sprite.width, osuToPixelsY(radius) / 64 * sprite.height];
                const scale2 = 1 + (scale ? (1 - easeOut(mod((time - startTime) / obj.at(-3), 1))) * 0.3 : 0);
                ctx.globalAlpha = clamp(0, (time - startTime) / 150, 1);
                ctx.drawImage(sprite, osuToPixelsX(position[0]) + margins[0] - size[0] / 2 * scale2, osuToPixelsY(position[1]) + margins[1] - size[1] / 2 * scale2, size[0] * scale2, size[1] * scale2);
            };

            // slider end at the end of the slider
            if (slideN < obj[6] && slideN % 2 == 0 || slideN < obj[6] - 1) {
                let position = getFollowPosition(obj, obj[7]);
                let startTime = obj[2] + obj.at(-2) * (slideN == 0 || slideN % 2 ? slideN : slideN - 1) + (slideN == 0 ? -preempt + fadein / 2 : 0);
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
            while (i > 0 && i <= obj[6] && time - (obj[2] + obj.at(-2) * i) < fadeout) {
                const position = getFollowPosition(obj, obj[7] * (i % 2));
                const scale = 1 + easeOut(clamp(0, 1 - (obj[2] + obj.at(-2) * i + fadeout - time) / fadeout, 1)) * 0.35;
                ctx.globalAlpha = clamp(0, (obj[2] + obj.at(-2) * slideN + fadeout - time) / fadeout, 1);

                let size = [osuToPixelsX(radius) / 64 * circleSprite.width, osuToPixelsY(radius) / 64 * circleSprite.height];
                ctx.drawImage(circleSprite, osuToPixelsX(position[0]) + margins[0] - size[0] / 2 * scale, osuToPixelsY(position[1]) + margins[1] - size[1] / 2 * scale, size[0] * scale, size[1] * scale);
                    size = [osuToPixelsX(radius) / 64 * overlaySprite.width, osuToPixelsY(radius) / 64 * overlaySprite.height];
                ctx.drawImage(overlaySprite, osuToPixelsX(position[0]) + margins[0] - size[0] / 2 * scale, osuToPixelsY(position[1]) + margins[1] - size[1] / 2 * scale, size[0] * scale, size[1] * scale);
                i--;
            }
            //#endregion

            //#region reverse arrows
            if (obj[6] > 1) {
                const reverse1 = slideN < obj[6] - 1;
                const reverse2 = slideN < obj[6] - 2;

                const sprite = skin["reversearrow"];
                const size = [osuToPixelsX(radius) / 64 * sprite.width, osuToPixelsY(radius) / 64 * sprite.height];

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
                    _drawArrow(getFollowPosition(obj, obj[7]), obj[2] + obj.at(-2) * (slideN == 0 || slideN % 2 ? slideN : slideN - 1) + (slideN == 0 ? -preempt + fadein / 2 : 0), true);
                }
                // arrow at the start (assuming 1 slide) of the slider
                if ((slideN % 2 == 0 && reverse2) || (slideN % 2 == 1 && reverse1)) {
                    _drawArrow(getFollowPosition(obj, 0), obj[2] + obj.at(-2) * (slideN % 2 ? slideN - 1 : slideN), false);
                }

                // slider arrows expanding and fading out after being tapped
                let i = slideN;
                while (i > 0 && i < obj[6] && time - (obj[2] + obj.at(-2) * i) < fadeout) {
                    const arrowScale = 1 + easeOut(clamp(0, 1 - (obj[2] + obj.at(-2) * i + fadeout - time) / fadeout, 1)) * 0.35;
                    ctx.globalAlpha = clamp(0, (obj[2] + obj.at(-2) * slideN + fadeout - time) / fadeout, 1);
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
                var firstTickTime = n == 0 ? (obj[2] - fadein) : (obj[2] + obj.at(-2) * n - 280 + (n % 2 ? obj.at(-2) - ticks.at(-1) : ticks[0]) / 2);
                
                for (let i = 0; i < ticks.length; i++) {
                    const tick = ticks[i];

                    if (time < obj[2] + obj.at(-2) * n + (n % 2 ? obj.at(-2) - ticks[ticks.length - i - 1] : tick)) {
                        const sprite = skin["sliderscorepoint"];
                        const followPos = getFollowPosition(obj, ((n > 0 && n % 2) ? ticks[ticks.length - i - 1] : tick) / obj.at(-2) * obj[7]);
                        const temp = time - firstTickTime - tick / 2;
                        const scale = temp < 140 ? (0.5 + clamp(0, temp / 140, 1) * 0.7) : (1 + (1 - clamp(0, (temp - 140) / 140, 1)) * 0.2);
                        const size = [osuToPixelsX(radius) * 2 / 128 * sprite.width * scale, osuToPixelsY(radius) * 2 / 128 * sprite.height * scale];
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
                circleSprite = skin["sliderstartcircle"][obj.at(-1)[1] % skin.ini.combos.length];
                overlaySprite = skin["sliderstartcircleoverlay"];
            }
            else {
                circleSprite = skin["hitcircle"][obj.at(-1)[1] % skin.ini.combos.length];
                overlaySprite = skin["hitcircleoverlay"];
            }

            let circleScale;
            if (time <= obj[2]) {
                approachQueue.push(obj);
                ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 1);
                circleScale = 1;
            }
            else {
                ctx.globalAlpha = clamp(0, (obj[2] + fadeout - time) / fadeout, 1);
                circleScale = 1 + easeOut(clamp(0, 1 - (obj[2] + fadeout - time) / fadeout, 1)) * 0.35;
            }

            var size = [osuToPixelsX(radius) * 2 / 128 * circleSprite.width * circleScale, osuToPixelsY(radius) * 2 / 128 * circleSprite.height * circleScale];
            ctx.drawImage(circleSprite, osuToPixelsX(obj[0]) + margins[0] - size[0] / 2, osuToPixelsY(obj[1]) + margins[1] - size[1] / 2, size[0], size[1]);
            size = [osuToPixelsX(radius) * 2 / 128 * overlaySprite.width * circleScale, osuToPixelsY(radius) * 2 / 128 * overlaySprite.height * circleScale];
            ctx.drawImage(overlaySprite, osuToPixelsX(obj[0]) + margins[0] - size[0] / 2, osuToPixelsY(obj[1]) + margins[1] - size[1] / 2, size[0], size[1]);

            // draw combo number
            if (time > obj[2]) {
                // number disappears 60 ms after being hit
                ctx.globalAlpha = clamp(0, (obj[2] + 60 - time) / 60, 1);
            }
            
            const combo = obj.at(-1)[0].toString();
            const width = skin["default-" + combo[0]].width;
            const height = skin["default-" + combo[0]].height;
            const totalWidth = width * combo.length - skin.ini.Fonts.HitCircleOverlap / 640 * fieldSize[0] / 2* (combo.length - 1);
            const numberScale = radius / 80 / 512 * fieldSize[0];
            for (let i = 0; i < combo.length; i++) {
                const sprite = skin["default-" + combo[i]];

                const [ x, y, w, h ] = [
                    osuToPixelsX(obj[0]) + margins[0] + (-totalWidth / 2 + (width - skin.ini.Fonts.HitCircleOverlap / 640 * fieldSize[0] / 2) * i) * numberScale,
                    osuToPixelsY(obj[1]) + margins[1] - height / 2 * numberScale,
                    width * (sprite.naturalWidth / skin["default-" + combo[0]].naturalWidth) * numberScale,
                    height * (sprite.naturalHeight / skin["default-" + combo[0]].naturalHeight) * numberScale
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
                ctx.globalAlpha = clamp(0, (obj[5] - time + fadeout) / fadeout, 1);
            }                        
            
            if (skin.isOldSpinner) {
                // spinner background
                sprite = skin["spinner-background"][0];
                size = [osuToPixelsX(sprite.width) * 0.625, osuToPixelsY(sprite.height) * 0.625];
                ctx.drawImage(sprite, osuToPixelsX(256) + margins[0] - size[0] / 2,
                    osuToPixelsY(192) + margins[1] - size[1] / 2, size[0], size[1]);

                // spinner circle
                sprite = skin["spinner-circle"];
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
                sprite = skin["spinner-metre"];
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
                sprite = skin["spinner-glow"][0];
                const tempAlpha = ctx.globalAlpha;
                if (time < obj[5]) {
                    ctx.globalAlpha = clamp(0, (time - obj[2]) / ((obj[5] - obj[2]) * 0.45), 1);
                }
                else {
                    ctx.globalAlpha = clamp(0, (obj[5] + fadeout - time) / fadeout, 1);
                }
                size = [osuToPixelsX(sprite.width) * 0.625 * scale, osuToPixelsY(sprite.height) * 0.625 * scale];
                ctx.drawImage(sprite, osuToPixelsX(256) + margins[0] - size[0] / 2,
                    osuToPixelsY(192) + margins[1] - size[1] / 2, size[0], size[1]);
                ctx.globalAlpha = tempAlpha;
                
                // spinner bottom
                sprite = skin["spinner-bottom"];
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
                sprite = skin["spinner-top"];
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
                sprite = skin["spinner-middle2"];
                size = [osuToPixelsX(sprite.width) * 0.625 * scale, osuToPixelsY(sprite.height) * 0.625 * scale];
                timeMaxRPM = baseTimeMaxRPM / 3;
                ctx.save();
                ctx.translate(osuToPixelsX(256) + margins[0], osuToPixelsY(192) + margins[1]);
                ctx.rotate((Math.pow(clamp(0, (time - obj[2]) / timeMaxRPM, 1), pow) / pow * timeMaxRPM
                    + clamp(0, time - obj[2] - timeMaxRPM, obj[5] - obj[2] - timeMaxRPM)) / 1000 / 60 * -maxRPM * Math.PI * 2);
                ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
                ctx.restore();
                
                // spinner middle
                sprite = skin["spinner-middle"];
                size = [osuToPixelsX(sprite.width) * 0.625 * scale, osuToPixelsY(sprite.height) * 0.625 * scale];
                ctx.drawImage(sprite, osuToPixelsX(256) + margins[0] - size[0] / 2,
                    osuToPixelsY(192) + margins[1] - size[1] / 2, size[0], size[1]);
            }

            const maxRPM = 477;
            sprite = skin["cursor"];
            const size2 = [osuToPixelsX(radius) / 64 * sprite.width, osuToPixelsY(radius) / 64 * sprite.height];
            ctx.save();
            ctx.translate(osuToPixelsX(obj[0]) + margins[0], osuToPixelsY(obj[1]) + margins[1]);
            ctx.rotate(-clamp(0, time - obj[2], obj[5] - obj[2]) / 1000 / 60 * maxRPM * Math.PI * 2);
            ctx.drawImage(sprite, -size2[0] / 2, -size2[1] / 2 - 100, size2[0], size2[1]);
            ctx.restore();

            // approach circle
            sprite = skin["spinner-approachcircle"];
            const approachScale = 0.05 + clamp(0, (obj[5] - time) / (obj[5] - obj[2]), 1) * 0.95;
            size = [osuToPixelsX(sprite.width) * 1.16 * approachScale, osuToPixelsY(sprite.height) * 1.16 * approachScale];
            ctx.drawImage(sprite, osuToPixelsX(256) + margins[0] - size[0] / 2,
                osuToPixelsY(192) + margins[1] - size[1] / 2, size[0], size[1]);
        }

        index--;
    }

    // draw approach circles
    for (let obj of approachQueue) {
        const approachScale = 1 + clamp(0, 1 - (time - (obj[2] - preempt)) / preempt, 1) * 3;
        ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 0.9) / 0.9 * 0.5;
        
        // get tinted approachcircle
        const tinted = skin["approachcircle"][obj.at(-1)[1] % skin.ini.combos.length];

        const size = [osuToPixelsX(radius) / 64 * tinted.width * approachScale, osuToPixelsY(radius) / 64 * tinted.height * approachScale];
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
            let sprite = skin["sliderfollowcircle"];
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
            let size = [osuToPixelsX(radius) / 64 * sprite.width * followScale, osuToPixelsY(radius) / 64 * sprite.height * followScale];
            ctx.globalAlpha = clamp(0, (time - obj[2]) / 60, 1);
            ctx.drawImage(sprite, osuToPixelsX(followPos[0]) + margins[0] - size[0] / 2, osuToPixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);

            // slider ball
            ctx.globalAlpha = 1;
            if (skin.isDefaultSliderBall) {
                sprite = skin["sliderb-nd"];
                size = [osuToPixelsX(radius) / 64 * sprite.width, osuToPixelsY(radius) / 64 * sprite.height];
                ctx.drawImage(sprite, osuToPixelsX(followPos[0]) + margins[0] - size[0] / 2, osuToPixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);
            }
            const sliderbFrame = parseInt((time - obj[2]) / 16.6);
            sprite = skin.sliderb[sliderbFrame % skin.sliderb.length][parseInt(skin.ini.General.AllowSliderBallTint) ? obj.at(-1)[1] % skin.ini.combos.length : 0];
            const flipX = (parseInt(skin.ini.General.SliderBallFlip) && Math.floor(slideN) % 2) ? -1 : 1;
            const flipY = followPos[3] ? -1 : 1;
            size = [osuToPixelsX(radius) / 64 * sprite.width, osuToPixelsY(radius) / 64 * sprite.height];
            ctx.save();
            ctx.translate(osuToPixelsX(followPos[0]) + margins[0], osuToPixelsY(followPos[1]) + margins[1]);
            ctx.rotate(followPos[2]);
            ctx.scale(flipX, flipY);
            ctx.drawImage(sprite, -size[0] / 2, -size[1] / 2, size[0], size[1]);
            ctx.restore();

            if (skin.isDefaultSliderBall) {
                sprite = skin["sliderb-spec"];
                size = [osuToPixelsX(radius) / 64 * sprite.width, osuToPixelsY(radius) / 64 * sprite.height];
                ctx.globalCompositeOperation = "lighter";
                ctx.drawImage(sprite, osuToPixelsX(followPos[0]) + margins[0] - size[0] / 2, osuToPixelsY(followPos[1]) + margins[1] - size[1] / 2, size[0], size[1]);
                ctx.globalCompositeOperation = "source-over";
            }
        }
        else {
            // follow circle
            const sprite = skin["sliderfollowcircle"];
            const followPos = getFollowPosition(obj, obj[6] % 2 ? obj[7] : 0);
            const scale = 1 - clamp(0, easeOut((time - endTime) / 150) * 0.2, 0.2);
            const size = [osuToPixelsX(radius) / 64 * sprite.width * scale, osuToPixelsY(radius) / 64 * sprite.height * scale];
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

const drawSlider = (obj, length, draw = true) => {
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

    return [0,0];
}
const getFollowPosition = (obj, length) => drawSlider(obj, length, false);

const getSliderTicks = (obj) => {
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
    const lines = text.split("\n");

    for (let line of lines) {
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
        else switch (currCategory) {
            case "Difficulty":
                var keyval = line.trim().split(":");
                result[currCategory][keyval[0].trim()] = parseFloat(keyval[1].trim());
                break;
            case "HitObjects": {
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
                if (vals[3] & 8) {
                    vals[5] = parseInt(vals[5]);
                }
                result[currCategory].push(vals);
                break;
            }
            case "TimingPoints": {
                var vals = line.trim().split(",");
                for (let i of [0, 2, 3, 4, 5, 6, 7]) {
                    vals[i] = parseInt(vals[i]);
                }
                vals[1] = parseFloat(vals[1]);
                result[currCategory].push(vals);
                break;
            }
            case "Events": {
                result[currCategory].push(line.trim().split(","));
                break;
            }
            default: {
                var keyval = line.trim().split(":");
                result[currCategory][keyval[0].trim()] = keyval[1].trim();
            }
        }
    }

    // pre compute combos and slider durations
    var currentCombo = 1, comboIndex = -1;
    var inheritedTPIndex = -1, uninheritedTPIndex = 0, tpIndex = 0;
    const sliders = [];
    var first = true;

    for (let i = 0; i < result.HitObjects.length; i++) {
        const obj = result.HitObjects[i];

        if (!(obj[3] & 8) && (first || obj[3] & 4)) { // new combo
            currentCombo = 1;
            comboIndex += 1;

            if (i == 0 || !(result.HitObjects[i - 1][3] & 8)) {
                comboIndex += (((16 & obj[3]) + (32 & obj[3]) + (64 & obj[3])) >> 4);
            }
        }
        if (obj[3] & 2) { // slider
            // find corresponding timing points
            while (tpIndex < result.TimingPoints.length && result.TimingPoints[tpIndex][0] <= obj[2]) {
                if (result.TimingPoints[tpIndex][6]) {
                    uninheritedTPIndex = tpIndex;
                    inheritedTPIndex = -1;
                }
                else {
                    inheritedTPIndex = tpIndex;
                }
                tpIndex++;
            }

            obj.push(result.TimingPoints[uninheritedTPIndex][1]);
            obj.push(obj[7] / (result.Difficulty.SliderMultiplier * 100 * (inheritedTPIndex == -1 ? 1 : -100 / result.TimingPoints[inheritedTPIndex][1])) * result.TimingPoints[uninheritedTPIndex][1]);
            result.HitObjects.splice(i, 1);
            sliders.push(obj);
            i--;
        }

        obj.push([currentCombo, comboIndex]);
        currentCombo++;
        first = false;

        if (obj[3] & 8) {
            first = true;
        }
    }

    sliders.sort((a, b) => (a[2] + a.at(-2)) - (b[2] + b.at(-2)));
    for (let slider of sliders) {
        let i = result.HitObjects.length - 1;
        while (i >= 0 && slider[2] + slider.at(-2) < result.HitObjects[i][2])
            i--;
        result.HitObjects.splice(i + 1, 0, slider);
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
const easierOut = (t) => {
    return 1.2 * t / (0.2 + t);
}
