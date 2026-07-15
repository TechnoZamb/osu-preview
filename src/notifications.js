import "./libs/webextension-polyfill.js";
import { sleep, alert } from "./functions.js";

export async function checkPendingNotifications() {
    // without the sleep, the alert box will be in a weird place
    await sleep(100);

    const pendingFirefoxNotice = (await browser.storage.local.get("pendingFirefoxNotice")).pendingFirefoxNotice;
    if (pendingFirefoxNotice) {
        await alert("1.2.0 news: osu! preview is now available on Firefox! <a href='linktobeadded' target='_blank'>Get it here</a>.");
        await browser.storage.local.remove("pendingFirefoxNotice");
    }
};
