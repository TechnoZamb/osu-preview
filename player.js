import { clamp } from "/functions.js";
import { volumes } from "/volumes.js";

export class MusicPlayer {
    static #initializing = false;

    constructor() {
        if (!MusicPlayer.#initializing)
            throw new TypeError("Use MusicPlayer.init()");
        MusicPlayer.#initializing = false;
    }

    static async init(file) {
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

        // load song
        const buffer = await player.audioContext.decodeAudioData(await file.arrayBuffer());
        const [ forwards, backwards ] = WAVBuilder.build(buffer);
        
        // wait for audio elements to be ready
        let callback1, callback2;
        const promises = [ new Promise(r => callback1 = r), new Promise(r => callback2 = r) ];
        player.forwards = Object.assign(document.createElement("audio"), { src: URL.createObjectURL(forwards), oncanplaythrough: callback1 });
        player.backwards = Object.assign(document.createElement("audio"), { src: URL.createObjectURL(forwards), oncanplaythrough: callback2 });
        await Promise.all(promises);

        const f = player.audioContext.createMediaElementSource(player.forwards);
        const b = player.audioContext.createMediaElementSource(player.backwards);
        f.connect(volumes.music[1]);
        b.connect(volumes.music[1]);
        
        player.duration = player.forwards.duration;
        player.playbackRate = 1;

        player.playEvent = new Event("play");
        player.pauseEvent = new Event("pause");

        return player;
    }

    play() {
        if (this.playbackRate >= 0) {
            this.forwards.play();
        }
        else {
            this.backwards.play();
        }
        this.currentTime = this.currentTime;
        this.audioContext.resume();
        
        if (this.onPlay) this.onPlay();
    }

    pause() {
        this.audioContext.suspend();
        this.forwards.pause();
        this.backwards.pause();

        if (this.onPause) this.onPause();
    }

    changePlaybackRate(value) {
        if (value > 0) {
            value = clamp(0.063, value, 16);
            this.forwards.playbackRate = value;
            if (!this.backwards.paused) {
                this.backwards.pause();
                this.forwards.currentTime = this.duration - this.backwards.currentTime;
                this.forwards.play();
            }
        }
        else if (value < 0) {
            if (value > -0.063) value = -0.063;
            if (value < -16) value = -16;
            this.backwards.playbackRate = -value;
            if (!this.forwards.paused) {
                this.forwards.pause();
                this.backwards.currentTime = this.duration - this.forwards.currentTime;
                this.backwards.play();
            }
        }
        else {
            this.audioContext.suspend();
            if (!this.forwards.paused)
                this.forwards.playbackRate = 0;
            else
                this.backwards.playbackRate = 0;
        }
        this.playbackRate = value;
    }

    get paused() {
        return this.forwards.paused && this.forwards.paused;
    }

    get currentTime() {
        if (this.playbackRate >= 0)
            return this.forwards.currentTime;
        else
            return this.duration - this.backwards.currentTime;
    }

    set currentTime(value) {
        this.forwards.currentTime = value;
        this.backwards.currentTime = this.duration - value;
    }
}

// https://stackoverflow.com/questions/62172398/convert-audiobuffer-to-arraybuffer-blob-for-wav-download
class WAVBuilder {
    static build(audioBuffer) {
        // Float32Array samples
        const [left, right] = [audioBuffer.getChannelData(0), audioBuffer.getChannelData(1)];

        // interleaved
        const length = Math.min(left.length, right.length);
        const interleaved1 = new Float32Array(length * 2);
        const interleaved2 = new Float32Array(length * 2);
        for (let src = 0, dst = 0; src < length; src++, dst += 2) {
            interleaved1[dst] = left[src];
            interleaved1[dst + 1] = right[src];
            interleaved2[dst] = left[length - src - 1];
            interleaved2[dst + 1] = right[length - src - 1];
        }

        // get WAV file bytes and audio params of your audio source
        const options = {
            isFloat: true,       // floating point or 16-bit integer
            numChannels: 2,
            sampleRate: 48000,
        };
        const wavBytes1 = WAVBuilder.getWavBytes(interleaved1.buffer, options);
        const wavBytes2 = WAVBuilder.getWavBytes(interleaved2.buffer, options);

        return [ new Blob([wavBytes1], { type: 'audio/wav' }), new Blob([wavBytes2], { type: 'audio/wav' }) ];
    }

    // Returns Uint8Array of WAV bytes
    static getWavBytes(buffer, options) {
        const type = options.isFloat ? Float32Array : Uint16Array
        const numFrames = buffer.byteLength / type.BYTES_PER_ELEMENT

        const headerBytes = WAVBuilder.getWavHeader(Object.assign({}, options, { numFrames }))
        const wavBytes = new Uint8Array(headerBytes.length + buffer.byteLength);

        // prepend header, then add pcmBytes
        wavBytes.set(headerBytes, 0)
        wavBytes.set(new Uint8Array(buffer), headerBytes.length)

        return wavBytes
    }

    // adapted from https://gist.github.com/also/900023
    // returns Uint8Array of WAV header bytes
    static getWavHeader(options) {
        const numFrames = options.numFrames
        const numChannels = options.numChannels || 2
        const sampleRate = options.sampleRate || 44100
        const bytesPerSample = options.isFloat ? 4 : 2
        const format = options.isFloat ? 3 : 1

        const blockAlign = numChannels * bytesPerSample
        const byteRate = sampleRate * blockAlign
        const dataSize = numFrames * blockAlign

        const buffer = new ArrayBuffer(44)
        const dv = new DataView(buffer)

        let p = 0

        function writeString(s) {
            for (let i = 0; i < s.length; i++) {
                dv.setUint8(p + i, s.charCodeAt(i))
            }
            p += s.length
        }

        function writeUint32(d) {
            dv.setUint32(p, d, true)
            p += 4
        }

        function writeUint16(d) {
            dv.setUint16(p, d, true)
            p += 2
        }

        writeString('RIFF')              // ChunkID
        writeUint32(dataSize + 36)       // ChunkSize
        writeString('WAVE')              // Format
        writeString('fmt ')              // Subchunk1ID
        writeUint32(16)                  // Subchunk1Size
        writeUint16(format)              // AudioFormat https://i.stack.imgur.com/BuSmb.png
        writeUint16(numChannels)         // NumChannels
        writeUint32(sampleRate)          // SampleRate
        writeUint32(byteRate)            // ByteRate
        writeUint16(blockAlign)          // BlockAlign
        writeUint16(bytesPerSample * 8)  // BitsPerSample
        writeString('data')              // Subchunk2ID
        writeUint32(dataSize)            // Subchunk2Size

        return new Uint8Array(buffer)
    }
}
