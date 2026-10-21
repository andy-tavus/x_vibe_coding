// Runtime-agnostic Tavus API handler for Vite projects with a server.
// Pair with `tavus-client.ts` (which calls POST /api/tavus from the browser).
//
// You wire `handleTavusRequest` into whatever middleware your server uses.
// The function takes a standard `Request` and returns a `Response`, so it
// works with any runtime that speaks Web fetch (h3, Hono, Cloudflare Workers,
// Bun.serve, vike-server, Vinxi, etc.).
//
// Set `TAVUS_API_KEY` in your server environment — never on the client.
// Get an API key: https://platform.tavus.io/api-keys
//
// ─── Wiring examples ──────────────────────────────────────────────────────
//
// Hono:
//   import { Hono } from 'hono';
//   import { handleTavusRequest } from './lib/tavus-api-vite-ssr';
//   const app = new Hono();
//   app.post('/api/tavus', (c) => handleTavusRequest(c.req.raw));
//
// h3 / Vinxi:
//   import { eventHandler, toWebRequest } from 'h3';
//   import { handleTavusRequest } from './lib/tavus-api-vite-ssr';
//   export default eventHandler((event) => handleTavusRequest(toWebRequest(event)));
//
// Express (with Web Fetch adapter, e.g. `@hattip/adapter-node`):
//   app.post('/api/tavus', async (req, res) => {
//     const webReq = toWebRequest(req); // your adapter
//     const webRes = await handleTavusRequest(webReq);
//     // pipe webRes back to `res`
//   });

const TAVUS_API_BASE = 'https://tavusapi.com/v2';

type Body =
	// `policy` is surfaced because it is a compliance flag — see the note below.
	| { action: 'create'; params?: Record<string, unknown> & { policy?: 'eu' } }
	| { action: 'end'; conversationId: string };

export async function handleTavusRequest(request: Request): Promise<Response> {
	if (request.method !== 'POST') {
		return new Response('Method not allowed', {
			status: 405,
			headers: { Allow: 'POST' },
		});
	}

	const apiKey = process.env.TAVUS_API_KEY;
	if (!apiKey) {
		return Response.json(
			{ error: 'TAVUS_API_KEY is not set in the server environment.' },
			{ status: 500 }
		);
	}

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	if (body.action === 'create') {
		// To force EU AI Act behavior for every conversation, set `policy: 'eu'`
		// here rather than relying on the caller — params come from the browser,
		// so a client can drop or alter them. Tavus does not geolocate callers,
		// so deciding when the policy applies is yours either way.
		// https://docs.tavus.io/sections/onboarding-guide/eu-ai-act
		const r = await fetch(`${TAVUS_API_BASE}/conversations`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
			body: JSON.stringify(body.params ?? {}),
		});
		if (!r.ok) {
			return Response.json(
				{ error: `Tavus create failed: ${await r.text()}` },
				{ status: r.status }
			);
		}
		return Response.json(await r.json());
	}

	if (body.action === 'end' && body.conversationId) {
		const r = await fetch(`${TAVUS_API_BASE}/conversations/${body.conversationId}/end`, {
			method: 'POST',
			headers: { 'x-api-key': apiKey },
		});
		if (!r.ok) {
			return Response.json({ error: `Tavus end failed: ${await r.text()}` }, { status: r.status });
		}
		return new Response(null, { status: 204 });
	}

	return Response.json({ error: 'Unknown action' }, { status: 400 });
}
