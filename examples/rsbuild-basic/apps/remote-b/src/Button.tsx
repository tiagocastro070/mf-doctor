import { useState } from "react";

export default function Button() {
  const [clicked, setClicked] = useState(false);

  return (
    <button
      onClick={() => setClicked(!clicked)}
      style={{
        padding: "0.75rem 1.5rem",
        backgroundColor: clicked ? "#28a745" : "#007bff",
        color: "#fff",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontWeight: "bold",
        transition: "background-color 0.2s",
      }}
    >
      {clicked ? "Clicked!" : "Button from Remote B"}
    </button>
  );
}
