import * as osu from "/osu/osu.js";
import * as render from "./osu/render.js";
import { ProgressBar } from "./progress.js";
import * as loadingWidget from "/loading.js";
import { volumes, updateSliders } from "/volumes.js";
import { $, sleep } from "./functions.js";


export let options = {
    BeatmapSkin: false,
    BeatmapHitsounds: false,
    ShowCursor: true,
    BackgroundDim: 0.7,
    VolumeGeneral: 0.2,
    VolumeMusic: 1,
    VolumeEffects: 1
};

const timeIndicator = $("#time-indicator");
export let musicPlayer;
let progressBar;
export let state = "loading";
let moreTabOpen = false;

let beatmapSetID, beatmapID;
let oszBlob, oszFilename;
let skinBlob, skinName;

let tab;

export const isDebug = !(chrome && chrome.tabs && chrome.storage);

let error = false;
["error", "unhandledrejection"].forEach(x => window.addEventListener(x, async (e) => {
    if (error) return;
    try { musicPlayer.pause(); } catch { }
    try { loadingWidget.error(); } catch { alert("An error occured. Contact the developer"); }
    error = true;
}));

window.addEventListener("load", async (e) => {
    // begin loading process
    loadingWidget.setText("loading assets");
    loadingWidget.show();

    if (!isDebug) {
        // get current tab URL
        tab = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0] || { url: "https://osu.ppy.sh/beatmapsets/773330#osu/1626537", id: 0 };
        if (!tab) throw new Error();
        let tabURL = tab.url;

        // match URL with regex
        const matches = tabURL.match(/^https:\/\/osu.ppy.sh\/beatmapsets\/(\d+)(#[a-z]+)\/(\d+)$/);
        if (!matches || !matches.length) {
            loadingWidget.error("not supported on this website");
            return;
        }

        if (matches[2] !== "#osu") {
            loadingWidget.error("unsupported gamemode");
            return;
        }

        [beatmapSetID, beatmapID] = [matches[1].toString(), matches[3]];
        // try and get downloaded map from storage; if not found, fetch it
        const storedMap = (await chrome.storage.local.get("b-" + beatmapSetID))["b-" + beatmapSetID];
        if (!storedMap) {
            console.log("Beatmap not found in local storage; downloading it");
            loadingWidget.setText("downloading beatmap");

            const downloadResult = await downloadMapset(`https://osu.ppy.sh/beatmapsets/${beatmapSetID}/download`);
            if (typeof downloadResult === "string") {
                loadingWidget.clearValue();
                loadingWidget.error(downloadResult);
                return;
            }
            else {
                oszBlob = downloadResult;
            }

            loadingWidget.setText("loading assets");
            loadingWidget.clearValue();
            const uint8arr = new Uint8Array(await oszBlob.arrayBuffer());
            const buffer = new Array(oszBlob.size);
            for (let i = 0; i < oszBlob.size; i++) {
                buffer[i] = String.fromCharCode(uint8arr[i]);
            }

            // save mapset and current time
            await chrome.storage.local.set({
                ["b-" + beatmapSetID]: buffer.join(""),             // b for beatmapSet
                ["t-" + beatmapSetID]: new Date().toISOString()     // t for time
            });
        }
        else {
            console.log("Beatmap found in local storage");
            // decode stored map
            const buffer = new Uint8Array(storedMap.length);
            for (let i = 0; i < storedMap.length; i++) {
                buffer[i] = storedMap.charCodeAt(i);
            }
            oszBlob = new Blob([buffer.buffer]).slice(0, buffer.length, "application/x-osu-beatmap-archive");
        }

        clearOldMaps();

        // try and load user skin; if not found, load empty zip (uses default skin)
        const userSkin = (await chrome.storage.local.get("skin")).skin;
        let skinBuffer;
        if (!userSkin) {
            // bytes for empty zip
            skinBuffer = new Uint8Array([80, 75, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
            const buffer = new Array(skinBuffer.length);
            for (let i = 0; i < skinBuffer.length; i++) {
                buffer[i] = String.fromCharCode(skinBuffer[i]);
            }
            chrome.storage.local.set({ skin: buffer.join("") });
        }
        else {
            skinBuffer = new Uint8Array(userSkin.length);
            for (let i = 0; i < userSkin.length; i++) {
                skinBuffer[i] = userSkin.charCodeAt(i);
            }
        }
        skinBlob = new Blob([skinBuffer.buffer]).slice(0, skinBuffer.length, "application/x-osu-skin-archive");

        skinName = (await chrome.storage.local.get("skinName")).skinName ?? "Default skin";
        $("#skin-name").innerHTML = skinName;

    }
    else {
        try { await fetch("http://localhost:8000/cgi-bin/zipper.py") } catch { }
        oszBlob = await fetch("map.zip").then(r => r.blob());
        skinBlob = await fetch("skin.zip").then(r => r.blob());
    }

    readOptions();

    musicPlayer = await osu.initOsu(oszBlob, skinBlob, beatmapID);
    musicPlayer.onPlay = (e) => osu.queueHitsounds(musicPlayer.currentTime);
    progressBar = new ProgressBar("#progress-bar", musicPlayer);
    progressBar.onFrame = frame;

    oszFilename = `${beatmapSetID} ${osu.beatmap.Metadata.Artist} - ${osu.beatmap.Metadata.Title}.osz`;

    // create mod buttons
    for (let [x, y] of [["ez", "easy"], ["ht", "halftime"], ["hr", "hardrock"], ["dt", "doubletime"], ["hd", "hidden"], ["fl", "flashlight"]]) {
        Object.assign($(`#mod-${x} > img`), {
            src: osu.skin[`selection-mod-${y}`].src,
            width: osu.skin[`selection-mod-${y}`].width * $("body").clientWidth / 800 * 1.5,
            onclick: (e) => toggleMod(x)
        });
    }

    // finished loading
    state = "ready";
    loadingWidget.hide();

    // bullshit that i HAVE to do in order to not have desynced hitsounds at first
    await sleep(100);
    musicPlayer.currentTime = parseInt(osu.beatmap.General.PreviewTime) / 1000;
    volumes.general[1].gain.value = 0;
    musicPlayer.play();
    await sleep(100);
    volumes.general[1].gain.value = volumes.general[0];
    musicPlayer.play();
});

function frame(time) {
    time *= 1000;

    osu.adjustSpinnerSpinPlaybackRate(time);
    render.render(time);
    
    // adjust time indicator
    timeIndicator.innerHTML =
        parseInt(musicPlayer.currentTime / 60) + ':' + parseInt(musicPlayer.currentTime % 60).toString().padStart(2, '0') +
        ' / ' +
        parseInt(musicPlayer.duration / 60) + ':' + parseInt(musicPlayer.duration % 60).toString().padStart(2, '0');
}

const downloadMapset = async (url) => {
    let result, callback;
    const promise = new Promise(r => callback = r);
    const xmlHTTP = new XMLHttpRequest();
    xmlHTTP.open("GET", url, true);
    xmlHTTP.responseType = "arraybuffer";
    xmlHTTP.onload = function(e) {
        if (e.target.status == 401) {
            result = "you need to be logged in to allow this extension to download beatmaps.";
        }
        else if (e.target.status == 200) {
            result = new Blob([this.response]).slice(0, this.response.byteLength, "application/x-osu-beatmap-archive");
        }
        else {
            result = "an error occured.";
        }
        callback();
    };
    xmlHTTP.onprogress = function(pr) {
        loadingWidget.setValue(pr.loaded / pr.total);
    };
    xmlHTTP.send();
    await Promise.allSettled([promise]);
    return result;
}

const clearOldMaps = async () => {
    if (!isDebug) {
        const allStorage = await chrome.storage.local.get(null);

        for (let key of Object.keys(allStorage)) {
            // if this key is a mapset
            if (key.startsWith("b-")) {
                // get time
                const cachedTime = allStorage["t-" + key.substring(2)] ?? "0";

                // if cached map older than 1 hour, remove
                const maxTimeDiff = 1 * 1000 * 60 * 60;
                if (new Date() - maxTimeDiff > new Date(cachedTime)) {
                    chrome.storage.local.remove([key, "t-" + key.substring(2)]);
                }
            }
        }
    }
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
        case "ArrowLeft": {
            musicPlayer.currentTime -= 3;
            if (!musicPlayer.paused) musicPlayer.play();
            break;
        }
        case "ArrowRight": {
            musicPlayer.currentTime += 3;
            if (!musicPlayer.paused) musicPlayer.play();
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
        case "KeyF": {
            toggleMod("hd");
            expandWidget(osu.skin["selection-mod-hidden"].src, osu.activeMods.has("hd") ? "none" : "grayscale(1)");
            break;
        }
        case "KeyG": {
            toggleMod("fl");
            expandWidget(osu.skin["selection-mod-flashlight"].src, osu.activeMods.has("fl") ? "none" : "grayscale(1)");
            break;
        }
        case "Tab": {
            toggleMoreTab(e);
            break;
        }
    }
    if (e.code.startsWith("Digit") || e.code.startsWith("Numpad")) {
        const digit = parseInt(e.code.at(-1));
        musicPlayer.currentTime = digit / 10 * musicPlayer.duration;
        if (!musicPlayer.paused) musicPlayer.play();
    }
});
document.addEventListener("mouseup", e => document.activeElement.blur());

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

$("#report-btn").addEventListener("click", e => {
    if (e.target != e.currentTarget) return;
    e.currentTarget.querySelector(".report-panel").toggleAttribute("visible");
});
window.addEventListener("mousedown", e => {
    if (!e.target.closest("#report-btn")) $(".report-panel").removeAttribute("visible")
});

const toggleMoreTab = (e) => {
    moreTabOpen = !moreTabOpen;
    if (moreTabOpen) {
        $("#more-tab").setAttribute("shown", "");
        $("#more-btn").setAttribute("active", "");
    }
    else {
        $("#more-tab").removeAttribute("shown");
        $("#more-btn").removeAttribute("active");
    }
    e.preventDefault();
    e.stopPropagation();
}
$("#more-btn").addEventListener("click", toggleMoreTab);
$("#download-btn").addEventListener("click", e => {
    chrome.downloads.download({
        url: URL.createObjectURL(oszBlob),
        filename: oszFilename
    })
});

$("#background-dim").addEventListener("input", e => {
    options.BackgroundDim = e.target.value / 100;
    saveOptions();
    $("#slider-thumb").style.left = e.target.value + "%";
    e.target.style.background = `linear-gradient(to right, #f78ea0 0%, #f78ea0 calc(${e.target.value}% - 14px), transparent calc(${e.target.value}% - 14px),
        transparent calc(${e.target.value}% + 12px), #793a46 calc(${e.target.value}% + 12px), #793a46 100%)`;
});
let bgDimTimeout;
$("#background-dim").addEventListener("mousedown", e => {
    const elem = $("#bgdim-wrapper");
    const offset = elem.getBoundingClientRect();
    $("main").appendChild(elem);
    elem.style.position = "fixed";
    elem.style.left = offset.left + "px";
    elem.style.top = offset.top + "px";
    elem.style.width = offset.width + "px";
    elem.style.height = offset.height + "px";
    void elem.offsetWidth;
    elem.style.background = "#0000009e";

    const elem2 = $("#background-dim");
    elem2.value = (e.clientX - elem2.getBoundingClientRect().left) / elem2.clientWidth * 100;
    elem2.dispatchEvent(new Event("input"));

    $("#more-tab").removeAttribute("shown");
    if (bgDimTimeout) {
        clearTimeout(bgDimTimeout);
    }
});
$("#background-dim").addEventListener("mouseup", e => {
    $("#more-tab").setAttribute("shown", "");
    const elem = $("#bgdim-wrapper");
    elem.style.background = "";
    if (bgDimTimeout) {
        clearTimeout(bgDimTimeout);
    }
    bgDimTimeout = setTimeout(() => {
        $(".middle").appendChild(elem);
        elem.style.position = "";
        elem.style.left = "";
        elem.style.top = "";
        elem.style.width = "";
        elem.style.height = "";
        bgDimTimeout = null;
    }, parseFloat(getComputedStyle($("#more-tab")).transitionDuration.split(",")[0]) * 1000);
});
document.querySelectorAll(".checkbox").forEach(x => x.addEventListener("click", async e => {
    let val;
    switch (e.target.id) {
        case "check-cursor": {
            val = options.ShowCursor = !options.ShowCursor;
            break;
        }
        case "check-maphitsounds": {
            val = options.BeatmapHitsounds = !options.BeatmapHitsounds;
            await osu.reloadHitsounds();
            if (!musicPlayer.paused) musicPlayer.play();
            break;
        }
        case "check-mapskin": {
            val = options.BeatmapSkin = !options.BeatmapSkin;
            await osu.reloadSkin();
            break;
        }
    }

    val ? e.target.setAttribute("toggled", "") : e.target.removeAttribute("toggled");
    saveOptions();
}));
$("#skin-btn").addEventListener("input", async e => {
    if (e.target.files.length) {
        const file = e.target.files[0];
        await osu.reloadSkin(file);
        await osu.reloadHitsounds();
        if (!musicPlayer.paused) musicPlayer.play();

        // save skin to storage
        const uint8arr = new Uint8Array(await file.arrayBuffer());
        const buffer = new Array(file.size);
        for (let i = 0; i < file.size; i++) {
            buffer[i] = String.fromCharCode(uint8arr[i]);
        }
        chrome.storage.local.set({ skin: buffer.join("") });

        let skinName = file.name;
        const lastPeriod = file.name.lastIndexOf(".");
        if (lastPeriod != -1) {
            skinName = skinName.substring(0, lastPeriod);
        }
        chrome.storage.local.set({ skinName: skinName });
        $("#skin-name").innerHTML = skinName;

        // reload mod buttons
        for (let [x, y] of [["ez", "easy"], ["ht", "halftime"], ["hr", "hardrock"], ["dt", "doubletime"], ["hd", "hidden"], ["fl", "flashlight"]]) {
            Object.assign($(`#mod-${x} > img`), {
                src: osu.skin[`selection-mod-${y}`].src,
                width: osu.skin[`selection-mod-${y}`].width * $("body").clientWidth / 800 * 1.5,
            });
        }
    }
});


let expandFirst = false;
const expandWidget = (src, filter) => {
    const elem = $("#expand-" + (expandFirst + 1));
    expandFirst = !expandFirst;
    elem.onload = () => {
        elem.style.transition = "none";
        elem.classList = "";
        elem.removeAttribute("width");
        void elem.offsetWidth;

        elem.style.transition = null;
        elem.width = elem.width * $("body").clientWidth / 800;
        if (filter == "none")
            elem.classList.add("expand-and-fade-and-rotate");
        else
            elem.classList.add("expand-and-fade");
    };
    elem.src = src;
    elem.style.filter = filter;
}

const toggleMod = (mod) => {
    osu.toggleMod(mod);

    for (let mod2 of ["ez", "hr", "ht", "dt", "hd", "fl"]) {
        if (osu.activeMods.has(mod2)) {
            $("#mod-" + mod2 + " > img").setAttribute("toggled", "");
        }
        else {
            $("#mod-" + mod2 + " > img").removeAttribute("toggled");
        }
    }
}

const readOptions = async () => {
    if (!isDebug) {
        const savedOptions = (await chrome.storage.local.get("options")).options;
        if (!savedOptions) {
            chrome.storage.local.set({ options: options });
        }
        else {
            Object.keys(options).forEach(key => {
                if (savedOptions[key] !== undefined) {
                    options[key] = savedOptions[key];
                }
            })
        }
    }

    volumes.general[0] = options.VolumeGeneral;
    volumes.music[0] = options.VolumeMusic;
    volumes.effects[0] = options.VolumeEffects;
    updateSliders();

    $("#background-dim").value = parseInt(options.BackgroundDim * 100);
    $("#background-dim").dispatchEvent(new Event("input"));

    options.ShowCursor ? $("#check-cursor").setAttribute("toggled", "") : $("#check-cursor").removeAttribute("toggled");
    options.BeatmapHitsounds ? $("#check-maphitsounds").setAttribute("toggled", "") : $("#check-maphitsounds").removeAttribute("toggled");
    options.BeatmapSkin ? $("#check-mapskin").setAttribute("toggled", "") : $("#check-mapskin").removeAttribute("toggled");
}

export const saveOptions = () => {
    if (!isDebug) chrome.storage.local.set({ options: options });
}
