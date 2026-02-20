import { createRoot } from "react-dom/client";
import Button from "./Button";

function App() {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Remote A (Standalone)</h1>
      <p>React version: 18.2.0 (intentional drift)</p>
      <Button />
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
