const AI_AGENTS = [
    "ClaudeBot",
    "Claude-User",
    "Claude-SearchBot",
    "anthropic-ai",
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    "Googlebot",
    "Bingbot",
    "Applebot",
    "Bytespider",
    "Amazonbot",
    "CCBot",
    "meta-externalagent",
    "FacebookBot",
    "DuckAssistBot",
    "cohere-ai",
    "YouBot",
    "Diffbot",
];

function classify(userAgent) {
    if (!userAgent) return "unknown-no-user-agent";

    const low = userAgent.toLowerCase();
    const hit = AI_AGENTS.find(
        (agent) => low.includes(agent.toLowerCase())
    );

    if (hit) return "ai:" + hit;
    if (/http-client|python|curl|go-http|node-fetch|axios|libcurl/.test(low))
        return "bot-generic";
    return "browser";
}

function safeRedirect(target, allowed) {
    if (!target) return null;
    let url;
    try {
        url = new URL(target);
    } catch {
        return null;
    }
    return allowed.includes(url.href) ? url.href : null;
}

function persistHit(env, ctx, record) {
    if (!env.DB) return;

    ctx.waitUntil(
        env.DB.prepare(
            `INSERT INTO hits (timestamp, ip, country, asn, network_org, method, usedlink, query, referer, useragent, accept, recordcategory, headers)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
            .bind(
                record.timestamp,
                record.ip,
                record.country,
                record.asn,
                record.networkOrg,
                record.method,
                record.usedlink,
                record.query,
                record.referer,
                record.userAgent,
                record.accept,
                record.recordCategory,
                JSON.stringify(record.headers),
            )
            .run(),
    );
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Only /webhook triggers tracking + redirect.
        if (url.pathname !== "/webhook")
            return new Response("Not found", { status: 404 });

        const userAgent = request.headers.get("user-agent") || "";
        const record = {
            timestamp: new Date().toISOString(),
            ip: request.headers.get("cf-connecting-ip") || "",
            country: (request.cf && request.cf.country) || "",
            asn: (request.cf && request.cf.asn) || null,
            networkOrg: (request.cf && request.cf.asOrganization) || "",
            method: request.method,
            usedlink: url.pathname.replace(/^\/+/, ""),
            query: url.search,
            referer: request.headers.get("referer") || "",
            userAgent,
            accept: request.headers.get("accept") || "",
            recordCategory: classify(userAgent),
            headers: Object.fromEntries([...request.headers]),
        };

        persistHit(env, ctx, record);

        const whitelist = (env.REDIRECT_WHITELIST || "")
            .split(",")
            .map((u) => u.trim())
            .filter(Boolean)
            .map((u) => {
                try {
                    return new URL(u).href;
                } catch {
                    return null;
                }
            })
            .filter(Boolean);
        
        const requested = url.searchParams.get("redirect");
        
        if (requested) {
            const safe = safeRedirect(requested, whitelist);
            if (!safe)
                return new Response("Redirect target not allowed", {
                    status: 400,
                });
            return Response.redirect(safe, 302);
        }

        return new Response("Not found", { status: 404 });
    },
};
