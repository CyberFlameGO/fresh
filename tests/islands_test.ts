import { assert, delay, puppeteer, TextLineStream } from "./deps.ts";

Deno.test({
  name: "island tests",
  async fn(t) {
    // Preparation
    const serverProcess = Deno.run({
      cmd: ["deno", "run", "-A", "--no-check", "./tests/fixture/main.ts"],
      stdout: "piped",
      stderr: "inherit",
    });

    const decoder = new TextDecoderStream();
    const lines = serverProcess.stdout.readable
      .pipeThrough(decoder)
      .pipeThrough(new TextLineStream());

    let started = false;
    for await (const line of lines) {
      console.log(line);
      if (line.includes("Server listening on http://")) {
        started = true;
        break;
      }
    }
    if (!started) {
      throw new Error("Server didn't start up");
    }

    await delay(100);

    const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage();

    async function counterTest(counterId: string, originalValue: number) {
      const pElem = await page.waitForSelector(`#${counterId} > p`);
      let value = await pElem?.evaluate((el) => el.textContent);
      assert(value === `${originalValue}`, `${counterId} first value`);

      const buttonPlus = await page.$(`#b-${counterId}`);
      await buttonPlus?.click();
      value = await pElem?.evaluate((el) => el.textContent);
      assert(value === `${originalValue + 1}`, `${counterId} click`);
    }

    await page.goto("http://localhost:8000/islands", {
      waitUntil: "networkidle2",
    });

    await t.step("Ensure 2 islands on 1 page are revived", async () => {
      await counterTest("counter1", 3);
      await counterTest("counter2", 10);
    });

    await browser.close();

    await lines.cancel();
    serverProcess.kill("SIGTERM");
    serverProcess.close();
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
