import { MusicPlayer } from "./player.js";
import { ProgressBar } from "./progress.js";

var player, progressBar;
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

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
    radius = 54.4 - 4.48 * parseFloat(beatmap.Difficulty.CircleSize);

    [bg] = await asyncLoadImages("b/leah miku.jpg");
    /*circle = Object.assign(new Image(), {src : "b/hitcircle.png"});
    overlay = new Image(); overlay.src = "b/hitcircleoverlay.png";
    approach = new Image(); approach.src = "b/approachcircle.png";*/
    //numbers = await asyncLoadImages(Array.from(Array(10).keys()).map(i => `b/default-${i}@2x.png`));
    skin = await Skin.init("b/");

    if (canvasSize[0] / canvasSize[1] > bg.width / bg.height) {
        bgSize = [canvasSize[0], bg.height * canvasSize[0] / bg.width];
    }
    else {
        bgSize = [bg.width * canvasSize[1] / bg.height, canvasSize[1]];
    }
    bgSize = [...bgSize, (canvasSize[1] - bgSize[1]) / 2, (canvasSize[0] - bgSize[0]) / 2];

    player = await MusicPlayer.init("b/audio.ogg");
    progressBar = new ProgressBar("#progress-bar", player, callback);
    player.currentTime = 41.083;
}

function callback(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // draw background
    ctx.drawImage(bg, bgSize[3], bgSize[2], bgSize[0], bgSize[1]);

    // dim background
    ctx.fillStyle = "#000000a0";
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
                ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 1);
                ctx.drawImage(skin["hitcircle"], osuToPixelsX(obj[0] - radius + 2), osuToPixelsY(obj[1] - radius + 2), (radius - 2) / 256 * fieldSize[0], (radius - 2) / 192 * fieldSize[1]);
                ctx.drawImage(skin["hitcircleoverlay"], osuToPixelsX(obj[0] - radius), osuToPixelsY(obj[1] - radius), radius / 256 * fieldSize[0], radius / 192 * fieldSize[1]);
            }
            else {
                ctx.globalAlpha = clamp(0, (obj[2] + fadeout - time) / fadeout, 1);
                const circleScale = 1 + cubicBezier(clamp(0, 1 - (obj[2] + fadeout - time) / fadeout, 1)) * 0.25;
                ctx.drawImage(skin["hitcircle"], osuToPixelsX(obj[0] + (2 - radius) * circleScale), osuToPixelsY(obj[1] + (2 - radius) * circleScale), (radius - 2) / 256 * fieldSize[0] * circleScale, (radius - 2) / 192 * fieldSize[1] * circleScale);
                ctx.drawImage(skin["hitcircleoverlay"], osuToPixelsX(obj[0] - radius * circleScale), osuToPixelsY(obj[1] - radius * circleScale), radius / 256 * fieldSize[0] * circleScale, radius / 192 * fieldSize[1] * circleScale);
            }
        }

        const combo = obj[obj.length - 1].toString();
        if (time > obj[2]) {
            ctx.globalAlpha = clamp(0, (obj[2] + 50 - time) / 50, 1);
        }
        for (let i = 0; i < combo.length; i++) {
            const letter = skin["default-" + combo[i]];

            const numberScale = radius / 160 / 512 * fieldSize[0];
            const width = letter.width * numberScale;
            const height = letter.height * numberScale;
            ctx.drawImage(letter, osuToPixelsX(obj[0]) - width * combo.length / 2 + hitcircleOverlap / 640 * fieldSize[0] * (combo.length - 1) + (width - hitcircleOverlap / 640 * fieldSize[0]) * i, osuToPixelsY(obj[1]) - height / 2, width, height);
        }

        index--;
    }

    // draw approach circles on top of hitcircles
    for (let obj of approachQueue) {
        const approachScale = 1.1 + clamp(0, 1 - (time - (obj[2] - preempt)) / preempt, 1) * 3.2;
        ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 0.9) / 0.9 * 0.5;
        ctx.drawImage(skin["approachcircle"], osuToPixelsX(obj[0] - radius * approachScale), osuToPixelsY(obj[1] - radius * approachScale), radius / 256 * fieldSize[0] * approachScale, radius / 192 * fieldSize[1] * approachScale);
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
        return [images, promises];
    }
    else {
        let success, error;
        const promise = new Promise((res, rej) => { success = res; error = rej });
        const image = Object.assign(new Image(), { src: files, onload: success, onerror: error });
        await Promise.allSettled([promise]);
        return [image, promise];
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

        var [imgs, promises] = await asyncLoadImages(imgsURLs);
        var completed = 0;
        while (completed < promises.length) {
            try {
                await promises[completed];
                completed++;
            }
            catch {
                switch (--stages[completed]) {
                    case 2:
                        [imgs[completed], promises[completed]] = await asyncLoadImages(folder + imgBaseNames[completed] + ".png");
                        break;
                    default:
                        throw new Error();
                }
            }
        }

        for (let i = 0; i < imgs.length; i++) {
            skin[imgBaseNames[i]] = imgs[i];
        }
        return skin;
    }
}
