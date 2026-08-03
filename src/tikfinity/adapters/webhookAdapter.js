const express = require('express');
const { config } = require('../../util/config');
const { childLogger } = require('../../util/logger');

const log = childLogger('tikfinity-webhook');

/**
 * Local HTTP receiver for TikFinity events.
 *
 * IMPORTANT - what this is and isn't:
 * TikFinity does not currently document a direct "call my local app on
 * every event" webhook for third-party integrations. Its documented,
 * supported integration surfaces (confirmed by inspecting the installed
 * app and TikFinity's own help/product pages) are:
 *   1. Browser Source / Link overlay widgets added into OBS or LIVE Studio
 *      (one-way visual output, not queryable by an external program), and
 *   2. TikFinity's "Actions & Events" system, which can trigger Streamer.bot
 *      actions (see https://tikfinity.zerody.one/streamerbot-integration).
 *
 * This endpoint exists so that path (2) has somewhere documented to land:
 * TikFinity's Streamer.bot integration triggers a Streamer.bot Action, and
 * that Action forwards the event here via Streamer.bot's built-in "Fetch
 * URL" sub-action (Core > Network). That sub-action is GET-only (URL +
 * headers, no request body), so /events accepts the event both ways:
 *   - POST with a JSON body (used by our own dashboard/tests, simulatedAdapter.js)
 *   - GET with the same fields as query-string parameters (used by
 *     Streamer.bot's Fetch URL sub-action, e.g. .../events?type=gift&user=%user%)
 * Both require the same X-Bridge-Token header, which Fetch URL's Headers
 * grid supports directly.
 */
function startWebhookAdapter(eventBridge) {
  if (!config.tikfinityBridge.enabled) {
    log.info('TikFinity webhook bridge disabled via config');
    return null;
  }

  const app = express();
  app.use(express.json({ limit: '256kb' }));

  function handleEvent(req, res, source) {
    const token = req.header('X-Bridge-Token');
    if (!config.tikfinityBridge.token || token !== config.tikfinityBridge.token) {
      res.status(401).json({ error: 'invalid or missing X-Bridge-Token' });
      return;
    }

    const { type, ...payload } = source;
    if (!type) {
      res.status(400).json({ error: 'missing "type" field' });
      return;
    }

    eventBridge.publish(type, payload);
    res.status(202).json({ accepted: true });
  }

  app.post('/events', (req, res) => handleEvent(req, res, req.body || {}));
  app.get('/events', (req, res) => handleEvent(req, res, req.query || {}));

  app.get('/health', (req, res) => res.json({ ok: true }));

  const server = app.listen(config.tikfinityBridge.port, config.tikfinityBridge.host, () => {
    log.info(`TikFinity webhook bridge listening on http://${config.tikfinityBridge.host}:${config.tikfinityBridge.port}/events`);
  });

  return server;
}

module.exports = { startWebhookAdapter };
