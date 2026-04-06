import { createMissionControlServer } from './http.js';

const app = createMissionControlServer();

app.listen().then(({ host, port }) => {
  console.log(`Mission Control API listening on http://${host}:${port}`);
});
