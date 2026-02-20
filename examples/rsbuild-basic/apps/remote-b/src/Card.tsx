import { useState } from "react";

export default function Card() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: "8px",
        padding: "1rem",
        maxWidth: "300px",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        backgroundColor: "#fff",
      }}
    >
      <h3 style={{ margin: "0 0 0.5rem 0" }}>Card from Remote B</h3>
      <p style={{ margin: "0 0 1rem 0", color: "#666" }}>
        This is a card component exposed by Remote B.
      </p>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: "0.25rem 0.5rem",
          backgroundColor: "#f5f5f5",
          border: "1px solid #ddd",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        {expanded ? "Show Less" : "Show More"}
      </button>
      {expanded && (
        <p style={{ marginTop: "1rem", color: "#333" }}>
          Additional content revealed when expanded. This card uses React
          18.3.1.
        </p>
      )}
    </div>
  );
}
