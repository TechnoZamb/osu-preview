import { MusicPlayer } from "./player.js";
import { ProgressBar } from "./progress.js";
import { parseSkin } from "./skin.js";
import * as render from "./render.js";


const mapFolder = 0 ? "songs/889855 GALNERYUS - RAISE MY SWORD/" : "songs/1919786 MIMI vs Leah Kate - 10 Things I Hate About Ai no Sukima/";
const diff = 0 ? "GALNERYUS - RAISE MY SWORD (Sotarks) [A THOUSAND FLAMES].osu" : "MIMI vs. Leah Kate - 10 Things I Hate About Ai no Sukima (Log Off Now) [sasasasasa].osu";
const skinName = ["_Kynan-2017-08-10", "Rafis 2017-08-21", "Cookiezi 36 2018-11-23 Rafis Edit"][1];


var player, progressBar;

export let beatmap, skin;
export let bgdim = 1;


window.addEventListener("load", async (e) => {
    document.querySelector("#play").addEventListener("click", e => player.play())
    document.querySelector("#pause").addEventListener("click", e => player.pause());

    document.querySelector("input").oninput = (e) => bgdim = e.target.value;
    document.querySelector("input").value = bgdim;


    const text = await fetch(mapFolder + diff).then(r => r.text());
    beatmap = parseBeatmap(text);
    beatmap.radius = 54.4 - 4.48 * parseFloat(beatmap.Difficulty.CircleSize);
    
    const ar = parseFloat(beatmap.Difficulty.ApproachRate);
    if (ar < 5) {
        beatmap.preempt = 1200 + 600 * (5 - ar) / 5;
        beatmap.fadein = 800 + 400 * (5 - ar) / 5;
    }
    else if (ar == 5) {
        beatmap.preempt = 1200;
        beatmap.fadein = 800;
    }
    else {
        beatmap.preempt = 1200 - 750 * (ar - 5) / 5;
        beatmap.fadein = 800 - 500 * (ar - 5) / 5;
    }
    beatmap.fadeout = 233;

    skin = await parseSkin("skins/" + skinName, mapFolder, beatmap, true);

    render.init();

    player = window.player = await MusicPlayer.init(mapFolder + beatmap.General.AudioFilename);
    progressBar = new ProgressBar("#progress-bar", player, callback);
    player.currentTime = 0//41.072;

    var buffer = await fetch("skins/" + skinName + "/normal-hitnormal.wav");
    buffer = await player.audioContext.decodeAudioData(await buffer.arrayBuffer());
    queueHitsounds(0, buffer);
});

function callback(time) {
    document.querySelector("#fps").innerHTML = time;

    render.render(time);
}

const queueHitsounds = (timeFrom, buffer) => {
    let source;

    for (let obj of beatmap.HitObjects) {
        if (obj[2] <= timeFrom) {
            continue;
        }

        source = player.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(player.audioContext.destination);
        source.start((obj[2] - timeFrom) / 1000);
    }
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
