let canvas, ctx;
let triangleList;
let gradient;
let startTime, lastTime = 0;
let stopLoading = false;
let shown = false, showSpinner = true;
let value = null;
const chaseDuration = 2000, rotateDuration = 2000;
const smallestArc = 0.3, stopDuration = 0.1;


self.addEventListener("message", function(e) {
    switch (e.data[0]) {
        case "init": {
            canvas = e.data[1];
            ctx = canvas.getContext("2d");
            startTime = performance.now();

            // create gradient
            gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, "#ffffffd1");
            gradient.addColorStop(1, "#ffffff33");
            break;
        }
        case "show": {
            let lastx = 0;

            const getRandomTimeout = () => Math.random() * 400;

            let fakeTime = 0;
            triangleList = Array.from(Array(300)).map(generator);
            triangleList.forEach(x => {
                x.startTime = fakeTime += getRandomTimeout();
                x.y -= x.speed * x.startTime;
            });
            lastTime = performance.now();
            stopLoading = false;
            shown = true;

            (function gen() {
                const t = generator();
                t.y = 600 + t.radius + 30;
                triangleList.push(t);
                if (!stopLoading) setTimeout(gen, getRandomTimeout());
            })();

            (function inner() {
                const now = performance.now();
                const deltaY = now - lastTime;

                ctx.globalCompositeOperation = "source-over";
                ctx.globalAlpha = 1;
                ctx.clearRect(0, 0, canvas.width, canvas.height);


                for (let i = 0; i < triangleList.length; i++) {
                    const triangle = triangleList[i];

                    // move triangle
                    triangle.y -= triangle.speed * deltaY;

                    // if out of screen, remove
                    if (triangle.y + triangle.radius * 0.5 + 300 < 0) {
                        triangleList.splice(i, 1);
                        i--;
                        continue;
                    }

                    // draw triangle
                    ctx.strokeStyle = "#ffffff50";
                    ctx.lineWidth = triangle.width;
                    ctx.beginPath();
                    ctx.moveTo(triangle.x, triangle.y - triangle.radius);
                    ctx.lineTo(triangle.x + triangle.radius * 0.86, triangle.y + triangle.radius * 0.5);
                    ctx.lineTo(triangle.x - triangle.radius * 0.86, triangle.y + triangle.radius * 0.5);
                    ctx.closePath();
                    ctx.stroke();
                }

                if (showSpinner) {
                    ctx.fillStyle = gradient;
                    ctx.globalCompositeOperation = "destination-out";
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    const deltaStart = now - startTime;
                    let startAngle, endAngle;
                    if (value === null) {
                        startAngle = deltaStart % chaseDuration < (chaseDuration * 0.5) ?
                            -smallestArc :
                            smallestArc * 1.001 + clamp(0, (deltaStart % chaseDuration / chaseDuration - 0.5) * 2 * (1 + stopDuration * 2) - stopDuration, 1) * (2 * Math.PI - 2 * smallestArc);
                        endAngle = deltaStart % chaseDuration < (chaseDuration * 0.5) ?
                            smallestArc + clamp(0, (deltaStart % chaseDuration * 2) / chaseDuration * (1 + stopDuration * 2) - stopDuration, 1) * (2 * Math.PI - 2 * smallestArc) :
                            smallestArc;
                    }
                    else {
                        startAngle = 0;
                        endAngle = value * 2 * Math.PI;
                    }
                    startAngle += now / rotateDuration * 2 * Math.PI;
                    endAngle += now / rotateDuration * 2 * Math.PI;
                    ctx.strokeStyle = "#ffffff";
                    ctx.globalAlpha = 1;
                    ctx.lineWidth = 12;
                    ctx.globalCompositeOperation = "source-over";
                    ctx.beginPath();
                    ctx.arc(800 / 2, 600 / 2, 63 - 6, startAngle - Math.PI * 0.5, endAngle - Math.PI * 0.5, false);
                    ctx.stroke();
                }


                lastTime = performance.now();
                if (!stopLoading) self.requestAnimationFrame(inner);
            })();

            function generator() {
                let x;
                do {
                    x = Math.random() * 850 - 50;
                }
                while (Math.abs(x - lastx) < 100);
                lastx = x;
                const radius = (Math.tan(Math.random() * 3 - 1.5) / 7 + 2) / 4 * 100 + 30;
                return {
                    x: x,
                    y: 600 + radius + 30,
                    speed: Math.random() * 0.07 + 0.05,
                    radius: radius,
                    width: Math.random() * 7 + 3
                }
            }
            break;
        }
        case "hide": {
            stopLoading = true;
            shown = false;
            break;
        }
        case "setValue": {
            value = e.data[1];
            break;
        }
        case "setValue": {
            value = null;
            break;
        }
        case "error": {
            showSpinner = false;
            break;
        }
    }
});

const clamp = (min, n, max) => Math.min(max, Math.max(min, n));