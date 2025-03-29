import { clamp } from "/functions.js";
import { volumes } from "/volumes.js";

export class MusicPlayer {
    static #initializing = false;

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

        let buffer;
        try {
            // decode song
            buffer = await player.audioContext.decodeAudioData(await file.arrayBuffer());
        }
        catch {
            // we just empty audio and for the duration we take the last hitobject's endtime and add 1 second
            const freq = 44100;
            buffer = player.audioContext.createBuffer(1, fallbackDuration * freq, freq);
        }
        const wavBlob = WAVBuilder.build(buffer);
        
        // wait for audio element to load song
        let callback;
        const promise = new Promise(r => callback = r);
        player.audio = Object.assign(document.createElement("audio"), { src: URL.createObjectURL(wavBlob), oncanplaythrough: callback });
        await Promise.all([promise]);

        // connect audio element to audio node
        player.audioContext.createMediaElementSource(player.audio).connect(volumes.music[1]);

        player.duration = player.audio.duration;
        player.playbackRate = 1;

        return player;
    }

    play() {
        this.currentTime = this.currentTime >= this.duration ? 0 : this.currentTime;
        if (this.onPlay) this.onPlay();
        this.audio.play();
        this.audioContext.resume();
    }

    pause() {
        this.currentTime = this.currentTime;
        if (this.onPause) this.onPause();
        this.audio.pause();
        this.audioContext.suspend();
    }

    softPlay() {
        this.audio.play();
        this.currentTime = this.currentTime;
    }

    changePlaybackRate(value) {
        if (value != 0) {
            value = clamp(0.5, Math.abs(value), 16);
        }
        this.audio.playbackRate = value;
        this.playbackRate = value;
    }

    get paused() {
        return this.audio.paused;
    }

    get currentTime() {
        return this.audio.currentTime;
    }

    set currentTime(value) {
        this.audio.currentTime = value;
    }
}

// https://stackoverflow.com/questions/62172398/convert-audiobuffer-to-arraybuffer-blob-for-wav-download
class WAVBuilder {
    static build(audioBuffer) {
        // Float32Array samples
        const [left, right] = [audioBuffer.getChannelData(0), audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : audioBuffer.getChannelData(0)];

        // interleaved
        const length = Math.min(left.length, right.length);
        const interleaved = new Float32Array(length * 2);
        for (let src = 0, dst = 0; src < length; src++, dst += 2) {
            interleaved[dst] = left[src];
            interleaved[dst + 1] = right[src];
        }

        // get WAV file bytes and audio params of your audio source
        const options = {
            isFloat: true,       // floating point or 16-bit integer
            numChannels: 2,
            sampleRate: 48000,
        };
        const wavBytes = WAVBuilder.getWavBytes(interleaved.buffer, options);

        return new Blob([wavBytes], { type: 'audio/wav' });
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
