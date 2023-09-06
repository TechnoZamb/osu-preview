import { MusicPlayer } from "./player.js";
import { ProgressBar } from "./progress.js";
import { parseSkin } from "./skin.js";
import * as render from "./render.js";
import { sleep } from "./functions.js";
import { getSliderTicks } from "./slider.js";
const { BlobReader, ZipReader, BlobWriter, TextWriter } = zip;


const diff = [
    "katagiri - ch3rry (Short Ver.) (Inverse) [Blossom 1.1x (226bpm)].osu", 
    "MIMI vs. Leah Kate - 10 Things I Hate About Ai no Sukima (Log Off Now) [sasa].osu", 
    "sweet ARMS - Blade of Hope (TV Size) (Aruyy) [Expert].osu"
][1];

var player, progressBar;

export let beatmap, skin;
export let bgdim = 1;

var spinnerspinSource;
var gainNode;


window.addEventListener("load", async (e) => {
    document.querySelector("#play").addEventListener("click", e => player.play())
    document.querySelector("#pause").addEventListener("click", e => player.pause());

    document.querySelector("input").oninput = (e) => bgdim = e.target.value;
    document.querySelector("input").value = bgdim;

    try {await fetch("http://localhost:8000/cgi-bin/hello.py")}catch{}

    const oszFile = await fetch("map.zip").then(r => r.blob());
    const beatmapFiles = (await extractFile(oszFile)).reduce((prev, curr) => ({ ...prev, [curr.filename]: curr }), {});

    beatmap = await getDifficulty(beatmapFiles, "0");
    beatmap = await beatmapFiles[diff].getData(new TextWriter());
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

    const skinBlob = await fetch("skin.zip").then(res => res.blob());
    const skinFiles = (await extractFile(skinBlob)).reduce((prev, curr) => ({ ...prev, [curr.filename]: curr }), {});
    skin = await parseSkin(skinFiles, beatmapFiles, beatmap, true);
    render.init(bgURL);

    const songBlob = await getSong(beatmapFiles, beatmap);
    player = await MusicPlayer.init(songBlob, () => queueHitsounds(player.currentTime));
    progressBar = new ProgressBar("#progress-bar", player);
    progressBar.onFrame = frame;
    progressBar.onResume = queueHitsounds;

    gainNode = player.audioContext.createGain();
    gainNode.gain.value = 0.3;
    gainNode.connect(player.audioContext.destination);

    player.currentTime = 0//parseInt(beatmap.General.PreviewTime) / 1000;

    // necessary to sync music and hitsounds
    player.play();
    player.pause();
    await sleep(100);
    player.play();
    player.pause();
});

function frame(time) {
    document.querySelector("#fps").innerHTML = time;

    time *= 1000;

    if (spinnerspinSource) {
        const thisSpinner = beatmap.HitObjects.find(x => x.isSpinner && x.time <= time && time < x.endTime);
        if (thisSpinner) {
            spinnerspinSource.playbackRate.value = 0.45 + (time - thisSpinner.time) / thisSpinner.duration * 1.82;
        }
    }

    render.render(time);
}

let queuedHitsounds = [];
const queueHitsounds = (timeFrom) => {

    timeFrom *= 1000;

    // stop all hitsounds from playing
    for (let i = 0; i < queuedHitsounds.length; i++) {
        queuedHitsounds[i].stop(0);
    }
    try {
        spinnerspinSource.stop(0);
    } catch {}

    queuedHitsounds = [];

    let source;

    for (let obj of beatmap.HitObjects) {
        if (obj.time + (obj.isSlider ? obj.duration * obj.slides : obj.isSpinner ? obj.endTime - obj.time : 0) <= timeFrom) {
            continue;
        }

        const playSound = (sound, time) => {
            time = obj.time - timeFrom + (time ?? 0);
            if (time > 0) {
                source = player.audioContext.createBufferSource();
                source.buffer = skin.hitSounds[sound];
                source.connect(gainNode);
                source.start(time / 1000 + player.audioContext.getOutputTimestamp().contextTime + 0.06);
                queuedHitsounds.push(source);
            }
        };
        const composeSound = (set, sound, index, time) => {
            const soundName = `${[, "normal", "soft", "drum"][set]}-hit${["normal", "whistle", "finish", "clap"][sound]}${index}`;
            playSound(soundName, time);
        }

        if (obj.isSlider) {
            // for each slide
            for (let i = 0; i <= obj.slides; i++) {
                for (let j = 1; j < 4; j++) {
                    if (obj.edgeSounds[i] & (2 ** j)) {
                        composeSound(obj.edgeSets[i][1], j, obj.hitSample[2], obj.duration * i);
                    }
                }

                if (obj.edgeSounds[i] == 0 || parseInt(skin.LayeredHitSounds)) {
                    composeSound((obj.edgeSets[i][0] ?? 1), 0, obj.hitSample[2], obj.duration * i);
                }
            }

            // looping sound
            let soundName = `${[, "normal", "soft", "drum"][obj.hitSample[1]]}-slider${["slide", "whistle"][obj.hitSounds & 2 ? 1 : 0]}${obj.hitSample[2]}`;
            source = player.audioContext.createBufferSource();
            source.buffer = skin.hitSounds[soundName];
            source.loop = true;
            source.connect(gainNode);
            source.start((obj.time - timeFrom) / 1000 + player.audioContext.getOutputTimestamp().contextTime + 0.06);
            source.stop((obj.time - timeFrom + obj.duration * obj.slides) / 1000 + player.audioContext.getOutputTimestamp().contextTime + 0.06);
            queuedHitsounds.push(source);

            // slider ticks
            const ticks = getSliderTicks(obj, true);
            soundName = `${[, "normal", "soft", "drum"][obj.hitSample[0]]}-slidertick${obj.hitSample[2]}`;

            for (let i = 0; i < obj.slides; i++) {
                if (i % 2 == 0) {
                    for (let j = 0; j < ticks.length; j++) {
                        playSound(soundName, obj.duration * i + ticks[j]);
                    }
                }
                else {
                    for (let j = ticks.length - 1; j >= 0; j--) {
                        playSound(soundName, obj.duration * i + obj.duration - ticks[j]);
                    }
                }
            }
        }
        else if (obj.isSpinner) {
            for (let i = 1; i < 4; i++) {
                if (obj.hitSounds & (2 ** i)) {
                    composeSound(obj.hitSample[1], i, obj.hitSample[2], obj.duration);
                }
            }

            if (obj.hitSounds == 0 || parseInt(skin.LayeredHitSounds)) {
                composeSound(obj.hitSample[0], 0, obj.hitSample[2], obj.duration);
            }

            // spinner spin
            spinnerspinSource = player.audioContext.createBufferSource();
            spinnerspinSource.buffer = skin.hitSounds["spinnerspin"];
            spinnerspinSource.loop = true;
            spinnerspinSource.connect(gainNode);
            spinnerspinSource.start((obj.time - timeFrom) / 1000 + player.audioContext.getOutputTimestamp().contextTime + 0.06, Math.max((timeFrom - obj.time) / 1000 % source.buffer.duration, 0));
            spinnerspinSource.stop((obj.endTime - timeFrom) / 1000 + player.audioContext.getOutputTimestamp().contextTime + 0.06);

            // spinner bonus
            let j = 0;
            for (let i = obj.duration / 1.95; i < obj.duration; i += 160/*125*/) {
                playSound("spinnerbonus", i);j++;
            }
        }
        else {
            for (let i = 1; i < 4; i++) {
                if (obj.hitSounds & (2 ** i)) {
                    composeSound(obj.hitSample[1], i, obj.hitSample[2]);
                }
            }

            if (obj.hitSounds == 0 || parseInt(skin.LayeredHitSounds)) {
                composeSound(obj.hitSample[0], 0, obj.hitSample[2]);
            }
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
                const hitObj = new HitObject(line.trim().split(","));
                result[currCategory].push(hitObj);
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
        while (tpIndex < result.TimingPoints.length && result.TimingPoints[tpIndex][0] <= obj.time) {
            if (result.TimingPoints[tpIndex][6]) {
                uninheritedTPIndex = tpIndex;
                inheritedTPIndex = -1;
            }
            else {
                inheritedTPIndex = tpIndex;
            }
            tpIndex++;
        }

        if (!obj.isSpinner && (first || obj.isNewCombo)) {
            currentCombo = 1;
            comboIndex += 1;

            if (i == 0 || !(result.HitObjects[i - 1][3] & 8)) {
                comboIndex += (((16 & obj.type) + (32 & obj.type) + (64 & obj.type)) >> 4);
            }
        }
        if (obj.isSlider) {
            obj.beatLength = result.TimingPoints[uninheritedTPIndex][1];
            obj.duration = obj.pixelLength / (result.Difficulty.SliderMultiplier * 100 * (inheritedTPIndex == -1 ? 1 : -100 / result.TimingPoints[inheritedTPIndex][1])) * result.TimingPoints[uninheritedTPIndex][1];
            result.HitObjects.splice(i, 1);
            sliders.push(obj);
            i--;
        }

        obj.combo = currentCombo;
        obj.comboIndex = comboIndex;
        currentCombo++;

        first = false;
        if (obj.isSpinner) {
            first = true;
        }

        // https://osu.ppy.sh/wiki/en/Client/File_formats/osu_%28file_format%29#hitsounds
        if (obj.hitSample[0] == 0) {
            obj.hitSample[0] = result.TimingPoints[tpIndex - 1][3];
        }
        if (obj.hitSample[1] == 0) {
            obj.hitSample[1] = obj.hitSample[0];
        }
        if (obj.hitSample[2] == 0 || obj.isSlider) {    // sliders ignore the index, for some reason
            obj.hitSample[2] = result.TimingPoints[tpIndex - 1][4];
        }

        if (obj.isSlider) {
            for (let x of obj.edgeSets) {
                if (x[0] == 0) {
                    x[0] = result.TimingPoints[tpIndex - 1][3];
                }
                if (x[1] == 0) {
                    x[1] = x[0];
                }
            }
        }   
    }

    sliders.sort((a, b) => (a.time + a.duration) - (b.time + b.duration));
    for (let slider of sliders) {
        let i = result.HitObjects.length - 1;
        while (i >= 0 && slider.time + slider.duration < result.HitObjects[i].time)
            i--;
        result.HitObjects.splice(i + 1, 0, slider);
    }

    return result;
}



class HitObject {
    constructor(obj, index) {
        if (!obj || !(obj instanceof Array) || obj.length < 6) {
            throw new TypeError("Argument error");
        }

        const validateInt = (val, field) => isNaN(val) ? throwInvalidVal(field) : parseInt(val);
        const validateFloat = (val, field) => isNaN(val) ? throwInvalidVal(field) : parseFloat(val);
        const throwInvalidVal = (field) => { throw new TypeError(`Hitobject #${index}: Invalid value for field ${field}`) };

        const hitSample = (index2) => {
            this.hitSample = obj[index2]?.split?.(":").map((x, i) => (i != 4 ? validateInt(x, "hitSample") : x)) ?? [0,0,0,0,""];
        };

        this.x = validateInt(obj[0], "x");
        this.y = validateInt(obj[1], "y");
        this.time = validateInt(obj[2], "time");
        this.type = validateInt(obj[3], "type");
        this.hitSounds = validateInt(obj[4], "hitSounds");

        // can only be of 1 type
        if (this.isHitCircle + this.isSlider + this.isSpinner > 1) throwInvalidVal("type");

        if (this.isSlider) {
            this.curvePoints = obj[5]?.split("|");

            if (!this.curvePoints || this.length < 2) throwInvalidVal("curvePoints");
            if (!["L", "P", "B", "C"].includes(this.curvePoints[0])) throwInvalidVal("curvePoints");

            this.curveType = this.curvePoints[0];
            this.curvePoints = this.curvePoints.slice(1);
            for (let i = 0; i < this.curvePoints.length; i++) {
                this.curvePoints[i] = this.curvePoints[i].split?.(":").map?.(x => validateInt(x, "curvePoints"));
                if (!this.curvePoints || this.curvePoints[i].length != 2) throwInvalidVal("curvePoints");
                this.curvePoints[i] = { x: this.curvePoints[i][0], y: this.curvePoints[i][1] };
            }

            this.slides = validateInt(obj[6], "slides");
            this.pixelLength = validateFloat(obj[7], "length");
            
            this.edgeSounds = obj[8]?.split?.("|") ?? [];
            for (let i = 0; i <= this.slides; i++) {
                if (this.edgeSounds[i] == undefined) {
                    this.edgeSounds[i] = 0;
                }
                else {
                    this.edgeSounds[i] = validateInt(this.edgeSounds[i], "edgeSounds");
                }
            }

            this.edgeSets = obj[9]?.split?.("|") ?? [];
            for (let i = 0; i <= this.slides; i++) {
                this.edgeSets[i] = (this.edgeSets[i] ?? "0:0").split?.(":").map(x => validateInt(x, "edgeSets"));
                if (!this.edgeSets[i] || this.edgeSets[i].length != 2) {
                    this.edgeSets[i] = [0, 0];
                }
            }

            hitSample(10);
        }
        else if (this.isSpinner) {
            this.endTime = validateInt(obj[5], "endTime");
            this.duration = this.endTime - this.time;
            hitSample(6);
        }
        else {
            hitSample(5);
        }
    }

    get isHitCircle() { return !!(this.type & 1) }
    get isSlider() { return !!(this.type & 2) }
    get isSpinner() { return !!(this.type & 8) }
    get isNewCombo() { return !!(this.type & 4) }
}
