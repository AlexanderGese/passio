/** @param {any} passio */
export default async function init(passio) {
  passio.log("hello-seed booting");

  await passio.tools.register({
    name: "echo",
    description: "Echo back whatever you send — useful for verifying seeds work.",
    input: { type: "object", properties: { text: { type: "string" } } },
    execute: async ({ text }) => {
      passio.log("echo called with:", text);
      return { echoed: text, at: new Date().toISOString() };
    },
  });

  await passio.kv.set("bootCount", (await passio.kv.get("bootCount")) ?? 0) ?? null;
  const count = ((await passio.kv.get("bootCount")) ?? 0) + 1;
  await passio.kv.set("bootCount", count);
  passio.log(`boot #${count}`);
}
