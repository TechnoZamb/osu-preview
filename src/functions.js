const { BlobReader, ZipReader } = zip;

export const mod = (a, n) => (a % n + n) % n;
export const clamp = (min, n, max) => Math.min(max, Math.max(min, n));
export const lerp = (min, max, t) => (max - min) * t + min;
export const range = (low1, high1, low2, high2, t) => (t - low1) / (high1 - low1) * (high2 - low2) + low2;
export const rgb = (val) => val.split?.(",").map?.(x => clamp(0, parseInt(x.trim()), 255)) ?? null;
export const sleep = async (ms) => await new Promise(r => setTimeout(r, ms));
export const distance = (p1, p2) => {
    if (!(p1 instanceof Array)) p1 = [p1.x, p1.y];
    if (!(p2 instanceof Array)) p2 = [p2.x, p2.y];
    return Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
}
export const $ = x => document.querySelector(x);
export const extractFile = async (blob) => {
    const zipReader = new ZipReader(new BlobReader(blob));
    const entries = await zipReader.getEntries();
    await zipReader.close();
    return entries;
}

export async function saveSkin(file) {
    try {
        const uint8arr = new Uint8Array(await file.arrayBuffer());
        const buffer = new Array(file.size);
        for (let i = 0; i < file.size; i++) {
            buffer[i] = String.fromCharCode(uint8arr[i]);
        }
        await browser.storage.local.set({ skin: buffer.join("") });

        let skinName = file.name;
        const lastPeriod = file.name.lastIndexOf(".");
        if (lastPeriod != -1) {
            skinName = skinName.substring(0, lastPeriod);
        }
        await browser.storage.local.set({ skinName: skinName });
        return true;
    } catch (error) {
        console.error("Error saving skin:", error);
        return false;
    }
}

export async function alert(message) {
    const alertBox = document.createElement("div");
    alertBox.classList.add("alert-box");
    alertBox.innerHTML = message;

    const closeButton = document.createElement("button");
    let closeCallback;
    closeButton.classList.add("btn-big", "blue");
    closeButton.textContent = "Ok";
    closeButton.addEventListener("click", () => {
        alertBox.setAttribute("closed", "");
        if (closeCallback) closeCallback();
    });

    alertBox.appendChild(closeButton);
    document.body.appendChild(alertBox);
    await new Promise(resolve => closeCallback = resolve);
}

export function showToast(message, duration = 3000) {
    const toastContainer = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;

    toastContainer.appendChild(toast);
    void toast.offsetHeight;
    toast.classList.add("show");

    const hide = () => {
        toast.classList.remove("show");
        toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    };

    setTimeout(hide, duration);
}
