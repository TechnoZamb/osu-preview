import * as osu from "/osu/osu.js";
import * as render from "./osu/render.js";
import { ProgressBar } from "./progress.js";
import * as loadingWidget from "/loading.js";
import { volumes, updateSliders } from "/volumes.js";
import { $ } from "./functions.js";


var progressBar;


export let options = {
    BeatmapSkin: false,
    BeatmapHitsounds: false,
    ShowCursor: true,
    BackgroundDim: 0.7,
    VolumeGeneral: 0.5,
    VolumeMusic: 1,
    VolumeEffects: 1
};

export let musicPlayer;
export let state = "loading";
let moreTabOpen = false;

let oszBlob, oszFilename;
let skinBlob, skinName;


window.addEventListener("load", async (e) => {
    // begin loading process
    loadingWidget.setText("loading assets");
    loadingWidget.show();

    // get current tab URL
    var tabURL = (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0] || { url: "https://osu.ppy.sh/beatmapsets/17624#osu/65312" };
    if (!tabURL) return;
    tabURL = tabURL.url;

    // match URL with regex
    const matches = tabURL.match(/^https:\/\/osu.ppy.sh\/beatmapsets\/(\d+)(#[a-z]+)\/(\d+)$/);
    if (!matches || !matches.length) {
        alert("not supported on this website");
        return;
    }
    
    if (matches[2] !== "#osu") {
        alert("unsupported gamemode");
        return;
    }
    
    const [ beatmapSetID, beatmapID ] = [ matches[1].toString(), matches[3] ];
    // try and get downloaded map from storage; if not found, fetch it
    const storedMap = (await chrome.storage.local.get(beatmapSetID))[beatmapSetID];
    if (true||!storedMap) {
        console.log("Beatmap not found in local storage; downloading it");
        loadingWidget.setText("downloading beatmap");
        oszBlob = await downloadMapset(`https://osu.ppy.sh/beatmapsets/${beatmapSetID}/download`);

        loadingWidget.setText("loading assets");
        loadingWidget.clearValue();
        const uint8arr = new Uint8Array(await oszBlob.arrayBuffer());
        const buffer = new Array(oszBlob.size);
        for (let i = 0; i < oszBlob.size; i++) {
            buffer[i] = String.fromCharCode(uint8arr[i]);
        }
        chrome.storage.local.set({ [beatmapSetID]: buffer.join("") });
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

    readOptions();

    musicPlayer = await osu.initOsu(oszBlob, skinBlob, beatmapID);
    musicPlayer.onPlay = (e) => osu.queueHitsounds(musicPlayer.currentTime);
    musicPlayer.currentTime = parseInt(osu.beatmap.General.PreviewTime) / 1000;
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


    musicPlayer.pause();
    musicPlayer.play();
});

function frame(time) {
    time *= 1000;

    osu.adjustSpinnerSpinPlaybackRate(time);

    render.render(time);
}

const downloadMapset = async (url) => {
    let blob, callback;
    const promise = new Promise(r => callback = r);
    const xmlHTTP = new XMLHttpRequest();
    xmlHTTP.open('GET', url, true);
    xmlHTTP.responseType = 'arraybuffer';
    xmlHTTP.onload = function (e) {
        blob = new Blob([this.response]);
        callback();
    };
    xmlHTTP.onprogress = function (pr) {
        loadingWidget.setValue(pr.loaded / pr.total);
    };
    xmlHTTP.send();
    await Promise.allSettled([promise]);
    return blob;
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
            moreTabOpen = !moreTabOpen;
            if (moreTabOpen)
                $("#more-tab").setAttribute("shown", "");
            else
                $("#more-tab").removeAttribute("shown");
            e.preventDefault();
        }
    }
    if (e.code.startsWith("Digit") || e.code.startsWith("Numpad")) {
        const digit = parseInt(e.code.at(-1));
        musicPlayer.currentTime = digit / 10 * musicPlayer.duration;
        osu.queueHitsounds(musicPlayer.currentTime);
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
            osu.queueHitsounds(musicPlayer.currentTime);
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
        osu.queueHitsounds(musicPlayer.currentTime);

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

    for (let mod of ["ez", "hr", "ht", "dt", "hd", "fl"]) {
        if (osu.activeMods.has(mod)) {
            $("#mod-" + mod + " > img").setAttribute("toggled", "");
        }
        else {
            $("#mod-" + mod + " > img").removeAttribute("toggled");
        }
    }
}

const readOptions = async () => {
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
    chrome.storage.local.set({ options: options });
}


document.getElementById("reset").addEventListener("click", e => chrome.storage.local.clear())
document.getElementById("download-btn").addEventListener("click", e => {
    chrome.downloads.download({
        url: URL.createObjectURL(oszBlob),
        filename: oszFilename
    })
})