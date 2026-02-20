import { useState, Suspense, lazy } from "react";

const RemoteAButton = lazy(() => import("remoteA/Button"));
const RemoteBCard = lazy(() => import("remoteB/Card"));

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Shell Application</h1>
      <p>This is the host/shell application that consumes remote modules.</p>

      <section style={{ marginTop: "2rem" }}>
        <h2>Local Counter</h2>
        <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Remote A - Button</h2>
        <Suspense fallback={<div>Loading Remote A...</div>}>
          <RemoteAButton />
        </Suspense>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Remote B - Card</h2>
        <Suspense fallback={<div>Loading Remote B...</div>}>
          <RemoteBCard />
        </Suspense>
      </section>
    </div>
  );
}
