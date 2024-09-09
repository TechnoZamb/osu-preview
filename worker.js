let canvas, ctx;
let triangleList;
let lastTime = 0;
let stopLoading = false;
let shown = false;


self.addEventListener("message", function(e) {
    switch (e.data[0]) {
        case "init": {
            canvas = e.data[1];
            ctx = canvas.getContext("2d");
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
                const deltaY = performance.now() - lastTime;

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
                ctx.fillStyle = "#2a146d00";
                ctx.fillRect(0, 0, canvas.width, canvas.height);


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
    }    
});
