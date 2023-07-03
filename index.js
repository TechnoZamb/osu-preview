import { MusicPlayer } from "./player.js";
import { ProgressBar } from "./progress.js";

var player, progressBar;
var beatmap;
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

window.onload = async (e) => {
    player = await MusicPlayer.init("b/audio.ogg");

    canvas.width = 640;
    canvas.height = 480;
    document.querySelector("#play").addEventListener("click", e => player.play())
    document.querySelector("#pause").addEventListener("click", e => player.pause());

    const text = await fetch("b/MIMI vs. Leah Kate - 10 Things I Hate About Ai no Sukima (Log Off Now) [1 - I Hate The Fact You Made Sytho Map Too].osu").then(r => r.text());
    beatmap = parseBeatmap(text);console.log(beatmap)

    progressBar = new ProgressBar("#progress-bar", player, callback);
}

function callback(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ff0000";
    //ctx.fillRect(10, 10, 100 * Math.sin(performance.now() / 5000 * 3.14) + 200, 100);

    time *= 1000;
    // find first object to paint
    var index = binarySearch(beatmap.HitObjects, time);

    ctx.strokeStyle = "black";
    let i = 0;
    while (beatmap.HitObjects[index + i++][2] < time + 200) {
        const obj = beatmap.HitObjects[index + i];
        ctx.beginPath();
        ctx.arc(obj[0], obj[1], 50, 0, 2 * Math.PI);
        ctx.stroke();
    }
}

const parseBeatmap = (text) => {
    var result = {};
    var currCategory, matches;

    for (let line of text.split("\n")) {
        if (!line.trim() || line.startsWith("//") || line.match(/^osu file format v/)) {
            continue;
        }

        if ((matches = line.match(/ *\[([^\[\]]+)\] */))) {
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
            result[currCategory][keyval[0]] = keyval[1];
        }
    }

    return result;
}

const binarySearch = (objects, time) => {
    let l = 0, r = objects.length - 1, m;

    while (l <= r) {
        m = Math.floor((l + r) / 2);
        if (objects[m][2] < time) {
            l = m + 1;
        }
        else if (objects[m][2] > time) {
            r = m - 1;
        }
        else {
            return m;
        }
    }

    return m;
}