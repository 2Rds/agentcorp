import { execSync } from "child_process";
import { existsSync } from "fs";

let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const { tool_input } = JSON.parse(input);
  const filePath = tool_input?.file_path;
  if (!filePath || !/\.(ts|tsx|js|jsx)$/.test(filePath) || !existsSync(filePath)) {
    process.exit(0);
  }
  try {
    execSync(`npx eslint --fix "${filePath}"`, { stdio: "pipe" });
  } catch {
    // Non-zero from eslint means warnings/errors remain — don't block
  }
});
