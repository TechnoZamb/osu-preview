const clamp = (x, min = 0, max = 1) => Math.max(min, Math.min(max, x));
function checkpointValue(times, values, time) {
    if (!times?.length || time < times[0]) return 0;
    let lo = 0,
        hi = times.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (times[mid] <= time) lo = mid + 1;
        else hi = mid;
    }
    return values[Math.max(0, lo - 1)];
}
const formatTime = (ms) =>
    `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`;

export class StrainGraph {
    constructor({ wrapper, player, text, showPP = false }) {
        this.player = player;
        this.text = text;
        this.showPP = showPP;
        this.cache = new Map();
        this.requestId = 0;
        this.mods = [];
        this.result = null;
        this.worker = null;
        this.hover = false;
        this.dragging = false;
        this.hoverFraction = 0;
        this.lastTime = 0;
        this.displayPP = 0;
        this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        this.listeners = new AbortController();
        const signal = this.listeners.signal;
        this.panel = document.createElement('section');
        this.panel.id = 'strain-panel';
        this.panel.setAttribute('aria-label', 'Relative difficulty across the beatmap');
        this.panel.innerHTML = `<div class="strain-heading"><span class="strain-status">STRAIN</span></div>
            <svg class="strain-svg" viewBox="0 0 800 80" preserveAspectRatio="none" aria-hidden="true">
              <defs><clipPath id="strain-played-clip"><rect width="0" height="80"/></clipPath><clipPath id="strain-active-clip"></clipPath></defs>
              <g clip-path="url(#strain-active-clip)"><path class="strain-upcoming"/><path class="strain-played" clip-path="url(#strain-played-clip)"/></g>
            </svg><span class="strain-playhead"></span><span class="strain-hover-line"></span><span class="strain-tooltip"></span>`;
        wrapper.appendChild(this.panel);
        this.status = this.panel.querySelector('.strain-status');
        this.clip = this.panel.querySelector('rect');
        this.playhead = this.panel.querySelector('.strain-playhead');
        this.hoverLine = this.panel.querySelector('.strain-hover-line');
        this.tooltip = this.panel.querySelector('.strain-tooltip');
        this.hud = document.createElement('div');
        this.hud.id = 'pp-preview';
        this.hud.hidden = !showPP;
        this.hud.innerHTML = '<strong>…</strong><span>for SS</span>';
        wrapper.parentElement.querySelector("#more-tab").before(this.hud);
        this.ppNumber = this.hud.querySelector('strong');
        const pointer = (e) => {
            const box = wrapper.getBoundingClientRect();
            this.hoverFraction = clamp((e.clientX - box.left) / Math.max(1, box.width));
            this.updateHover();
        };
        wrapper.addEventListener(
            'mouseenter',
            (e) => {
                this.hover = true;
                this.visibility();
                pointer(e);
            },
            { signal },
        );
        wrapper.addEventListener(
            'mouseleave',
            () => {
                this.hover = false;
                this.visibility();
            },
            { signal },
        );
        wrapper.addEventListener('mousemove', pointer, { signal });
        wrapper.querySelector('#progress-bar').addEventListener(
            'mousedown',
            (e) => {
                this.dragging = true;
                this.visibility();
                pointer(e);
            },
            { signal },
        );
        window.addEventListener(
            'mousemove',
            (e) => {
                if (this.dragging) pointer(e);
            },
            { signal },
        );
        window.addEventListener(
            'mouseup',
            () => {
                this.dragging = false;
                this.visibility();
            },
            { signal },
        );
        window.addEventListener(
            'blur',
            () => {
                this.dragging = false;
                this.hover = false;
                this.visibility();
            },
            { signal },
        );
        window.addEventListener('pagehide', () => this.destroy(), { signal });
        this.request();
    }
    visibility() {
        this.panel.classList.toggle('is-visible', this.hover || this.dragging);
    }
    setShowPP(value) {
        this.showPP = value;
        this.hud.hidden = !value;
        if (value && !this.result?.pp) this.request();
        this.updateHover();
    }
    setMods(mods) {
        this.mods = [...mods].sort();
        this.result = null;
        this.clearGraph();
        this.ppNumber.textContent = '…';
        clearTimeout(this.debounce);
        this.requestId++;
        if (this.busy) this.stopWorker();
        this.status.textContent = 'STRAIN';
        this.debounce = setTimeout(() => this.request(), 120);
    }
    stopWorker() {
        clearTimeout(this.timeout);
        this.worker?.terminate();
        this.worker = null;
        this.busy = false;
    }
    request() {
        clearTimeout(this.debounce);
        const key = this.mods.join(','),
            cached = this.cache.get(key);
        if (cached && (!this.showPP || cached.pp)) {
            if (this.busy) this.stopWorker();
            this.requestId++;
            this.accept(cached);
            return;
        }
        if (this.busy) this.stopWorker();
        const id = ++this.requestId,
            load = !this.worker;
        try {
            if (load) {
                this.worker = new Worker(new URL('./difficulty/worker.js', import.meta.url), { type: 'module' });
                this.worker.onmessage = ({ data }) => {
                    if (data.id !== this.requestId) return;
                    clearTimeout(this.timeout);
                    this.busy = false;
                    if (data.error) {
                        this.fail(data.error);
                        return;
                    }
                    this.cache.delete(data.key);
                    this.cache.set(data.key, data);
                    if (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value);
                    this.accept(data);
                };
                const worker = this.worker;
                worker.onerror = (e) => {
                    e.preventDefault?.();
                    if (this.worker === worker) this.fail('Calculation unavailable');
                };
            }
            this.busy = true;
            this.timeout = setTimeout(() => this.fail('Map is too complex to calculate quickly'), 12000);
            this.worker.postMessage({
                id,
                type: load ? 'load' : 'calculate',
                text: load ? this.text : undefined,
                durationMs: this.player.duration * 1000,
                mods: this.mods,
                includePP: this.showPP,
            });
        } catch {
            this.fail('Calculation unavailable');
        }
    }
    fail(message) {
        this.stopWorker();
        this.status.textContent = message;
        this.ppNumber.textContent = '—';
    }
    accept(result) {
        const modOrder = ['hd', 'dt', 'hr', 'fl', 'ez', 'ht'];
        this.result = result;
        this.status.textContent = 'STRAIN • ' + (this.mods.length
            ? [...this.mods]
                  .sort((a, b) => modOrder.indexOf(a) - modOrder.indexOf(b))
                  .join('')
                  .toUpperCase()
            : 'NM');
        this.draw();
        this.update(this.lastTime, 0, true);
        this.updateHover();
    }
    clearGraph() {
        this.panel.querySelectorAll('path').forEach((p) => p.removeAttribute('d'));
    }
    draw() {
        const { graph, bucketMs } = this.result,
            duration = this.player.duration * 1000;
        if (!(duration > 0)) {
            this.clearGraph();
            return;
        }
        const activeClip = this.panel.querySelector('#strain-active-clip');
        activeClip.replaceChildren();
        const addActive = (start, end) => {
            if (end <= start) return;
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', String((start / duration) * 800));
            rect.setAttribute('width', String(((end - start) / duration) * 800));
            rect.setAttribute('height', '80');
            activeClip.appendChild(rect);
        };
        let activeStart = 0;
        for (const [start, end] of this.result.gaps ?? []) {
            addActive(activeStart, clamp(start, 0, duration));
            activeStart = clamp(end, 0, duration);
        }
        addActive(activeStart, duration);
        const columns = new Float32Array(800);
        let max = 0;
        for (let i = 0; i < graph.length && i * bucketMs <= duration; i++) {
            const x = Math.min(799, Math.floor(((i * bucketMs) / duration) * 800));
            columns[x] = Math.max(columns[x], graph[i]);
            max = Math.max(max, graph[i]);
        }
        const width = (bucketMs / duration) * 800;
        if (width > 1)
            for (let x = 0; x < 800; x++) {
                const index = x / width,
                    i = Math.floor(index),
                    f = index - i;
                columns[x] = (graph[i] ?? 0) * (1 - f) + (graph[i + 1] ?? 0) * f;
            }
        let d = 'M0 80';
        for (let x = 0; x < 800; x++) d += `L${x} ${(80 - (max ? columns[x] / max : 0) * 74).toFixed(2)}`;
        d += 'L800 80Z';
        this.panel.querySelectorAll('path').forEach((path) => path.setAttribute('d', d));
    }
    updateHover() {
        const percent = this.hoverFraction * 100,
            time = this.hoverFraction * this.player.duration * 1000;
        this.hoverLine.style.left = `${percent}%`;

        const pp = this.showPP && this.result?.pp;
        this.tooltip.textContent =
            formatTime(time) + (pp ? ` • ~${Math.round(checkpointValue(pp.times, pp.values, time))} SS PP` : '');

        const padding = 10; // in pixels, to avoid the tooltip being too close to the edges
        const minLeft = this.tooltip.offsetWidth * 0.5 + padding;
        const maxLeft = (this.panel.clientWidth - this.tooltip.offsetWidth * 0.5) - padding;
        this.tooltip.style.left = `${clamp(percent / 100 * this.panel.clientWidth, minLeft, maxLeft)}px`;
    }
    update(time, deltaMs = 16, snap = false) {
        const jumped = Math.abs(time - this.lastTime) > 750;
        this.lastTime = time;
        if (this.hover || this.dragging) {
            const fraction = clamp(time / Math.max(1, this.player.duration * 1000));
            this.clip.setAttribute('width', String(fraction * 800));
            this.playhead.style.left = `${fraction * 100}%`;
        }
        if (this.showPP && this.result?.pp) {
            const { times, values } = this.result.pp,
                target = checkpointValue(times, values, time);
            this.displayPP =
                jumped || snap || this.reducedMotion
                    ? target
                    : this.displayPP + (target - this.displayPP) * (1 - Math.exp(-Math.max(0, deltaMs) / 100));
            const text = String(Math.round(this.displayPP));
            if (this.ppNumber.textContent !== text) this.ppNumber.textContent = text;
        }
    }
    destroy() {
        this.stopWorker();
        clearTimeout(this.debounce);
        this.listeners.abort();
    }
}
