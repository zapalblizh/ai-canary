import { execFileSync } from "node:child_process";

const sql = process.argv.slice(2).join(" ");
if (!sql) {
    console.error('No query given.');
    process.exit(1);
}

const startsWithReadOnlyWord = /^(select|with|explain|pragma)\b/i.test(sql);
if (!startsWithReadOnlyWord) {
    console.error("Only SELECT, WITH, EXPLAIN, and PRAGMA are allowed.");
    process.exit(2);
}

try {
    execFileSync(
        "wrangler",
        ["d1", "execute", "ai-canary", "--remote", "--command", sql],
        { stdio: "inherit" },
    );
} catch (e) {
    process.exit(e.status ?? 1);
}
