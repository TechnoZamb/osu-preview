import * as osu from "/osu/osu.js";
import { ProgressBar } from "./progress.js";
import * as render from "./osu/render.js";
import * as loadingWidget from "/loading.js";
import { $ } from "./functions.js";
import { volumes } from "./volumes.js";



var progressBar;


export const options = {
    BeatmapSkin: false,
    BeatmapHitsounds: true,
    BackgroundDim: 0.7
};

export let musicPlayer;
export let state = "loading";
let moreTabOpen = false;

window.addEventListener("load", async (e) => {

    // begin loading process
    loadingWidget.setText("loading assets");
    loadingWidget.show();

    // debug
    try {await fetch("http://localhost:8000/cgi-bin/hello.py")}catch{}

    musicPlayer = await osu.initOsu("map.zip", "skin.zip");
    musicPlayer.currentTime = parseInt(osu.beatmap.General.PreviewTime) / 1000;
    progressBar = new ProgressBar("#progress-bar", musicPlayer);
    progressBar.onFrame = frame;

    // create mod buttons
    for (let [x, y] of [["ez", "easy"], ["ht", "halftime"], ["ao", "autoplay"], ["hr", "hardrock"], ["dt", "doubletime"], ["hd", "hidden"]]) {
        Object.assign($(`#mod-${x} > img`), {
            src: osu.skin[`selection-mod-${y}`].src,
            width: osu.skin[`selection-mod-${y}`].width * $("body").clientWidth / 800 * 1.5,
            onclick: (e) => toggleMod(x)
        });
    }
    
    // necessary to sync music and hitsounds
    musicPlayer.play();
    musicPlayer.pause();
    musicPlayer.onPlay = (e) => osu.queueHitsounds(musicPlayer.currentTime);

    // finished loading
    state = "ready";
    loadingWidget.hide();
});

function frame(time) {
    $("#fps").innerHTML = time;

    time *= 1000;

    osu.adjustSpinnerSpinPlaybackRate(time);

    render.render(time);
}

// ------ INPUT ------
window.addEventListener("keydown", e => {
    if (state !== "ready") return;

    switch (e.code) {
        case "Comma":
            if (musicPlayer.paused) musicPlayer.currentTime -= 0.00833;
            break;
        case "Period":
            if (musicPlayer.paused) musicPlayer.currentTime += 0.00833;
            break;
        case "Space": {
            if (musicPlayer.paused) {
                musicPlayer.play();
                expandWidget("assets/play.png");
            }
            else {
                musicPlayer.pause();
                expandWidget("assets/pause.png");
            }
            break;
        }
        case "KeyQ": {
            toggleMod("ez");
            expandWidget(osu.skin["selection-mod-easy"].src, osu.activeMods.has("ez") ? "none" : "grayscale(1)");
            break;
        }
        case "KeyA": {
            toggleMod("hr");
            expandWidget(osu.skin["selection-mod-hardrock"].src, osu.activeMods.has("hr") ? "none" : "grayscale(1)");
            break;
        }
        case "KeyE": {
            toggleMod("ht");
            expandWidget(osu.skin["selection-mod-halftime"].src, osu.activeMods.has("ht") ? "none" : "grayscale(1)");
            break;
        }
        case "KeyD": {
            toggleMod("dt");
            expandWidget(osu.skin["selection-mod-doubletime"].src, osu.activeMods.has("dt") ? "none" : "grayscale(1)");
            break;
        }
        case "Tab": {
            moreTabOpen = !moreTabOpen;
            if (moreTabOpen)
                $("#more-tab").setAttribute("shown", "");
            else
                $("#more-tab").removeAttribute("shown");
            e.preventDefault();
        }
    }
});

$("canvas").addEventListener("click", e => {
    if (state != "ready") return;

    if (musicPlayer.paused) {
        musicPlayer.play();
        expandWidget("assets/play.png");
    }
    else {
        musicPlayer.pause();
        expandWidget("assets/pause.png");
    }
});

$("#more-btn").addEventListener("click", e => {
    moreTabOpen = !moreTabOpen;
    if (moreTabOpen)
        $("#more-tab").setAttribute("shown", "");
    else
        $("#more-tab").removeAttribute("shown");
    e.preventDefault();
});


let expandFirst = false;
const expandWidget = (src, filter) => {
    const elem = $("#expand-" + (expandFirst + 1));
    expandFirst = !expandFirst;
    elem.onload = () => {
        elem.style.transition = "none";
        elem.classList = "";
        void elem.offsetWidth;
        elem.style.transition = null;
        if (filter == "none") {
            elem.classList.add("expand-and-fade-and-rotate");
        }
        else {
            elem.classList.add("expand-and-fade");
        }
    };
    elem.src = src;
    elem.style.filter = filter;
}

const toggleMod = (mod) => {
    osu.toggleMod(mod);

    for (let mod of ["ez","hr","ht","dt","ao","hd"]) {
        if (osu.activeMods.has(mod)) {
            $("#mod-" + mod + " > img").setAttribute("toggled", "");
        }
        else  {
            $("#mod-" + mod + " > img").removeAttribute("toggled");
        }
    }
}
