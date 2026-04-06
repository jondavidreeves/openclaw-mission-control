import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { MissionControlService } from './service.js';
import type { StreamEnvelope } from './types.js';

export type MissionControlServerOptions = {
  port?: number;
  host?: string;
};

export function createMissionControlServer(service: MissionControlService = new MissionControlService()) {
  const clients = new Set<ServerResponse<IncomingMessage>>();

  const sendEvent = (event: StreamEnvelope) => {
    const payload = `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) {
      client.write(payload);
    }
  };

  let lastRuntimeCursor = service.getMissionControlBoard().runtime.cursor;

  const heartbeat = setInterval(() => {
    const snapshot = service.getOperatorSnapshot();
    const now = new Date().toISOString();
    const heartbeatEvent: StreamEnvelope = {
      id: `tick-${Date.now()}`,
      type: 'heartbeat',
      ts: now,
      payload: {
        overview: snapshot.overview.summary,
        board: snapshot.board.summary,
        runtime: snapshot.board.runtime,
      },
    };
    sendEvent(heartbeatEvent);

    if (snapshot.board.runtime.cursor && snapshot.board.runtime.cursor !== lastRuntimeCursor) {
      lastRuntimeCursor = snapshot.board.runtime.cursor;
      sendEvent({
        id: `runtime-${Date.now()}`,
        type: 'runtime.snapshot',
        ts: now,
        payload: snapshot,
      });

      for (const runtimeEvent of snapshot.events.slice(0, 8)) {
        sendEvent({
          id: `${runtimeEvent.id}`,
          type: 'runtime.event',
          ts: runtimeEvent.occurredAt,
          payload: runtimeEvent,
        });
      }
    }
  }, 15_000);

  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        return json(res, 400, { error: 'Missing request URL' });
      }

      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'OPTIONS') {
        return withCors(res, 204).end();
      }

      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, service.getHealth());
      if (req.method === 'GET' && url.pathname === '/api/overview') return json(res, 200, service.getOverview());
      if (req.method === 'GET' && url.pathname === '/api/teams/factory-floor') return json(res, 200, service.getFactoryFloor());
      if (req.method === 'GET' && url.pathname === '/api/teams/pipeline') return json(res, 200, service.getPipeline());
      if (req.method === 'GET' && url.pathname === '/api/teams/roles') return json(res, 200, service.getRoleCoverage());
      if (req.method === 'GET' && url.pathname === '/api/teams/activity') return json(res, 200, service.getActivity());
      if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, service.getAgents());
      if (req.method === 'GET' && url.pathname === '/api/tasks') return json(res, 200, service.getTasks());
      if (req.method === 'GET' && url.pathname === '/api/events') return json(res, 200, service.getEvents());
      if (req.method === 'GET' && url.pathname === '/api/settings') return json(res, 200, service.getSettings());
      if (req.method === 'GET' && url.pathname === '/api/sources') return json(res, 200, await service.getSources());
      if (req.method === 'GET' && url.pathname === '/api/mission-control/board') return json(res, 200, service.getMissionControlBoard());

      const agentMatch = matchPath(url.pathname, '/api/agents/');
      if (req.method === 'GET' && agentMatch) {
        const agent = service.getAgent(agentMatch);
        return agent ? json(res, 200, agent) : json(res, 404, { error: 'Agent not found' });
      }

      const taskMatch = matchPath(url.pathname, '/api/tasks/');
      if (req.method === 'GET' && taskMatch) {
        const task = service.getTask(taskMatch);
        return task ? json(res, 200, task) : json(res, 404, { error: 'Task not found' });
      }

      if (req.method === 'GET' && url.pathname === '/api/stream') {
        withCors(res, 200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write(`retry: 5000\n\n`);
        clients.add(res);
        sendSse(res, {
          id: `bootstrap-${Date.now()}`,
          type: 'snapshot',
          ts: new Date().toISOString(),
          payload: service.getOperatorSnapshot(),
        });

        req.on('close', () => {
          clients.delete(res);
          res.end();
        });
        return;
      }

      return json(res, 404, { error: 'Not found' });
    } catch (error) {
      return json(res, 500, {
        error: 'Internal server error',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  server.on('close', () => {
    clearInterval(heartbeat);
    for (const client of clients) {
      client.end();
    }
    clients.clear();
    service.close();
  });

  return {
    server,
    listen(options: MissionControlServerOptions = {}) {
      const port = options.port ?? Number(process.env.MISSION_CONTROL_API_PORT ?? 8787);
      const host = options.host ?? process.env.MISSION_CONTROL_API_HOST ?? '127.0.0.1';
      return new Promise<{ port: number; host: string }>((resolve) => {
        server.listen(port, host, () => resolve({ port, host }));
      });
    },
  };
}

function matchPath(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const value = pathname.slice(prefix.length).trim();
  return value.length ? decodeURIComponent(value) : null;
}

function withCors(res: ServerResponse, statusCode: number, headers: Record<string, string> = {}): ServerResponse {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  });
  return res;
}

function json(res: ServerResponse, statusCode: number, body: unknown): void {
  withCors(res, statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function sendSse(res: ServerResponse, event: StreamEnvelope): void {
  res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
