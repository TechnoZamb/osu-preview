import { MusicPlayer } from "./player.js";
import { ProgressBar } from "./progress.js";
import { parseSkin } from "./skin.js";
import * as render from "./render.js";
import { sleep } from "./functions.js";
const { BlobReader, ZipReader, BlobWriter, TextWriter } = zip;


const mapFolder = ["songs/1263264 katagiri - ch3rry (Short Ver)/", "songs/1919786 MIMI vs Leah Kate - 10 Things I Hate About Ai no Sukima/", "songs/1896971 sweet ARMS - Blade of Hope (TV Size)/"][1];
const diff = ["katagiri - ch3rry (Short Ver.) (Inverse) [Blossom].osu", "MIMI vs. Leah Kate - 10 Things I Hate About Ai no Sukima (Log Off Now) [sas].osu","sweet ARMS - Blade of Hope (TV Size) (Aruyy) [Expert].osu"][1];
const skinName = ["_Kynan-2017-08-10", "Rafis 2017-08-21", "Cookiezi 36 2018-11-23 Rafis Edit"][0];


var player, progressBar;

var buffer;

export let beatmap, skin;
export let bgdim = 1;


window.addEventListener("load", async (e) => {
    document.querySelector("#play").addEventListener("click", e => player.play())
    document.querySelector("#pause").addEventListener("click", e => player.pause());

    document.querySelector("input").oninput = (e) => bgdim = e.target.value;
    document.querySelector("input").value = bgdim;

    try {await fetch("http://localhost:8000/cgi-bin/hello.py")}catch{}

    const oszFile = await fetch("map.zip").then(r => r.blob());
    const beatmapFiles = (await extractFile(oszFile)).reduce((prev, curr) => ({ ...prev, [curr.filename]: curr }), {});

    beatmap = await getDifficulty(beatmapFiles, "2625697");
    beatmap = parseBeatmap(beatmap);

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

    const bgURL = await getBackgroundPictureURL(beatmapFiles, beatmap);

    const skinBlob = await fetch("skin.osk").then(res => res.blob());
    const skinFiles = (await extractFile(skinBlob)).reduce((prev, curr) => ({ ...prev, [curr.filename]: curr }), {});
    skin = await parseSkin(skinFiles, beatmapFiles, beatmap, true);
    render.init(bgURL);

    const songBlob = await getSong(beatmapFiles, beatmap);
    player = await MusicPlayer.init(songBlob, () => queueHitsounds(player.currentTime));
    progressBar = new ProgressBar("#progress-bar", player);
    progressBar.onFrame = frame;
    progressBar.onResume = queueHitsounds;
return
    player.currentTime = parseInt(beatmap.General.PreviewTime) / 1000;

    // necessary to sync music and hitsounds
    player.play();
    player.pause();
    await sleep(100);
    player.play();
});

function frame(time) {
    document.querySelector("#fps").innerHTML = time;

    render.render(time);
}

let queuedHitsounds = [];
const queueHitsounds = (timeFrom) => {

    timeFrom *= 1000;

    // stop all hitsounds from playing
    for (let i = 0; i < queuedHitsounds.length; i++) {
        queuedHitsounds[i].stop(0);
    }

    queuedHitsounds = [];

    let source;

    for (let obj of beatmap.HitObjects) {
        if (obj[2] <= timeFrom) {
            continue;
        }

        const hitSamplesPos = (obj[3] & 2) ? 10 : ((obj[3] & 8) ? 6 : 5);

        for (let i = 1; i < 4; i++) {
            if ((obj[3] & 2 ? parseInt(obj[8]?.split?.("|")[0] ?? 0) : obj[4]) & (2 ** i)) {
                const soundName = `${[, "normal", "soft", "drum"][obj[hitSamplesPos][1]]}-hit${["normal", "whistle", "finish", "clap"][i]}${(x => x < 2 ? "" : x)(obj[hitSamplesPos][2])}`;
                source = player.audioContext.createBufferSource();
                source.buffer = skin.hitSounds[soundName];
                source.connect(player.audioContext.destination);
                source.start((obj[2] - timeFrom) / 1000 + player.audioContext.getOutputTimestamp().contextTime + 0.06);
                queuedHitsounds.push(source);
            }
        }

        if (obj[4] == 0 || skin.LayeredHitSounds) {
            const soundName = `${[, "normal", "soft", "drum"][obj[hitSamplesPos][0]]}-hitnormal${(x => x < 2 ? "" : x)(obj[hitSamplesPos][2])}`;
            source = player.audioContext.createBufferSource();
            source.buffer = skin.hitSounds[soundName];
            source.connect(player.audioContext.destination);
            source.start((obj[2] - timeFrom) / 1000 + player.audioContext.getOutputTimestamp().contextTime + 0.06);
            queuedHitsounds.push(source);
        }
    }
}

export const extractFile = async (blob) => {
    const zipReader = new ZipReader(new BlobReader(blob));
    const entries = await zipReader.getEntries();
    await zipReader.close();
    return entries;
}

const getDifficulty = async (entries, beatmapID) => {
    for (let diff in entries) {
        if (diff.endsWith(".osu")) {
            const text = await entries[diff].getData(new TextWriter());

            // get BeatmapID
            const id = text.match(/(?<=BeatmapID:)\d+/);
            if (id == beatmapID) {
                return text;
            }
        }
    }
}

const getBackgroundPictureURL = async (entries, beatmap) => {
    const picFileName = beatmap.Events[0][2].replace(/^"+|"+$/g, '');
    return URL.createObjectURL(await entries[picFileName]?.getData(new BlobWriter()));
}

const getSong = async (entries, beatmap) => {
    const songFileName = beatmap.General.AudioFilename.trim();
    return await entries[songFileName]?.getData(new BlobWriter());
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
                if (vals[3] & 2) {                      // slider
                    vals[5] = vals[5].split("|");
                    for (let i = 1; i < vals[5].length; i++) {
                        vals[5][i] = vals[5][i].split(":").map(x => parseInt(x));
                    }
                    vals[6] = parseInt(vals[6]);
                    vals[7] = parseInt(vals[7]);
                }
                if (vals[3] & 8) {                      // spinner
                    vals[5] = parseInt(vals[5]);
                }

                // hitsounds
                const pos = (vals[3] & 2) ? 10 : ((vals[3] & 8) ? 6 : 5);
                vals[pos] = (vals[pos]?.split?.(":").map((x, i) => (i != 4 ? parseInt(x) : x))) ?? [0, 0, 0, 0, ""];
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

        // find current timing point
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

        if (!(obj[3] & 8) && (first || obj[3] & 4)) { // new combo
            currentCombo = 1;
            comboIndex += 1;

            if (i == 0 || !(result.HitObjects[i - 1][3] & 8)) {
                comboIndex += (((16 & obj[3]) + (32 & obj[3]) + (64 & obj[3])) >> 4);
            }
        }
        if (obj[3] & 2) { // slider
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

        // https://osu.ppy.sh/wiki/en/Client/File_formats/osu_%28file_format%29#hitsounds
        const hitSamplesPos = (obj[3] & 2) ? 10 : ((obj[3] & 8) ? 6 : 5);
        if (obj[hitSamplesPos][0] == 0) {
            obj[hitSamplesPos][0] = result.TimingPoints[tpIndex - 1][3];
        }
        if (obj[hitSamplesPos][1] == 0) {
            obj[hitSamplesPos][1] = obj[hitSamplesPos][0];
        }
        if (obj[hitSamplesPos][2] == 0) {
            obj[hitSamplesPos][2] = result.TimingPoints[tpIndex - 1][4];
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

