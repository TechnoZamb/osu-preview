import { MusicPlayer } from "./player.js";
import { ProgressBar } from "./progress.js";
import { parseSkin, asyncLoadImages } from "./skin.js";
import urlJoin from "./url-join.js";


var player, progressBar;
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

const canvasSize = [1600, 1200];
const minMargin = 50;
var fieldSize = [], margins, bgSize;
var beatmap, skin;
var bg;
var preempt = 550, fadein = 380, fadeout = 233;
var radius;
var editor = false;
const hitcircleOverlap = 15;

var tinted;

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
    osuToPixelsX = (val) => val / 512 * fieldSize[0];
    osuToPixelsY = (val) => val / 384 * fieldSize[1];

    const text = await fetch("../../b/MIMI vs. Leah Kate - 10 Things I Hate About Ai no Sukima (Log Off Now) [Mommy's Radiance].osu").then(r => r.text());
    beatmap = parseBeatmap(text);
    radius = 54.4 - 4.48 * parseFloat(beatmap.Difficulty.CircleSize);

    bg = await asyncLoadImages("b/leah miku.jpg");
    skin = await parseSkin("skins/- YUGEN -");

    if (canvasSize[0] / canvasSize[1] > bg.width / bg.height) {
        bgSize = [canvasSize[0], bg.height * canvasSize[0] / bg.width];
    }
    else {
        bgSize = [bg.width * canvasSize[1] / bg.height, canvasSize[1]];
    }
    bgSize = [...bgSize, (canvasSize[1] - bgSize[1]) / 2, (canvasSize[0] - bgSize[0]) / 2];

    player = window.player = await MusicPlayer.init("b/audio.ogg");
    progressBar = new ProgressBar("#progress-bar", player, callback);
    player.currentTime = 0.015//41.083;
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

        const hitcircle = skin["hitcircle"];
        const tinted = hitcircle.combos[obj[obj.length - 1][1] % skin.comboColors.length];
        const overlay = skin["hitcircleoverlay"];
        var circleScale;

        if (time <= obj[2]) {
            approachQueue.push(obj);
            ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 1);
            circleScale = 1;
        }
        else {
            ctx.globalAlpha = clamp(0, (obj[2] + fadeout - time) / fadeout, 1);
            circleScale = 1 + cubicBezier(clamp(0, 1 - (obj[2] + fadeout - time) / fadeout, 1)) * 0.25;
        }

        var size = [osuToPixelsX(radius) * 2 / (hitcircle.isHD ? 256 : 128) * tinted.width * circleScale, osuToPixelsY(radius) * 2 / (hitcircle.isHD ? 256 : 128) * tinted.height * circleScale];
        ctx.drawImage(tinted, osuToPixelsX(obj[0]) + margins[0] - size[0] / 2, osuToPixelsY(obj[1]) + margins[1] - size[1] / 2, size[0], size[1]);
        size = [osuToPixelsX(radius) * 2 / (overlay.isHD ? 256 : 128) * overlay.img.width * circleScale, osuToPixelsY(radius) * 2 / (overlay.isHD ? 256 : 128) * overlay.img.height * circleScale];
        ctx.drawImage(overlay.img, osuToPixelsX(obj[0]) + margins[0] - size[0] / 2, osuToPixelsY(obj[1]) + margins[1] - size[1] / 2, size[0], size[1]);

        const combo = obj[obj.length - 1][0].toString();
        if (time > obj[2]) {
            ctx.globalAlpha = clamp(0, (obj[2] + 50 - time) / 50, 1);
        }
        
        for (let i = 0; i < combo.length; i++) {
            const letter = skin["default-" + combo[i]];

            const numberScale = radius / (letter.isHD ? 160 : 80) / 512 * fieldSize[0];
            const width = letter.img.width * numberScale;
            const height = letter.img.height * numberScale;
            ctx.drawImage(letter.img, osuToPixelsX(obj[0]) + margins[0] - width * combo.length / 2 + hitcircleOverlap / 640 * fieldSize[0] * (combo.length - 1) + (width - hitcircleOverlap / 640 * fieldSize[0]) * i, osuToPixelsY(obj[1]) + margins[1] - height / 2, width, height);
        }

        index--;
    }

    // draw approach circles on top of hitcircles
    for (let obj of approachQueue) {
        const approachScale = 1 + clamp(0, 1 - (time - (obj[2] - preempt)) / preempt, 1) * 3;
        ctx.globalAlpha = clamp(0, (time - (obj[2] - preempt)) / fadein, 0.9) / 0.9 * 0.5;
        
        // get tinted approachcircle
        const tinted = skin["approachcircle"].combos[obj[obj.length - 1][1] % skin.comboColors.length];

        ctx.drawImage(tinted, osuToPixelsX(obj[0] - radius * approachScale) + margins[0], osuToPixelsY(obj[1] - radius * approachScale) + margins[1], radius / 256 * fieldSize[0] * approachScale, radius / 192 * fieldSize[1] * approachScale);
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

// https://stackoverflow.com/a/8218244/8414010
const cubicBezier = (t) => {
    return 1.5 * t / (0.5 + Math.abs(t));
}


const clamp = (min, n, max) => Math.min(max, Math.max(min, n));
