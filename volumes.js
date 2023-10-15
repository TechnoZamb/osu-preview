import { clamp } from "/functions.js";

const volumeControl = document.querySelector("#volume-control");
let lastScrolls = [];
let timeout;

export const volumes = {
    general: [0.1, null],
    music: [1, null],
    effects: [1, null]
};


document.addEventListener("wheel", e => {
    const now = performance.now();
    lastScrolls.push(now);

    lastScrolls = lastScrolls.filter(x => now - x < 400);
    const val = e.deltaY / 10000 * lastScrolls.length;

    volumeControl.setAttribute("shown", "");

    if (document.querySelector("#volume-music:hover")) {
        volumes.music[0] = volumes.music[1].gain.value = clamp(0, volumes.music[0] - val, 1);
        volumeControl.querySelector("#volume-music").style.setProperty("--value", volumes.music[0]);
    }
    else if (document.querySelector("#volume-effects:hover")) {
        volumes.effects[0] = volumes.effects[1].gain.value = clamp(0, volumes.effects[0] - val, 1);
        volumeControl.querySelector("#volume-effects").style.setProperty("--value", volumes.effects[0]);
    }
    else {
        volumes.general[0] = volumes.general[1].gain.value = clamp(0, volumes.general[0] - val, 1);
        volumeControl.querySelector("#volume-general").style.setProperty("--value", volumes.general[0]);
        volumeControl.querySelector("#volume-general > img").src =
           (volumes.general[0] == 0 ? "assets/volume-xmark-solid.svg" :
            volumes.general[0] >= 0.75 ? "assets/volume-high-solid.svg" :
            volumes.general[0] >= 0.25 ? "assets/volume-medium-solid.svg" : "assets/volume-low-solid.svg");
    }

    if (!volumeControl.matches(":hover")) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            volumeControl.removeAttribute("shown");
            timeout = null;
        }, 1500);
    }
});
volumeControl.addEventListener("mouseenter", e => {
    if (timeout) clearTimeout(timeout);
});
volumeControl.addEventListener("mouseleave", e => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
        volumeControl.removeAttribute("shown");
        timeout = null;
    }, 1000);
});
