import React from "react";

export const Card = ({ title, children }) => {
  return (
    <div
      style={{ border: "1px solid #ccc", padding: "16px", borderRadius: "8px" }}
    >
      <h3>{title}</h3>
      {children}
    </div>
  );
};

export default Card;
