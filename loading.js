import { $ } from "/functions.js";

const screen = $("#loading-screen");
const canvas = $("#loading-canvas");
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
    worker.postMessage(["setValue", value]);
}

export const clearValue = () => {
    progress.innerHTML = "";
    worker.postMessage(["setValue", null]);
}

export const error = (errText, showReportBtn) => {
    text.innerHTML = errText ?? "An error occured.";
    screen.classList.add("error");
    progress.style.display = "none";
    worker.postMessage(["error"]);
    face.style.display = "block";
    void face.offsetWidth;
    face.style.opacity = 1;
    face.style.transform = "translate(-50%, -50%)";

    if (showReportBtn) {
        $("#loading-report-btn").style.display = "inline-block";
        $("#loading-report-btn").append($("#report-btn > div") ?? "");
        $("#loading-text").onclick = function() {
            navigator.clipboard.writeText(this.innerHTML);
            alert("Error copied to the clipboard");
        };
        $("#loading-text").classList.add("clickable");
    }
}
