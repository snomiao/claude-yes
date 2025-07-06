import { fromStdio } from "from-node-stream";
import { exec } from "node:child_process";
import sflow from "sflow";

it('built', async () => {
    await Bun.$`bun run build`
        .then(() => {
            console.log('Build successful');
        })
})

it('works', async () => {
    // Note: build before running these tests
    const p = exec(`node dist/index.js`)
    console.log(await sflow('hello\r\n').by(fromStdio(p)).log().text())
});