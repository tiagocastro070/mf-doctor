import { createRoot } from "react-dom/client";
import Card from "./Card";

function App() {
  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Remote B (Standalone)</h1>
      <p>React version: 18.3.1 (latest)</p>
      <Card />
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
