import "./libs/webextension-polyfill.js";
import { sleep } from "./functions.js";

export async function checkPendingNotifications() {
    // without the sleep, the alert box will be in a weird place
    await sleep(100);

    const pendingFirefoxNotice = (await browser.storage.local.get("pendingFirefoxNotice")).pendingFirefoxNotice;
    if (pendingFirefoxNotice) {
        await alert("1.2.0 news: osu! preview is now available on Firefox! <a href='linktoadd' target='_blank'>Get it here</a>.");
        await browser.storage.local.remove("pendingFirefoxNotice");
    }
};

async function alert(message) {
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
