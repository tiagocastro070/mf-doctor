import { useState } from "react";

export default function Widget() {
  const [count, setCount] = useState(0);

  return (
    <div
      style={{
        padding: "1rem",
        backgroundColor: "#f5f5f5",
        borderRadius: "8px",
        border: "1px solid #ddd",
        textAlign: "center",
      }}
    >
      <h3 style={{ margin: "0 0 0.5rem 0", color: "#333" }}>
        Widget from Remote C
      </h3>
      <p style={{ margin: "0 0 0.5rem 0", color: "#666" }}>Count: {count}</p>
      <button
        onClick={() => setCount((c) => c + 1)}
        style={{
          padding: "0.5rem 1rem",
          backgroundColor: "#9c27b0",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "1rem",
        }}
      >
        Increment
      </button>
    </div>
  );
}
