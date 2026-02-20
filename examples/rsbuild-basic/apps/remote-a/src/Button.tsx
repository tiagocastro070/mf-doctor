import { useState } from "react";

export default function Button() {
  const [clicked, setClicked] = useState(false);

  return (
    <button
      onClick={() => setClicked(true)}
      style={{
        padding: "0.5rem 1rem",
        backgroundColor: clicked ? "#4caf50" : "#2196f3",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
        fontSize: "1rem",
      }}
    >
      {clicked ? "Clicked!" : "Button from Remote A"}
    </button>
  );
}
