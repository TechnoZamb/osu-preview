import { clamp } from "./functions.js";
import { volumes } from "./volumes.js";

export class MusicPlayer {
    static #initializing = false;

    buffer = null;
    source = null;
    startTime = 0;
    pauseTime = 0;
    isPlaying = false;
    playbackRate = 1;

    constructor() {
        if (!MusicPlayer.#initializing)
            throw new TypeError("Use MusicPlayer.init()");
        MusicPlayer.#initializing = false;
    }

    static async init(file, fallbackDuration) {
        MusicPlayer.#initializing = true;
        const player = new MusicPlayer();

        if (!(file instanceof Blob)) {
            file = await fetch(file).then(r => r.blob());
        }

        player.audioContext = new AudioContext();
        player.audioContext.suspend();

        // create gain nodes for volumes
        var gainNode = player.audioContext.createGain();
        gainNode.gain.value = volumes.general[0];
        gainNode.connect(player.audioContext.destination);
        volumes.general[1] = gainNode;

        gainNode = player.audioContext.createGain();
        gainNode.gain.value = volumes.effects[0];
        gainNode.connect(volumes.general[1]);
        volumes.effects[1] = gainNode;

        gainNode = player.audioContext.createGain();
        gainNode.gain.value = volumes.music[0];
        gainNode.connect(volumes.general[1]);
        volumes.music[1] = gainNode;

        try {
            // decode song
            player.buffer = await player.audioContext.decodeAudioData(await file.arrayBuffer());
        }
        catch {
            // we just create an empty audio and for the duration we take the last hitobject's endtime and add 1 second
            const freq = 48000;
            player.buffer = player.audioContext.createBuffer(1, fallbackDuration * freq, freq);
        }

        player.duration = player.buffer.duration;
        player.playbackRate = 1;

        return player;
    }

    #startSource(offset) {
        if (this.source) {
            try { this.source.stop(0); this.source.disconnect(); } catch (e) { }
        }

        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.playbackRate.value = this.playbackRate;
        this.source.connect(volumes.music[1]);

        this.startTime = this.audioContext.currentTime;
        this.pauseTime = clamp(0, offset, this.duration);

        this.source.start(0, this.pauseTime);
        this.isPlaying = true;
    }

    play() {
        this.currentTime = this.currentTime >= this.duration ? 0 : this.currentTime;

        if (this.onPlay) this.onPlay();

        this.#startSource(this.pauseTime);
        this.audioContext.resume();
    }

    pause() {
        this.pauseTime = this.currentTime;
        if (this.onPause) this.onPause();

        if (this.source) {
            try { this.source.stop(0); this.source.disconnect(); } catch (e) { }
            this.source = null;
        }
        this.isPlaying = false;
        this.audioContext.suspend();
    }

    softPlay() {
        this.#startSource(this.pauseTime);
    }

    changePlaybackRate(value) {
        if (value != 0) {
            value = clamp(0.5, Math.abs(value), 8);
        }

        const correctTime = this.currentTime;
        this.playbackRate = value;

        if (this.isPlaying) {
            this.pauseTime = correctTime;
            this.startTime = this.audioContext.currentTime;
            if (this.source) {
                this.source.playbackRate.value = value;
            }
        }
    }

    get paused() {
        return !this.isPlaying;
    }

    get currentTime() {
        if (!this.isPlaying) {
            return this.pauseTime;
        }
        return (this.audioContext.currentTime - this.startTime) * this.playbackRate + this.pauseTime;
    }

    set currentTime(value) {
        const targetTime = clamp(0, value, this.duration);

        if (this.isPlaying) {
            this.#startSource(targetTime);
        } else {
            this.pauseTime = targetTime;
        }
    }
}
