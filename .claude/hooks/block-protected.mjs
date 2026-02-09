import { basename } from "path";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { tool_input } = JSON.parse(input);
  const filePath = tool_input?.file_path ?? "";
  const name = basename(filePath);
  if (/^\.env(\..*)?$/.test(name) || name === "package-lock.json") {
    process.stderr.write(`BLOCKED: ${name} is a protected file. Do not edit it directly.`);
    process.exit(2);
  }
});
