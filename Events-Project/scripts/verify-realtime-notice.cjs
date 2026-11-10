const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../context/SocketContext.tsx"), "utf8");
const start = source.indexOf("function RealtimeConnectionNotice(");
const end = source.indexOf("export function SocketProvider", start);
assert(start >= 0 && end > start, "RealtimeConnectionNotice must be available to exercise.");
const code = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
}).outputText;

// Exercise the real component with deterministic hooks and browser timers.
// This checks state transitions without a running server or real socket.
function createHarness() {
  const states = [];
  const timers = new Map();
  const calls = [];
  let cursor = 0;
  let effectDependencies;
  let cleanup;
  let pendingEffect;
  let now = 0;
  let nextTimer = 0;

  function useState(initial) {
    const index = cursor++;
    if (!(index in states)) states[index] = initial;
    return [states[index], value => {
      states[index] = typeof value === "function" ? value(states[index]) : value;
    }];
  }
  function useEffect(callback, dependencies) {
    if (!effectDependencies || dependencies.some((value, index) => value !== effectDependencies[index])) {
      effectDependencies = dependencies;
      pendingEffect = callback;
    }
  }
  const React = {
    Fragment: "fragment",
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  };
  const window = {
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, time: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  };
  const socket = {
    connected: false,
    disconnect: () => calls.push("disconnect"),
    connect: () => calls.push("connect"),
  };
  const context = vm.createContext({ useState, useEffect, React, window, socket });
  vm.runInContext(code, context);

  return {
    socket,
    calls,
    timers,
    render(waiting) {
      cursor = 0;
      pendingEffect = null;
      const tree = context.RealtimeConnectionNotice({ waiting });
      if (pendingEffect) {
        if (cleanup) cleanup();
        cleanup = pendingEffect();
      }
      return tree;
    },
    advance(duration) {
      const until = now + duration;
      for (let iterations = 0; ; iterations++) {
        assert(iterations < 100, "Notice timers must not create an automatic retry loop.");
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.time <= until)
          .sort((a, b) => a[1].time - b[1].time)[0];
        if (!next) break;
        now = next[1].time;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = until;
    },
    unmount() {
      if (cleanup) cleanup();
    },
  };
}

function text(node) {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  return (node.children || []).flat(Infinity).map(text).join(" ");
}
function findButton(node) {
  if (!node || typeof node !== "object") return null;
  if (node.type === "button") return node;
  return (node.children || []).flat(Infinity).map(findButton).find(Boolean);
}

const notice = createHarness();
assert(!text(notice.render(true)).includes("Conectando"), "Initial connection must not flash a notice.");
notice.advance(1499);
assert(!text(notice.render(true)).includes("Conectando"));
notice.advance(1);
let tree = notice.render(true);
assert(text(tree).includes("Conectando atualizações"));
assert.equal(tree.props.role, "status");
assert.equal(tree.props["aria-live"], "polite");
assert.equal(tree.props["aria-atomic"], "true");
notice.advance(43499);
assert(!text(notice.render(true)).includes("temporariamente indisponíveis"));
notice.advance(1);
tree = notice.render(true);
assert(text(tree).includes("temporariamente indisponíveis"));
assert(text(tree).includes("consultando os eventos"));
const button = findButton(tree);
assert(button, "An unavailable connection must expose manual retry.");
assert.equal(button.props.type, "button");
assert(button.props.className.includes("pointer-events-auto"));
assert(button.props.className.includes("focus-visible:outline"));
assert(button.props.className.includes("min-h-11"));
button.props.onClick();
assert.deepEqual(notice.calls, ["disconnect", "connect"]);
assert(text(notice.render(true)).includes("Conectando atualizações"));
notice.advance(44999);
assert(!text(notice.render(true)).includes("temporariamente indisponíveis"), "Manual retry restarts the timeout.");
notice.advance(1);
assert(text(notice.render(true)).includes("temporariamente indisponíveis"));
assert.deepEqual(notice.calls, ["disconnect", "connect"], "Timers must never disconnect or retry automatically.");
notice.render(false);
assert.equal(notice.timers.size, 0, "A restored connection cancels both timers.");
notice.advance(100000);
assert(!text(notice.render(false)).includes("Conectando"));
assert(!text(notice.render(true)).includes("Conectando"), "A later disconnection starts with the initial delay.");
assert.equal(notice.timers.size, 2);
notice.unmount();
assert.equal(notice.timers.size, 0, "Unmount cancels outstanding timers.");

const recoveredDuringDelay = createHarness();
recoveredDuringDelay.render(true);
recoveredDuringDelay.advance(500);
recoveredDuringDelay.render(false);
assert.equal(recoveredDuringDelay.timers.size, 0);
recoveredDuringDelay.advance(45000);
assert(!text(recoveredDuringDelay.render(false)).includes("indisponíveis"));

const alreadyConnected = createHarness();
alreadyConnected.render(true);
alreadyConnected.advance(45000);
const staleButton = findButton(alreadyConnected.render(true));
alreadyConnected.socket.connected = true;
staleButton.props.onClick();
assert.deepEqual(alreadyConnected.calls, [], "A stale retry button must not interrupt a recovered socket.");
alreadyConnected.unmount();

console.log("Realtime notice checks passed: delayed status, 45-second timeout, manual retry, accessible control, reconnect reset and timer cleanup.");
