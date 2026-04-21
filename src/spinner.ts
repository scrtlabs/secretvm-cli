const FRAMES = ["|", "/", "-", "\\"];
const INTERVAL_MS = 100;

export function startSpinner(text: string): () => void {
    if (!process.stdout.isTTY) {
        return () => {};
    }

    let frameIndex = 0;

    const render = () => {
        const frame = FRAMES[frameIndex % FRAMES.length];
        process.stdout.write(`\r${frame} ${text}`);
        frameIndex++;
    };

    render();
    const handle = setInterval(render, INTERVAL_MS);

    return () => {
        clearInterval(handle);
        process.stdout.write("\r\x1b[K");
    };
}
