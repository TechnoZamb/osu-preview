import { $ } from "/functions.js";

const screen = $("#loading-screen");
const canvas = $("#loading-canvas");
const spinner = $("#loading-spinner");
const face = $("#loading-face");
const text = $("#loading-text");
const progress = $("#loading-progress");

let shown = false;

const worker = new Worker("worker.js");
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage(["init", offscreen], [offscreen]);

export const show = () => {
    if (shown)
        return;

    screen.style.transition = "none";
    screen.style.opacity = 1;
    screen.style.pointerEvents = "all";
    void screen.offsetWidth;
    screen.style.transition = "";
    shown = true;

    worker.postMessage(["show"]);
}

export const hide = () => {
    if (!shown)
        return;

    screen.style.opacity = 0;
    screen.style.pointerEvents = "none";
    shown = false;

    worker.postMessage(["hide"]);
}

export const setText = (t) => {
    text.innerHTML = t;
}

export const setValue = (value) => {
    progress.innerHTML = parseInt(value * 100) + "%";
    spinner.style.setProperty("--spinner-animation", "none");
    spinner.style.setProperty("--spinner-clip", "polygon(50% 50%, 0 0, " + (
        value < 0.25 ? `${value * 400}% 0)` :
        value < 0.50 ? `100% 0, 100% ${(value - 0.25) * 400}%)` :
        value < 0.75 ? `100% 0, 100% 100%, ${(0.25 - value + 0.5) * 400}% 100%)` :
                       `100% 0, 100% 100%, 0 100%, 0 ${(0.25 - value + 0.75) * 400}%`)
    );
}

export const clearValue = () => {
    progress.innerHTML = "";
    spinner.style.setProperty("--spinner-animation", "");
    spinner.style.setProperty("--spinner-clip", "none");
}

export const error = (errText) => {
    text.innerHTML = errText ?? "an error occured.";
    screen.classList.add("error");
    spinner.style.display = "none";
    face.style.display = "block";
    void face.offsetWidth;
    face.style.opacity = 1;
    face.style.transform = "translate(-50%, -50%)";
}
