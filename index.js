import { MusicPlayer } from "./player.js";
import { ProgressBar } from "./progress.js";

var player, progressBar;
const canvas = document.querySelector("canvas"), bufferCanvas = document.createElement("canvas");
const ctx = canvas.getContext("2d"), bufferCtx = bufferCanvas.getContext("2d");

const canvasSize = [1900, 1200];
const minMargin = 50;
var fieldSize = [], margins, bgSize;
var beatmap, skin;
var bg, circle, overlay, approach, numbers = [];
var preempt = 550, fadein = 380, fadeout = 233;
var radius;
var editor = false;
const hitcircleOverlap = 15;

var osuToPixelsX, osuToPixelsY;

window.onload = async (e) => {
    document.querySelector("#play").addEventListener("click", e => player.play())
    document.querySelector("#pause").addEventListener("click", e => player.pause());

    canvas.width = canvasSize[0];
    canvas.height = canvasSize[1];
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
    osuToPixelsX = (val) => val / 512 * fieldSize[0] + margins[0];
    osuToPixelsY = (val) => val / 384 * fieldSize[1] + margins[1];
    ctx.font = "48px serif";

    const text = await fetch("../../b/MIMI vs. Leah Kate - 10 Things I Hate About Ai no Sukima (Log Off Now) [Mommy's Radiance].osu").then(r => r.text());
    beatmap = parseBeatmap(text);
    radius = 54.4 - 4.48 * parseFloat(beatmap.Difficulty.CircleSize);console.log(radius)

    bg = await asyncLoadImages("b/leah miku.jpg");
    skin = await Skin.init("b/");

    if (canvasSize[0] / canvasSize[1] > bg.width / bg.height) {
        bgSize = [canvasSize[0], bg.height * canvasSize[0] / bg.width];
    }
    else {
        bgSize = [bg.width * canvasSize[1] / bg.height, canvasSize[1]];
    }
    bgSize = [...bgSize, (canvasSize[1] - bgSize[1]) / 2, (canvasSize[0] - bgSize[0]) / 2];
    bufferCanvas.width = radius / 256 * fieldSize[0];
    bufferCanvas.height = radius / 192 * fieldSize[1];

    player = await MusicPlayer.init("b/audio.ogg");
    progressBar = new ProgressBar("#progress-bar", player, callback);
    player.currentTime = 0//41.083;
}

function callback(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // draw background
    ctx.drawImage(bg, bgSize[3], bgSize[2], bgSize[0], bgSize[1]);

    // dim background
    ctx.fillStyle = "#000000ff";
    ctx.fillRect(0, 0, canvasSize[0], canvasSize[1]);

    ctx.strokeStyle = "black";
    ctx.strokeRect(margins[0], margins[1], fieldSize[0], fieldSize[1])

    // find first object to paint
    time *= 1000;
    var index = binarySearch(beatmap.HitObjects, time + preempt);

    var approachQueue = [];
    
    while (index >= 0 && beatmap.HitObjects[index][2] + fadeout > time) {
        const obj = beatmap.HitObjects[index];

        if (editor) {
            var approachScale;
            if (time <= obj[2]) {
                ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 1);
                approachScale = 1.1 + clamp(0, 1 - (time - (obj[2] - preempt)) / preempt, 1) * 3;            
            }
            else {
                ctx.globalAlpha = clamp(0, (obj[2] + fadeout - time) / fadeout, 1);
                approachScale = 1.1 + clamp(0, 1 - (obj[2] + 100 - time) / 100, 1) * 0.1;
            }

            ctx.drawImage(circle, osuToPixelsX(obj[0] - radius + 2), osuToPixelsY(obj[1] - radius + 2), (radius - 2) / 256 * fieldSize[0], (radius - 2) / 192 * fieldSize[1]);
            ctx.drawImage(overlay, osuToPixelsX(obj[0] - radius), osuToPixelsY(obj[1] - radius), radius / 256 * fieldSize[0], radius / 192 * fieldSize[1]);
            ctx.drawImage(approach, osuToPixelsX(obj[0] - radius * approachScale), osuToPixelsY(obj[1] - radius * approachScale), radius / 256 * fieldSize[0] * approachScale, radius / 192 * fieldSize[1] * approachScale);
        }
        else {
            if (time <= obj[2]) {
                approachQueue.push(obj);

                bufferCtx.globalCompositeOperation = "source-over";
                bufferCtx.fillStyle = "#000000ff";
                bufferCtx.fillRect(0, 0, bufferCanvas.width, bufferCanvas.height);
                bufferCtx.fillStyle = "#C6AD9F";

                bufferCtx.globalCompositeOperation = "source-over";
                bufferCtx.drawImage(skin["hitcircle"].img, 0, 0, bufferCanvas.width, bufferCanvas.height);
                bufferCtx.globalCompositeOperation = "multiply";
                bufferCtx.fillRect(0, 0, bufferCanvas.width, bufferCanvas.height);
                //bufferCtx.globalCompositeOperation = "multiply";
                //bufferCtx.drawImage(skin["hitcircle"].img, 0, 0, bufferCanvas.width, bufferCanvas.height);

                ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 1);
                //ctx.drawImage(skin["hitcircle"].img, osuToPixelsX(obj[0] - radius + 0), osuToPixelsY(obj[1] - radius + 0), (radius - 0) / 256 * fieldSize[0], (radius - 0) / 192 * fieldSize[1]);
                ctx.drawImage(bufferCanvas, osuToPixelsX(obj[0] - radius), osuToPixelsY(obj[1] - radius));
                //ctx.drawImage(skin["hitcircleoverlay"].img, osuToPixelsX(obj[0] - radius), osuToPixelsY(obj[1] - radius), radius / 256 * fieldSize[0], radius / 192 * fieldSize[1]);
            }
            else {
                ctx.globalAlpha = clamp(0, (obj[2] + fadeout - time) / fadeout, 1);
                const circleScale = 1 + cubicBezier(clamp(0, 1 - (obj[2] + fadeout - time) / fadeout, 1)) * 0.25;
                ctx.drawImage(skin["hitcircle"].img, osuToPixelsX(obj[0] + (0 - radius) * circleScale), osuToPixelsY(obj[1] + (0 - radius) * circleScale), (radius - 0) / 256 * fieldSize[0] * circleScale, (radius - 0) / 192 * fieldSize[1] * circleScale);
                ctx.drawImage(skin["hitcircleoverlay"].img, osuToPixelsX(obj[0] - radius * circleScale), osuToPixelsY(obj[1] - radius * circleScale), radius / 256 * fieldSize[0] * circleScale, radius / 192 * fieldSize[1] * circleScale);
            }
        }

        const combo = obj[obj.length - 1].toString();
        if (time > obj[2]) {
            ctx.globalAlpha = clamp(0, (obj[2] + 50 - time) / 50, 1);
        }
        for (let i = 0; i < combo.length; i++) {
            const letter = skin["default-" + combo[i]];

            const numberScale = radius / (letter.isHD ? 160 : 80) / 512 * fieldSize[0];
            const width = letter.img.width * numberScale;
            const height = letter.img.height * numberScale;
            //ctx.drawImage(letter.img, osuToPixelsX(obj[0]) - width * combo.length / 2 + hitcircleOverlap / 640 * fieldSize[0] * (combo.length - 1) + (width - hitcircleOverlap / 640 * fieldSize[0]) * i, osuToPixelsY(obj[1]) - height / 2, width, height);
        }

        index--;
    }

    // draw approach circles on top of hitcircles
    for (let obj of approachQueue) {
        const approachScale = 1.1 + clamp(0, 1 - (time - (obj[2] - preempt)) / preempt, 1) * 3.2;
        ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 0.9) / 0.9 * 0.5;
        //ctx.drawImage(skin["approachcircle"].img, osuToPixelsX(obj[0] - radius * approachScale), osuToPixelsY(obj[1] - radius * approachScale), radius / 256 * fieldSize[0] * approachScale, radius / 192 * fieldSize[1] * approachScale);
    }


    ctx.globalAlpha = 1;
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
            for (let i = 0; i < 5; i++) vals[i] = parseInt(vals[i]);
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
    var currentCombo = 1;
    for (let obj of result.HitObjects) {
        if (obj[3] & 4)
            currentCombo = 1;
        obj.push(currentCombo);
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

// https://stackoverflow.com/a/8218244/8414010
const cubicBezier = (t) => {
    return 1.5 * t / (0.5 + Math.abs(t));
}

const asyncLoadImages = async (files) => {
    if (files instanceof Array) {
        const successes = [], errors = [], promises = [], images = [];

        for (let i = 0; i < files.length; i++) {
            promises[i] = new Promise((res, rej) => { successes[i] = res; errors[i] = rej });
            images[i] = Object.assign(new Image(), { src: files[i], onload: successes[i], onerror: errors[i] });
        }

        await Promise.allSettled(promises);
        return images;
    }
    else {
        let success, error;
        const promise = new Promise((res, rej) => { success = res; error = rej });
        const image = Object.assign(new Image(), { src: files, onload: success, onerror: error });
        await Promise.allSettled([promise]);
        return image;
    }
}


const clamp = (min, n, max) => Math.min(max, Math.max(min, n));

class Skin {
    static #initializing = false;

    static DEFAULT_SKIN_PATH = "default/";

    requiredFiles = [
        "approachcircle", "hitcircle", "hitcircleoverlay", "default-"
    ]

    constructor() {
        if (!Skin.#initializing)
            throw new TypeError("Use Skin.init()");
        Skin.#initializing = false;
    }

    static async init(folder) {
        Skin.#initializing = true;
        const skin = new Skin();

        // first, try and load in HD elements; if those fail, load in SD elements;
        // if those fail, load in hd default skin HD elements; if those fail, load in default skin SD elements;
        // if those fail, end the program
        var imgBaseNames = [], imgsURLs = [];
        for (let file of skin.requiredFiles) {
            if (file.endsWith("-")) {
                for (let i = 0; i < 10; i++) {
                    imgBaseNames.push(file + i);
                    imgsURLs.push(folder + file + i + "@2x.png");
                }
            }
            else {
                imgBaseNames.push(file);
                imgsURLs.push(folder + file + "@2x.png");
            }
        }
        var stages = Array(imgBaseNames.length).fill(3);

        const imgs = (await asyncLoadImages(imgsURLs)).map(o => ({ img: o, isHD: true }));

        var completed = 0;
        while (completed < imgs.length) {
            // if img loaded correctly
            if (imgs[completed].img.complete && imgs[completed].img.naturalWidth !== 0) {
                completed++;
            }
            else {
                switch (--stages[completed]) {
                    // SD skin elements
                    case 2:
                        imgs[completed] = { img: await asyncLoadImages(folder + imgBaseNames[completed] + ".png"), isHD: false };
                        break;
                    // TODO
                    default:
                        throw new Error();
                }
            }
        }

        for (let i = 0; i < imgs.length; i++) {
            skin[imgBaseNames[i]] = imgs[i];
            //document.querySelector("body").appendChild(imgs[i].img)
        }
        return skin;
    }
}
