import assert from 'node:assert/strict';
import test from 'node:test';
import { withViteServer } from './support/vite-server.js';

async function fetchText(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `${url} returned ${response.status}`);
  return response.text();
}

test('served app shell and critical assets load through HTTP', {
  skip: process.env.CI === 'true' ? 'Vite dev-server smoke is local-only; CI verifies static tests and production build.' : false,
}, async () => {
  await withViteServer(async (baseUrl) => {
    const html = await fetchText(`${baseUrl}/`);

    assert.match(html, /Takeoff — Plan Measurement Tool/);
    assert.match(html, /href="(?:\.\/|\/)app\/styles\.css(?:\?[^"]+)?"/);
    assert.match(html, /src="(?:\.\/|\/)src\/main\.js(?:\?[^"]+)?"/);

    const [styles, main, pointerController, sidebarView, selectionController, marqueeController] = await Promise.all([
      fetchText(`${baseUrl}/app/styles.css`),
      fetchText(`${baseUrl}/src/main.js`),
      fetchText(`${baseUrl}/src/app/pointer-controller.js`),
      fetchText(`${baseUrl}/src/app/sidebar-view.js`),
      fetchText(`${baseUrl}/src/app/selection-controller.js`),
      fetchText(`${baseUrl}/src/app/marquee-controller.js`),
    ]);

    assert.match(styles, /body\.no-document/);
    assert.match(main, /TakeoffPathTemplateView/);
    assert.match(pointerController, /TakeoffPointerController/);
    assert.match(sidebarView, /TakeoffSidebarView/);
    assert.match(selectionController, /TakeoffSelectionController/);
    assert.match(marqueeController, /TakeoffMarqueeController/);
  });
});
