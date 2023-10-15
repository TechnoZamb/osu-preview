import { clamp } from "/functions.js";

export class ProgressBar {
    easingFactor = 0.2; offset = 0.001;
    targetValue = -1; actualValue = 0.5;
    dragging = false;

    constructor(element, musicPlayer) {
        if (element instanceof Element)
            this.progressBar = element;
        else
            this.progressBar = document.querySelector(element);

        this.progress = this.progressBar.querySelector(".progress");
        this.player = musicPlayer;

        this.progressBar.addEventListener("mousedown", e => {
            this.targetValue = e.offsetX / this.progressBar.clientWidth;
            this.dragging = true;
            this.progressBar.setAttribute("hover", "hover");
        });
        window.addEventListener("mousemove", e => {
            if (this.dragging)
                this.targetValue = clamp(0, (e.clientX - this.progressBar.getBoundingClientRect().left) / this.progressBar.clientWidth, 1);
        });
        window.addEventListener("mouseup", e => {
            if (this.dragging) {
                this.dragging = false;
                this.targetValue = clamp(0, (e.clientX - this.progressBar.getBoundingClientRect().left) / this.progressBar.clientWidth, 1);
                this.progressBar.removeAttribute("hover");
            }
        });

        this.frame();
    }

    frame() {
        var deltaT = (performance.now() - this.time) / 10;
        var actualValue = this.actualValue, targetValue = this.targetValue;

        if (targetValue != -1) {
            var diff = targetValue - actualValue;
            var prevValue = actualValue;

            if (diff > 0.0005) {
                actualValue += (diff * this.easingFactor + this.offset) * deltaT;
                if (actualValue > targetValue) {
                    actualValue = targetValue;
                    targetValue = -1;
                }
            }
            else if (diff < -0.0005) {
                actualValue += (diff * this.easingFactor - this.offset) * deltaT;
                if (actualValue < targetValue) {
                    actualValue = targetValue;
                    targetValue = -1;
                }
            }
            else {
                actualValue = targetValue;
                targetValue = -1;
            }

            if (targetValue == -1) {
                this.player.currentTime = actualValue * this.player.duration;

                if (this.dragging) {
                    this.player.changePlaybackRate(0);
                }
                else {
                    this.player.changePlaybackRate(1);
                    if (!this.player.paused) this.player.play();
                }
            }
            else {
                this.player.changePlaybackRate((actualValue - prevValue) * this.player.duration / (deltaT / 1000));
                this.player.currentTime = prevValue * this.player.duration;
            }
        }
        else {
            actualValue = this.player.currentTime / this.player.duration;
        }
        
        this.progress.style.width = actualValue * 100 + "%";
        this.actualValue = actualValue; this.targetValue = targetValue;
        
        if (this.onFrame) this.onFrame(this.player.currentTime);
        
        window.requestAnimationFrame(() => this.frame());
        
        this.time = performance.now();
    }
}
